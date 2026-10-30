from collections import Counter
from pathlib import Path

import pytest

from pipeline.fetch_ieeevis import assign_short_ids, parse_listing, parse_paper

FIXTURES = Path(__file__).parent / "fixtures"
PAPER_ID = "3121c4fc-2fc3-4c4c-a716-fc64018061ec"


@pytest.fixture(scope="module")
def listing():
    return parse_listing((FIXTURES / "ieeevis2026_listing.html").read_text())


@pytest.fixture(scope="module")
def paper():
    return parse_paper((FIXTURES / "ieeevis2026_paper_3121c4fc.html").read_text())


def test_listing_counts(listing):
    assert len(listing) == 492
    assert Counter(item["type"] for item in listing) == {
        "full": 145,
        "workshop": 100,
        "short": 68,
        "tvcg": 59,
        "poster": 58,
        "challenge": 30,
        "visap": 15,
        "cg&a": 11,
        "invited-talk": 5,
        "vis": 1,
    }


def test_listing_item(listing):
    item = next(i for i in listing if i["id"] == PAPER_ID)
    assert item["type"] == "short"
    assert item["sessionKey"] == "v-short-short3"
    assert item["startMs"] == 1794420000000
    assert item["url"].endswith(f"/program/content/{PAPER_ID}")


def test_parse_paper(paper):
    assert paper["title"] == (
        "Exploring LLM Agent Designs and Interaction Modalities for Scientific Visualization"
    )
    assert len(paper["authors"]) == 5
    assert paper["authors"][0] == {
        "name": "Jackson Vonderhorst",
        "affiliation": "University of Notre Dame",
    }
    assert paper["authors"][3]["affiliation"] == "Lawrence Livermore National Laboratory"
    assert paper["keywords"] == [
        "Scientific visualization",
        "LLM agents",
        "interaction modalities",
        "evaluation",
    ]
    assert paper["sessionName"] == "Me, Myself, and AI"
    assert paper["sessionId"] == "v-short-short3"
    assert paper["start"] == "2026-11-11T18:00:00.000Z"
    assert paper["end"] == "2026-11-11T18:09:00.000Z"
    assert paper["room"] == "America center"
    assert paper["abstract"].startswith("This paper examines how large language model")


def test_parse_paper_missing_fields_are_none():
    paper = parse_paper("<html><body><h1>Only a title</h1></body></html>")
    assert paper["title"] == "Only a title"
    assert paper["authors"] == []
    assert paper["abstract"] is None
    assert paper["start"] is None
    assert paper["room"] is None


def test_short_ids():
    assert assign_short_ids(["abcdefgh1", "abcdefgh2"]) == {
        "abcdefgh1": "abcdefgh1",
        "abcdefgh2": "abcdefgh2",
    }
    assert assign_short_ids(["aaaaaaaa-1", "bbbbbbbb-2"]) == {
        "aaaaaaaa-1": "aaaaaaaa",
        "bbbbbbbb-2": "bbbbbbbb",
    }


def test_parse_session():
    from pipeline.fetch_ieeevis import parse_session

    session = parse_session((FIXTURES / "ieeevis2026_session_accessvis.html").read_text())
    assert session == {
        "sessionName": "AccessViz: 3rd Workshop on Accessible Data Visualization",
        "room": "St. George C-D",
        "sessionStart": "2026-11-09T13:00:00+00:00",
        "sessionEnd": "2026-11-09T16:30:00+00:00",
    }


def test_decode_body_ignores_wrong_charset_guess():
    from pipeline.fetch_ieeevis import decode_body

    assert decode_body("Intent–Artifact".encode("utf-8")) == "Intent–Artifact"


def test_repair_mojibake():
    from pipeline.fetch_ieeevis import repair_mojibake

    garbled = "Intent–Artifact".encode("utf-8").decode("latin-1")
    assert repair_mojibake(garbled) == "Intent–Artifact"
    assert repair_mojibake("already fine – 日本") == "already fine – 日本"


def test_links_are_deduplicated(paper):
    urls = [link["url"] for link in paper["links"]]
    assert len(urls) == len(set(urls))
    assert all(link["label"] for link in paper["links"])
