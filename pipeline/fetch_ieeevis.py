"""Scrape the IEEE VIS program site into the normalized papers format.

Usage: python -m pipeline.fetch_ieeevis --conference ieeevis2026
"""

import argparse
import hashlib
import json
import re
import time
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

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


def fetch_cached(url: str, cache_dir: Path, min_interval: float = 1.0, refresh: bool = False) -> str:
    global _last_request
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / (hashlib.sha256(url.encode()).hexdigest()[:24] + ".html")
    if path.exists() and not refresh:
        return repair_mojibake(path.read_text())
    wait = min_interval - (time.monotonic() - _last_request)
    if wait > 0:
        time.sleep(wait)
    response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    _last_request = time.monotonic()
    response.raise_for_status()
    text = decode_body(response.content)
    path.write_text(text)
    return text


def run(conference_id: str, refresh_listing: bool = True) -> Path:
    config = json.loads((ROOT / "conferences" / conference_id / "config.json").read_text())
    cache_dir = ROOT / "pipeline" / "cache" / conference_id
    listing_html = fetch_cached(config["listingUrl"], cache_dir, refresh=refresh_listing)
    listing = parse_listing(listing_html)
    short_ids = assign_short_ids([item["id"] for item in listing])

    records = []
    for n, item in enumerate(listing, 1):
        page = parse_paper(fetch_cached(item["url"], cache_dir))
        if not page["sessionId"] and item["sessionKey"]:
            session_url = f"{config['baseUrl']}/program/session/{item['sessionKey']}/"
            session = parse_session(fetch_cached(session_url, cache_dir))
            page = {**page, **{k: v for k, v in session.items() if v}, "sessionId": item["sessionKey"]}
        if not page["abstract"]:
            print(f"⚠️  no abstract: {item['id']} {page['title']}")
        records.append(normalize_record({**item, **page, "shortId": short_ids[item["id"]]}))
        if n % 50 == 0:
            print(f"{n}/{len(listing)}")

    out = ROOT / "conferences" / conference_id / "data" / "papers.raw.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(records, ensure_ascii=False, indent=1))
    print(f"wrote {len(records)} papers to {out}")
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--conference", default="ieeevis2026")
    args = parser.parse_args()
    run(args.conference)
