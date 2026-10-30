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
            self.headers = {"Content-Type": "text/html"}
            self.url = "https://example.org/"

        def close(self):
            pass

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


def test_format_changes_shows_placeholder_for_missing_titles():
    old = [paper("a", title=None), paper("b", title=None)]
    new = [paper("b", title=None, room="Room B"), paper("c", title=None)]
    text = format_changes(diff_papers(old, new))
    assert "None" not in text
    assert "+ c (untitled)" in text
    assert "- a (untitled)" in text
    assert "~ b (untitled)" in text


class StreamedResponse:
    """A streamed response whose body must not be read when it is a PDF."""

    def __init__(self, url, content_type, body=b"<h1>ok</h1>"):
        self.url = url
        self.headers = {"Content-Type": content_type}
        self._body = body
        self.body_read = False
        self.closed = False

    @property
    def content(self):
        self.body_read = True
        return self._body

    def raise_for_status(self):
        pass

    def close(self):
        self.closed = True


@pytest.fixture
def fake_get(monkeypatch):
    import pipeline.fetch_ieeevis as fetcher

    calls = []

    def install(response):
        def get(url, **kwargs):
            calls.append((url, kwargs))
            return response

        monkeypatch.setattr(fetcher.requests, "get", get)
        monkeypatch.setattr(fetcher.time, "sleep", lambda s: None)
        return calls

    return install


@pytest.mark.parametrize(
    "final_url, content_type",
    [
        ("https://example.org/paper/p1/", "application/pdf"),
        ("https://example.org/paper/p1/", "Application/PDF; charset=binary"),
        ("https://cdn.example.org/files/p1.PDF", "application/octet-stream"),
    ],
)
def test_fetch_cached_refuses_pdf_responses_without_reading_the_body(
    tmp_path, fake_get, final_url, content_type
):
    response = StreamedResponse(final_url, content_type)
    calls = fake_get(response)
    with pytest.raises(ValueError, match="PDF"):
        fetch_cached("https://example.org/paper/p1/", tmp_path, refresh=True)
    assert len(calls) == 1  # no extra requests (e.g. HEAD)
    assert calls[0][1].get("stream") is True
    assert not response.body_read
    assert response.closed
    assert list(tmp_path.iterdir()) == []  # nothing cached


def test_fetch_cached_reads_html_responses(tmp_path, fake_get):
    response = StreamedResponse("https://example.org/paper/p1/", "text/html")
    fake_get(response)
    assert fetch_cached("https://example.org/paper/p1/", tmp_path) == "<h1>ok</h1>"
    assert response.closed


def test_write_atomic_keeps_the_previous_file_when_writing_fails(tmp_path):
    from pipeline.fetch_ieeevis import write_atomic

    target = tmp_path / "papers.raw.json"
    target.write_text("previous")
    with pytest.raises(UnicodeEncodeError):
        write_atomic(target, "x" * 100_000 + "\ud800")  # unencodable: fails mid-write
    assert target.read_text() == "previous"
    assert [p.name for p in tmp_path.iterdir()] == ["papers.raw.json"]  # no temp left over

    write_atomic(target, "new ✓")
    assert target.read_text(encoding="utf-8") == "new ✓"
    assert [p.name for p in tmp_path.iterdir()] == ["papers.raw.json"]


def test_fetch_cached_and_run_write_atomically(fake_site, monkeypatch):
    import pipeline.fetch_ieeevis as fetcher

    written = []
    real = fetcher.write_atomic

    def spy(path, text):
        written.append(path)
        real(path, text)

    monkeypatch.setattr(fetcher, "write_atomic", spy)
    _, _, conf = fake_site
    run("test")
    assert conf / "data" / "papers.raw.json" in written
    assert sum(p.suffix == ".html" for p in written) == 4  # listing, 2 papers, session


def test_run_tolerates_a_truncated_previous_raw_file(fake_site, capsys):
    _, _, conf = fake_site
    (conf / "data").mkdir()
    (conf / "data" / "papers.raw.json").write_text('[{"id": "p1", "tit')
    changes = run("test")
    assert len(changes["added"]) == 2
    assert "not valid JSON" in capsys.readouterr().out
