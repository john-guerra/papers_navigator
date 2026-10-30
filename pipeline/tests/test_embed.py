import json

import numpy as np
import pytest

from pipeline import embed


def make_conference(tmp_path, papers, projections, **config):
    conf = tmp_path / "conferences" / "testconf"
    (conf / "data").mkdir(parents=True)
    (conf / "config.json").write_text(json.dumps({"id": "testconf", "projections": projections, **config}))
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


def test_run_drops_excluded_type_labels(tmp_path):
    papers = [
        {**PAPERS[0], "typeLabel": "Full VIS Paper"},
        {**PAPERS[1], "typeLabel": "Keynote"},
        {**PAPERS[2], "typeLabel": "Plenary Session"},
    ]
    conf = make_conference(tmp_path, papers, ["a"], excludeTypeLabels=["Keynote", "Plenary Session"])
    embed.run("testconf", root=tmp_path, encoder=fake_encoder, reducers={"a": lambda m: np.zeros((len(m), 2))})
    assert [p["id"] for p in json.loads((conf / "data" / "papers.json").read_text())] == ["p1"]
    assert (conf / "data" / "embeddings.bin").stat().st_size == 1 * 384 * 4
    assert list(json.loads((conf / "data" / "projections" / "a.json").read_text())) == ["p1"]


def test_unknown_projection_raises(tmp_path):
    make_conference(tmp_path, PAPERS, ["nope"])
    with pytest.raises(ValueError, match="nope"):
        embed.run("testconf", root=tmp_path, encoder=fake_encoder, reducers={})


def test_unify_keywords_picks_one_spelling_per_case_group():
    from pipeline.normalize import unify_keywords

    papers = [
        {"id": "a", "keywords": ["Scientific Visualization", "Design Study"]},
        {"id": "b", "keywords": ["Scientific visualization", "Design study"]},
        {"id": "c", "keywords": ["Scientific visualization", "evaluation", "Evaluation"]},
        {"id": "d", "keywords": ["scientific visualization", "LLM"]},
    ]
    out = unify_keywords(papers)
    # most common spelling wins
    assert out[0]["keywords"][0] == "Scientific visualization"
    assert out[3]["keywords"] == ["Scientific visualization", "LLM"]
    # tie (1 vs 1): sentence case beats title case
    assert out[0]["keywords"][1] == "Design study"
    # duplicates inside one paper collapse, order kept
    assert out[2]["keywords"] == ["Scientific visualization", "Evaluation"]
    # input not mutated
    assert papers[0]["keywords"] == ["Scientific Visualization", "Design Study"]


def test_run_unifies_keywords(tmp_path):
    papers = [
        {**PAPERS[0], "keywords": ["Graph Drawing"]},
        {**PAPERS[1], "keywords": ["graph drawing"]},
        {**PAPERS[2], "keywords": ["Graph drawing"]},
    ]
    conf = make_conference(tmp_path, papers, ["a"])
    embed.run("testconf", root=tmp_path, encoder=fake_encoder, reducers={"a": lambda m: np.zeros((len(m), 2))})
    out = json.loads((conf / "data" / "papers.json").read_text())
    assert {k for p in out for k in p["keywords"]} == {"Graph drawing"}


def test_unify_keywords_ignores_trailing_punctuation():
    from pipeline.normalize import unify_keywords

    out = unify_keywords([{"keywords": ["Scientific visualization"]}, {"keywords": ["scientific visualization."]}])
    assert [p["keywords"] for p in out] == [["Scientific visualization"], ["Scientific visualization"]]


def test_unify_keywords_splits_semicolon_lists_and_collapses_whitespace():
    from pipeline.normalize import unify_keywords

    out = unify_keywords([{"keywords": ["Ice Sheet; Art-Science\ncollaboration; Cryosphere.", " "]}])
    assert out[0]["keywords"] == ["Ice Sheet", "Art-Science collaboration", "Cryosphere"]
