import json

import numpy as np
import pytest

from pipeline import embed


def make_conference(tmp_path, papers, projections):
    conf = tmp_path / "conferences" / "testconf"
    (conf / "data").mkdir(parents=True)
    (conf / "config.json").write_text(json.dumps({"id": "testconf", "projections": projections}))
    (conf / "data" / "papers.raw.json").write_text(json.dumps(papers))
    return conf


PAPERS = [
    {"id": "p1", "title": "T", "abstract": "A", "authors": [{"name": "Ann", "affiliation": "MIT"}]},
    {"id": "p2", "title": "U", "abstract": None, "authors": [{"name": "Bo", "affiliation": None}]},
    {"id": "p3", "title": "V", "abstract": "B", "authors": []},
]


def fake_encoder(texts):
    return np.ones((len(texts), 384))


def test_embed_texts_uses_title_and_abstract():
    assert embed.embed_texts(PAPERS) == ["T\nA", "U", "V\nB"]


def test_run_writes_embeddings_and_papers(tmp_path):
    conf = make_conference(tmp_path, PAPERS, ["a"])
    embed.run("testconf", root=tmp_path, encoder=fake_encoder, reducers={"a": lambda m: np.zeros((len(m), 2))})
    assert (conf / "data" / "embeddings.bin").stat().st_size == 3 * 384 * 4
    papers = json.loads((conf / "data" / "papers.json").read_text())
    assert [p["id"] for p in papers] == ["p1", "p2", "p3"]
    assert all(isinstance(p["x"], float) and isinstance(p["y"], float) for p in papers)
    assert papers[0]["authorNames"] == "Ann"
    assert papers[0]["affiliations"] == "MIT"


def test_run_writes_one_file_per_projection(tmp_path):
    conf = make_conference(tmp_path, PAPERS, ["a", "b"])
    reducers = {"a": lambda m: np.zeros((len(m), 2)), "b": lambda m: np.ones((len(m), 2))}
    embed.run("testconf", root=tmp_path, encoder=fake_encoder, reducers=reducers)
    a = json.loads((conf / "data" / "projections" / "a.json").read_text())
    b = json.loads((conf / "data" / "projections" / "b.json").read_text())
    assert a == {"p1": [0.0, 0.0], "p2": [0.0, 0.0], "p3": [0.0, 0.0]}
    assert b["p2"] == [1.0, 1.0]
    papers = json.loads((conf / "data" / "papers.json").read_text())
    assert papers[0]["x"] == 0.0


def test_unknown_projection_raises(tmp_path):
    make_conference(tmp_path, PAPERS, ["nope"])
    with pytest.raises(ValueError, match="nope"):
        embed.run("testconf", root=tmp_path, encoder=fake_encoder, reducers={})
