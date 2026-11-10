from collections import Counter
from pathlib import Path

import pytest

from pipeline.fetch_sessions import parse_sessions

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="module")
def sessions():
    return parse_sessions((FIXTURES / "ieeevis2026_sessions.html").read_text())


def test_every_session_card(sessions):
    assert len(sessions) == 110
    assert Counter(s["type"] for s in sessions)["plenary"] == 11
    assert len({s["sessionId"] for s in sessions}) == 110


def test_plenary_without_papers(sessions):
    awards = next(s for s in sessions if s["sessionId"] == "conf-conference12_1")
    assert awards == {
        "sessionId": "conf-conference12_1",
        "type": "plenary",
        "typeLabel": "Plenary",
        "title": "Awards",
        "room": "Hall America",
        "start": "2026-11-10T22:00:00+00:00",
        "end": "2026-11-10T23:30:00+00:00",
        "url": "https://ieeevis.org/year/2026/program/session/conf-conference12_1",
        "paperIds": [],
    }
