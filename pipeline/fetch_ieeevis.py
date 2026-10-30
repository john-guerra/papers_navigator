"""Scrape the IEEE VIS program site into the normalized papers format.

Usage: python -m pipeline.fetch_ieeevis --conference ieeevis2026 [--refresh]

The listing is always re-downloaded; paper/session pages come from the cache unless --refresh.
After each run, prints what changed vs the previous papers.raw.json.
"""

import argparse
import hashlib
import json
import os
import re
import tempfile
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from pipeline.changes import diff_papers, format_changes
from pipeline.normalize import normalize_record

ROOT = Path(__file__).resolve().parent.parent
USER_AGENT = "papers-navigator (https://github.com/john-guerra/papers_navigator)"
_last_request = 0.0


def _text(node):
    return node.get_text(" ", strip=True) if node else None


def parse_listing(html: str, base_url: str = "https://ieeevis.org") -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    items = []
    for card in soup.select("article.program-card"):
        if card.get("data-type") == "session-role" or not card.get("data-paper-id"):
            continue
        link = card.select_one("a.program-card__title-link")
        start_ms = card.get("data-start-ms")
        items.append(
            {
                "id": card["data-paper-id"],
                "type": card.get("data-type"),
                "typeLabel": _text(card.select_one(".program-card__eyebrow")),
                "eventName": card.get("data-event"),
                "sessionKey": card.get("data-session-key"),
                "startMs": int(start_ms) if start_ms else None,
                "url": urljoin(base_url, link["href"]) if link else None,
                "award": card.get("data-award") or None,
            }
        )
    return items


def _parse_authors(soup) -> list[dict]:
    meta = soup.select_one(".paper-hero__meta p")
    if not meta:
        return []
    authors = []
    for span in meta.find_all("span", recursive=False):
        name = next(
            (a for a in span.find_all("a") if "bluesky-profile-link" not in (a.get("class") or [])),
            None,
        )
        if not name:
            continue
        affiliation = None
        for inner in span.find_all("span"):
            match = re.match(r"^\s*\((.*)\)\s*$", inner.get_text())
            if match:
                affiliation = match.group(1).strip()
                break
        authors.append({"name": name.get_text(strip=True), "affiliation": affiliation})
    return authors


def _presentation_value(soup, label):
    for dt in soup.select("dl.presentation-details dt"):
        if dt.get_text(strip=True) == label:
            return dt.find_next_sibling("dd")
    return None


def parse_paper(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    session_dd = _presentation_value(soup, "Session")
    session_link = session_dd.find("a") if session_dd else None
    time_dd = _presentation_value(soup, "Time")
    talk_time = time_dd.select_one("[data-tz-start]") if time_dd else None
    note = time_dd.select_one(".presentation-details__note [data-tz-start]") if time_dd else None
    room_dd = _presentation_value(soup, "Room")

    links = {}
    for a in soup.select(".paper-links a[href]"):
        label = a.get_text(" ", strip=True).replace("(opens in new tab)", "").strip()
        href = a["href"]
        if not href.startswith("http") or not label or "Sign in" in label or label.startswith("Paper PDF"):
            continue
        links.setdefault(href, {"label": label, "url": href})

    return {
        "title": _text(soup.find("h1")),
        "authors": _parse_authors(soup),
        "keywords": [
            s.get_text(strip=True).rstrip(",").strip()
            for s in soup.select(".paper-keywords span")
            if s.get_text(strip=True)
        ],
        "sessionName": _text(session_link),
        "sessionId": session_link["href"].rstrip("/").split("/")[-1] if session_link else None,
        "start": talk_time.get("data-tz-start") if talk_time else None,
        "end": talk_time.get("data-tz-end") if talk_time else None,
        "sessionStart": note.get("data-tz-start") if note else None,
        "sessionEnd": note.get("data-tz-end") if note else None,
        "room": _text(room_dd),
        "abstract": _text(soup.select_one(".paper-abstract p")),
        "links": list(links.values()),
    }


def parse_session(html: str) -> dict:
    """Session page: title, room and time (used for workshops/challenges whose pages lack them)."""
    soup = BeautifulSoup(html, "html.parser")
    room = None
    for meta in soup.select("p.program-event-meta"):
        label = meta.find("strong")
        if label and label.get_text(strip=True).rstrip(":") == "Room":
            room = meta.get_text(" ", strip=True).split(":", 1)[1].strip() or None
    when = soup.select_one(".program-event-meta [data-tz-start]")
    return {
        "sessionName": _text(soup.find("h1")),
        "room": room,
        "sessionStart": when.get("data-tz-start") if when else None,
        "sessionEnd": when.get("data-tz-end") if when else None,
    }


def decode_body(content: bytes) -> str:
    """The site serves UTF-8 without a charset header; never trust requests' Latin-1 guess."""
    return content.decode("utf-8", errors="replace")


def repair_mojibake(text: str) -> str:
    """Undo UTF-8 text that was decoded as Latin-1 (older cache files); leave good text alone."""
    try:
        return text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text


def assign_short_ids(ids: list[str], min_len: int = 8) -> dict[str, str]:
    """Shortest common prefix length (>= min_len) that keeps every id unique."""
    length = min_len
    while len({i[:length] for i in ids}) < len(set(ids)):
        length += 1
    return {i: i[:length] for i in ids}


def write_atomic(path: Path, text: str) -> None:
    """Write via a temp file in the same directory + os.replace, so an interrupted run
    (Ctrl-C during --refresh) never leaves a truncated file behind."""
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def _is_pdf_url(url: str | None) -> bool:
    return bool(url) and urlparse(url).path.lower().endswith(".pdf")


def _refuse_pdf_response(url: str, response) -> None:
    """Called on a streamed response before its body is read (redirects already followed)."""
    content_type = (response.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    if content_type == "application/pdf" or _is_pdf_url(getattr(response, "url", None)):
        raise ValueError(f"refusing to download a PDF: {url} → {response.url} ({content_type})")


def fetch_cached(url: str, cache_dir: Path, min_interval: float = 1.0, refresh: bool = False) -> str:
    global _last_request
    if _is_pdf_url(url):
        raise ValueError(f"refusing to download a PDF: {url}")
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / (hashlib.sha256(url.encode()).hexdigest()[:24] + ".html")
    if path.exists() and not refresh:
        return repair_mojibake(path.read_text(encoding="utf-8"))
    wait = min_interval - (time.monotonic() - _last_request)
    if wait > 0:
        time.sleep(wait)
    # stream=True: only headers are read until .content, so a PDF is refused before its body
    response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30, stream=True)
    _last_request = time.monotonic()
    try:
        response.raise_for_status()
        _refuse_pdf_response(url, response)
        text = decode_body(response.content)
    finally:
        response.close()
    write_atomic(path, text)
    return text


def _read_previous(path: Path) -> list[dict] | None:
    """The previous papers.raw.json, or None if missing or unreadable (e.g. truncated)."""
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        print(f"⚠️  previous {path.name} is not valid JSON ({error}); comparing against nothing.")
        return None


def run(conference_id: str, refresh_listing: bool = True, refresh: bool = False) -> dict:
    """Scrape into papers.raw.json; `refresh` re-downloads paper/session pages (each URL once).
    Returns the `diff_papers` change report vs the previous papers.raw.json (also printed)."""
    config = json.loads((ROOT / "conferences" / conference_id / "config.json").read_text())
    cache_dir = ROOT / "pipeline" / "cache" / conference_id
    listing_html = fetch_cached(config["listingUrl"], cache_dir, refresh=refresh_listing)
    refreshed: set[str] = set()

    def fetch_page(url):
        page_refresh = refresh and url not in refreshed
        refreshed.add(url)
        return fetch_cached(url, cache_dir, refresh=page_refresh)

    listing = parse_listing(listing_html)
    short_ids = assign_short_ids([item["id"] for item in listing])

    records = []
    for n, item in enumerate(listing, 1):
        page = parse_paper(fetch_page(item["url"]))
        if not page["sessionId"] and item["sessionKey"]:
            session_url = f"{config['baseUrl']}/program/session/{item['sessionKey']}/"
            session = parse_session(fetch_page(session_url))
            page = {**page, **{k: v for k, v in session.items() if v}, "sessionId": item["sessionKey"]}
        if not page["abstract"]:
            print(f"⚠️  no abstract: {item['id']} {page['title']}")
        records.append(normalize_record({**item, **page, "shortId": short_ids[item["id"]]}))
        if n % 50 == 0:
            print(f"{n}/{len(listing)}")

    out = ROOT / "conferences" / conference_id / "data" / "papers.raw.json"
    previous = _read_previous(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    write_atomic(out, json.dumps(records, ensure_ascii=False, indent=1))
    print(f"wrote {len(records)} papers to {out}")
    # Printed only: conferences/<id>/data/ is committed, so no changes.json is written there.
    changes = diff_papers(previous, records)
    if previous is None:
        print("No previous papers.raw.json to compare.")
    else:
        print(format_changes(changes))
    return changes


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--conference", default="ieeevis2026")
    parser.add_argument(
        "--refresh", action="store_true", help="re-download cached paper/session pages (≤1 req/s)"
    )
    args = parser.parse_args()
    run(args.conference, refresh=args.refresh)
