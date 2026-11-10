"""Scrape the IEEE VIS sessions page: every session of the program, also those without papers
(plenaries, panels, tutorials, meetups), so the Live page can show them.

Usage: python -m pipeline.fetch_sessions --conference ieeevis2026

Writes conferences/<id>/data/sessions.json; the page is always re-downloaded (one request).
"""

import argparse
import json
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from pipeline.fetch_ieeevis import ROOT, _text, fetch_cached, write_atomic


def parse_sessions(html: str, base_url: str = "https://ieeevis.org") -> list[dict]:
    """One record per session card: id, type, title, room, start/end (ISO, UTC) and its papers."""
    soup = BeautifulSoup(html, "html.parser")
    sessions = []
    for card in soup.select("article.program-card[data-session-id]"):
        link = card.select_one("a.program-card__title-link")
        room = next(
            (
                _text(note).removeprefix("Room:").strip()
                for note in card.select(".program-card__note")
                if _text(note).startswith("Room:")
            ),
            None,
        )
        sessions.append(
            {
                "sessionId": card["data-session-id"],
                "type": card.get("data-type"),
                "typeLabel": _text(card.select_one(".program-card__eyebrow")),
                "title": _text(card.select_one(".program-card__title")),
                "room": room or None,
                "start": card.get("data-start") or None,
                "end": card.get("data-end") or None,
                "url": urljoin(base_url, link["href"]) if link else None,
                "paperIds": (card.get("data-paper-ids") or "").split(),
            }
        )
    return sessions


def run(conference_id: str) -> list[dict]:
    config = json.loads((ROOT / "conferences" / conference_id / "config.json").read_text())
    cache_dir = ROOT / "pipeline" / "cache" / conference_id
    sessions = parse_sessions(fetch_cached(config["sessionsUrl"], cache_dir, refresh=True))
    out = ROOT / "conferences" / conference_id / "data" / "sessions.json"
    write_atomic(out, json.dumps(sessions, ensure_ascii=False, indent=1))
    print(f"wrote {len(sessions)} sessions to {out}")
    return sessions


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--conference", default="ieeevis2026")
    run(parser.parse_args().conference)
