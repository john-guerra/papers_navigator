import pytest

from pipeline.changes import diff_papers, format_changes
from pipeline.fetch_ieeevis import fetch_cached, run


def paper(id, **fields):
    base = {
        "id": id,
        "title": f"Paper {id}",
        "sessionId": "s1",
        "sessionName": "Session 1",
        "room": "Room A",
        "start": "2026-10-20T09:00:00-04:00",
        "end": "2026-10-20T09:15:00-04:00",
        "sessionStart": "2026-10-20T09:00:00-04:00",
        "sessionEnd": "2026-10-20T10:15:00-04:00",
        "links": [{"label": "DOI", "url": f"https://doi.org/{id}"}],
        "abstract": "...",
    }
    return {**base, **fields}


def test_identical_lists_have_no_changes():
    papers = [paper("a"), paper("b")]
    changes = diff_papers(papers, [dict(p) for p in papers])
    assert changes == {"added": [], "removed": [], "changed": []}


def test_added_and_removed_items():
    changes = diff_papers([paper("a"), paper("b")], [paper("b"), paper("c")])
    assert changes["added"] == [{"id": "c", "title": "Paper c"}]
    assert changes["removed"] == [{"id": "a", "title": "Paper a"}]
    assert changes["changed"] == []


def test_changed_schedule_fields():
    old = [paper("a")]
    new = [
        paper(
            "a",
            room="Room B",
            start="2026-10-21T09:00:00-04:00",
            sessionId="s2",
            sessionName="Session 2",
            abstract="edited abstract is not reported",
        )
    ]
    [change] = diff_papers(old, new)["changed"]
    assert change["id"] == "a"
    assert change["title"] == "Paper a"
    assert change["fields"] == {
        "room": ["Room A", "Room B"],
        "start": ["2026-10-20T09:00:00-04:00", "2026-10-21T09:00:00-04:00"],
        "sessionId": ["s1", "s2"],
        "sessionName": ["Session 1", "Session 2"],
    }
    assert change["linksAdded"] == []
    assert change["linksRemoved"] == []


def test_new_and_removed_links():
    old = [paper("a")]
    new = [
        paper(
            "a",
            links=[
                {"label": "Digital Object Identifier", "url": "https://doi.org/a"},
                {"label": "Preprint", "url": "https://arxiv.org/abs/1"},
            ],
        )
    ]
    [change] = diff_papers(old, new)["changed"]
    assert change["fields"] == {}
    assert change["linksAdded"] == [{"label": "Preprint", "url": "https://arxiv.org/abs/1"}]
    assert change["linksRemoved"] == []

    [change] = diff_papers(new, old)["changed"]
    assert change["linksRemoved"] == [{"label": "Preprint", "url": "https://arxiv.org/abs/1"}]


def test_missing_previous_file_reports_everything_added():
    changes = diff_papers(None, [paper("a")])
    assert changes["added"] == [{"id": "a", "title": "Paper a"}]


def test_format_changes():
    old = [paper("a"), paper("b")]
    new = [paper("b", room="Room B"), paper("c")]
    text = format_changes(diff_papers(old, new))
    assert "1 added, 1 removed, 1 changed" in text
    assert "+ c Paper c" in text
    assert "- a Paper a" in text
    assert "room: Room A → Room B" in text
    assert format_changes(diff_papers(old, old)) == "No changes vs the previous papers.raw.json."


def test_fetch_cached_never_downloads_pdfs(tmp_path):
    with pytest.raises(ValueError):
        fetch_cached("https://ieeevis.org/files/paper.PDF", tmp_path)


LISTING = """
<article class="program-card" data-paper-id="p1" data-type="workshop" data-session-key="w1">
  <a class="program-card__title-link" href="/program/paper/p1/">P1</a></article>
<article class="program-card" data-paper-id="p2" data-type="workshop" data-session-key="w1">
  <a class="program-card__title-link" href="/program/paper/p2/">P2</a></article>
"""
PAPER = "<h1>{title}</h1>"
SESSION = '<h1>Workshop 1</h1><p class="program-event-meta"><strong>Room:</strong> {room}</p>'


@pytest.fixture
def fake_site(tmp_path, monkeypatch):
    """A fake conference + site; records every network request."""
    import pipeline.fetch_ieeevis as fetcher

    conf = tmp_path / "conferences" / "test"
    conf.mkdir(parents=True)
    (conf / "config.json").write_text(
        '{"listingUrl": "https://example.org/program/", "baseUrl": "https://example.org"}'
    )
    site = {"room": "Room A", "title": "Title"}
    requests_made = []

    class Response:
        def __init__(self, text):
            self.content = text.encode()

        def raise_for_status(self):
            pass

    def fake_get(url, **kwargs):
        requests_made.append(url)
        if url.endswith("/program/"):
            return Response(LISTING)
        if "/session/" in url:
            return Response(SESSION.format(**site))
        return Response(PAPER.format(**site))

    monkeypatch.setattr(fetcher, "ROOT", tmp_path)
    monkeypatch.setattr(fetcher.requests, "get", fake_get)
    monkeypatch.setattr(fetcher.time, "sleep", lambda s: None)
    return site, requests_made, conf


def test_run_refresh_redownloads_pages_once_and_reports_changes(fake_site, capsys):
    site, requests_made, conf = fake_site
    run("test")
    assert len(requests_made) == 4  # listing, 2 papers, 1 shared session page

    requests_made.clear()
    site["room"] = "Room B"
    run("test")  # cache hit for paper/session pages: nothing changes
    assert requests_made == ["https://example.org/program/"]
    assert "No changes" in capsys.readouterr().out

    requests_made.clear()
    changes = run("test", refresh=True)
    assert len(requests_made) == 4  # session page shared by both papers fetched once
    assert len(changes["changed"]) == 2
    assert "room: Room A → Room B" in capsys.readouterr().out
    assert not (conf / "data" / "changes.json").exists()
