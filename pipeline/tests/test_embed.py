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


def test_run_adds_clusters_from_the_first_projection(tmp_path):
    papers = [{"id": f"p{i}", "title": f"T{i}", "abstract": None, "authors": []} for i in range(30)]
    conf = make_conference(tmp_path, papers, ["a", "b"], clusters={"minClusterSize": 5, "minSamples": 2})

    def blobs(m):
        return np.array([[10.0 * (i // 10) + 0.01 * (i % 10), 0.0] for i in range(len(m))])

    embed.run("testconf", root=tmp_path, encoder=fake_encoder, reducers={"a": blobs, "b": lambda m: np.zeros((len(m), 2))})
    out = json.loads((conf / "data" / "papers.json").read_text())
    assert {p["cluster"] for p in out} == {0, 1, 2}
    assert [c["size"] for c in json.loads((conf / "data" / "clusters.json").read_text())] == [10, 10, 10]


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


def _unify(*keyword_lists):
    from pipeline.normalize import unify_keywords

    return [p["keywords"] for p in unify_keywords([{"keywords": list(ks)} for ks in keyword_lists])]


def test_unify_keywords_prefers_capitalized_over_lowercase():
    # The most used spelling is all-lowercase: it is shown sentence-cased instead.
    out = _unify(["data visualization"], ["data visualization"], ["Data Visualization"])
    assert out == [["Data visualization"]] * 3


def test_unify_keywords_capitalizes_lowercase_only_groups():
    out = _unify(["accessibility"], ["clustering", "accessibility"])
    assert out == [["Accessibility"], ["Clustering", "Accessibility"]]


def test_unify_keywords_keeps_lowercase_variable_prefixes():
    # "k-means", "t-test": the single lowercase letter is a variable name; "iPhone", "mRNA" are
    # written that way on purpose.
    out = _unify(["k-means"], ["t-test"], ["iPhone"], ["mRNA vaccines"])
    assert out == [["k-means"], ["t-test"], ["iPhone"], ["mRNA vaccines"]]


def test_unify_keywords_capitalizes_a_lowercase_first_word():
    out = _unify(["human-AI interaction"], ["generative AI"], ["a priori"])
    assert out == [["Human-AI interaction"], ["Generative AI"], ["A priori"]]


def test_unify_keywords_prefers_regular_hyphen_spacing():
    out = _unify(["topology- based visualization"], ["Topology-based visualization"])
    assert out == [["Topology-based visualization"]] * 2


def test_unify_keywords_merges_hyphen_and_space_variants():
    out = _unify(["Colormap"], ["Color Map"], ["Colormap"], ["Decision-making"], ["Decision-making"], ["Decision Making"], ["decision making"])
    assert out[:3] == [["Colormap"]] * 3
    assert out[3:] == [["Decision-making"]] * 4


def test_unify_keywords_merges_dash_variants_and_dedupes_per_paper():
    assert _unify(["t-SNE", "tSNE", "t SNE", "t‐SNE", "T-SNE"], ["t-SNE"]) == [["t-SNE"]] * 2


def test_unify_keywords_does_not_merge_distinct_words():
    keywords = ["Graph", "Graphs", "Map", "Maps", "US", "U.S.", "Re-search", "Search", "3D", "3D", "3-D", "2D"]
    out = _unify(*[[k] for k in keywords])
    assert out == [["Graph"], ["Graphs"], ["Map"], ["Maps"], ["US"], ["U.S."], ["Re-search"], ["Search"], ["3D"], ["3D"], ["3D"], ["2D"]]


def test_unify_keywords_uses_nfkc_and_casefold():
    # "ﬁ" ligature → "fi"; "ß" casefolds to "ss".
    out = _unify(["Scientiﬁc visualization"], ["scientific visualization"], ["STRASSE"], ["Straße"])
    assert out == [["Scientific visualization"]] * 2 + [["Straße"]] * 2


def test_unify_keywords_keeps_abbreviation_periods():
    assert _unify(["Charts, e.g.", "U.S.", "Elections.", "Vol. A."]) == [["Charts, e.g.", "U.S.", "Elections", "Vol. A."]]


def test_unify_keywords_counts_spacing_forms_across_case():
    # "Multimodal…" is used twice (in two casings), so it beats the single "Multi-modal…".
    out = _unify(["Multimodal Large Language Models"], ["Multimodal large language models"], ["Multi-modal large language models"])
    assert out == [["Multimodal large language models"]] * 3


def test_unify_keywords_drops_leading_conjunction_fragments():
    out = _unify(["Risk; and Decision Making"], ["& design pattern"], ["or GenAI Techniques"], ["OR scheduling", "Andes"])
    assert out == [["Risk", "Decision Making"], ["Design pattern"], ["GenAI Techniques"], ["OR scheduling", "Andes"]]


def test_unify_keywords_prefers_consistent_casing_across_hyphens():
    # "Time-series Classification" capitalizes after a space but not after the hyphen.
    out = _unify(["Time-series Classification"], ["Time Series Classification"])
    assert out == [["Time Series Classification"]] * 2


def test_run_adds_short_labels_when_configured(tmp_path, monkeypatch):
    from pipeline import short_labels

    cache = tmp_path / "cache"
    monkeypatch.setattr(embed, "add_short_labels", lambda *a, **k: short_labels.add_short_labels(*a, **k, cache_root=cache))
    papers = [{**PAPERS[0], "title": "FADEx: Explaining DR"}, PAPERS[1], PAPERS[2]]
    conf = make_conference(tmp_path, papers, ["a"], shortLabels={"enabled": True})
    embed.run("testconf", root=tmp_path, encoder=fake_encoder, reducers={"a": lambda m: np.zeros((len(m), 2))})
    out = json.loads((conf / "data" / "papers.json").read_text())
    assert out[0]["shortLabel"] == "FADEx" and out[0]["shortLabelSource"] == "title"
    assert all(p["shortLabel"] for p in out)
    assert (conf / "data" / "shortLabels.json").exists()


def test_run_skips_short_labels_unless_configured(tmp_path):
    conf = make_conference(tmp_path, PAPERS, ["a"])
    embed.run("testconf", root=tmp_path, encoder=fake_encoder, reducers={"a": lambda m: np.zeros((len(m), 2))})
    assert "shortLabel" not in json.loads((conf / "data" / "papers.json").read_text())[0]
