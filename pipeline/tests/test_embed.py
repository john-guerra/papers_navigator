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


def test_run_keeps_the_previous_paper_order(tmp_path):
    # #178: a refreshed scrape can list papers in another order; UMAP's output depends on input
    # order even with a fixed seed, so keeping papers.json's order keeps the map stable.
    # Papers new to the program go last, in the scrape's order.
    conf = make_conference(tmp_path, PAPERS, ["a"])
    (conf / "data" / "papers.json").write_text(json.dumps([{"id": "p3"}, {"id": "gone"}, {"id": "p1"}]))
    raw = [*PAPERS, {"id": "p4", "title": "W", "abstract": "C", "authors": []}]
    (conf / "data" / "papers.raw.json").write_text(json.dumps(raw))
    seen = []
    embed.run("testconf", root=tmp_path, encoder=lambda t: (seen.append(list(t)), np.ones((len(t), 384)))[1],
              reducers={"a": lambda m: np.zeros((len(m), 2))})
    ids = [p["id"] for p in json.loads((conf / "data" / "papers.json").read_text())]
    assert ids == ["p3", "p1", "p2", "p4"]


def _previous_run(conf, ids, vectors, coords):
    # A prior run's outputs: papers.json order, embeddings.bin rows, projections
    data = conf / "data"
    (data / "papers.json").write_text(json.dumps([{"id": i} for i in ids]))
    embed.write_embeddings(np.asarray(vectors, dtype=np.float32), data / "embeddings.bin")
    (data / "projections").mkdir(exist_ok=True)
    (data / "projections" / "a.json").write_text(json.dumps(dict(zip(ids, coords))))


def _unit(v):
    v = np.asarray(v, dtype=float)
    return v / np.linalg.norm(v)


def test_run_keeps_the_previous_layout_when_papers_barely_changed(tmp_path):
    # #178: UMAP reshuffles the whole map when one embedding moves slightly (a retitled paper);
    # same papers, every embedding within cosine 0.98 of the last run: keep the last positions
    conf = make_conference(tmp_path, PAPERS, ["a"])
    base = [_unit(np.eye(384)[i] + 0.01) for i in range(3)]
    _previous_run(conf, ["p1", "p2", "p3"], base, [[1, 2], [3, 4], [5, 6]])
    moved = [base[0], _unit(base[1] + 0.05 * np.eye(384)[7]), base[2]]
    fresh = lambda m: np.full((len(m), 2), 9.0)
    embed.run("testconf", root=tmp_path, encoder=lambda t: np.asarray(moved), reducers={"a": fresh})
    out = json.loads((conf / "data" / "projections" / "a.json").read_text())
    assert out == {"p1": [1, 2], "p2": [3, 4], "p3": [5, 6]}
    papers = json.loads((conf / "data" / "papers.json").read_text())
    assert [(p["x"], p["y"]) for p in papers] == [(1, 2), (3, 4), (5, 6)]


@pytest.mark.parametrize("case", ["new paper", "big change", "relayout"])
def test_run_lays_out_again_when_papers_changed_or_asked(tmp_path, case):
    papers = PAPERS + ([{"id": "p4", "title": "W", "abstract": "C", "authors": []}] if case == "new paper" else [])
    conf = make_conference(tmp_path, papers, ["a"])
    base = [_unit(np.eye(384)[i] + 0.01) for i in range(4)]
    _previous_run(conf, ["p1", "p2", "p3"], base[:3], [[1, 2], [3, 4], [5, 6]])
    vectors = base[: len(papers)]
    if case == "big change":
        vectors = [base[0], base[3], base[2]]  # p2 now says something else
    fresh = lambda m: np.full((len(m), 2), 9.0)
    embed.run("testconf", root=tmp_path, encoder=lambda t: np.asarray(vectors), reducers={"a": fresh},
              relayout=case == "relayout")
    out = json.loads((conf / "data" / "projections" / "a.json").read_text())
    assert set(map(tuple, out.values())) == {(9.0, 9.0)}


def test_layout_gate_compares_with_the_embeddings_the_layout_came_from(tmp_path):
    # #179 review: small drifts must not add up run after run while the map stays frozen
    conf = make_conference(tmp_path, PAPERS, ["a"])
    base = [_unit(np.eye(384)[i] + 0.01) for i in range(3)]
    _previous_run(conf, ["p1", "p2", "p3"], base, [[1, 2], [3, 4], [5, 6]])
    fresh = lambda m: np.full((len(m), 2), 9.0)
    step = _unit(base[1] + 0.12 * np.eye(384)[7])  # ~0.99 to base[1]
    further = _unit(base[1] + 0.25 * np.eye(384)[7])  # ~0.99 to step, ~0.97 to base[1]
    out = lambda: json.loads((conf / "data" / "projections" / "a.json").read_text())
    embed.run("testconf", root=tmp_path, encoder=lambda t: np.asarray([base[0], step, base[2]]), reducers={"a": fresh})
    assert out()["p2"] == [3, 4]
    embed.run("testconf", root=tmp_path, encoder=lambda t: np.asarray([base[0], further, base[2]]), reducers={"a": fresh})
    assert out()["p2"] == [9.0, 9.0]


def test_layout_is_recomputed_when_a_paper_is_removed_or_the_previous_files_are_broken(tmp_path):
    conf = make_conference(tmp_path, PAPERS[:2], ["a"])
    base = [_unit(np.eye(384)[i] + 0.01) for i in range(3)]
    _previous_run(conf, ["p1", "p2", "p3"], base, [[1, 2], [3, 4], [5, 6]])
    fresh = lambda m: np.full((len(m), 2), 9.0)
    embed.run("testconf", root=tmp_path, encoder=lambda t: np.asarray(base[:2]), reducers={"a": fresh})
    assert json.loads((conf / "data" / "projections" / "a.json").read_text()) == {"p1": [9.0, 9.0], "p2": [9.0, 9.0]}
    (conf / "data" / "embeddings.bin").write_bytes(b"\x00" * 10)
    (conf / "data" / "projections" / "basis.bin").unlink(missing_ok=True)
    embed.run("testconf", root=tmp_path, encoder=lambda t: np.asarray(base[:2]), reducers={"a": lambda m: np.full((len(m), 2), 7.0)})
    assert json.loads((conf / "data" / "projections" / "a.json").read_text())["p1"] == [7.0, 7.0]


def test_a_corrupt_previous_papers_json_keeps_the_scrape_order(tmp_path):
    conf = make_conference(tmp_path, PAPERS, ["a"])
    (conf / "data" / "papers.json").write_text("{not json")
    embed.run("testconf", root=tmp_path, encoder=fake_encoder, reducers={"a": lambda m: np.zeros((len(m), 2))})
    ids = [p["id"] for p in json.loads((conf / "data" / "papers.json").read_text())]
    assert ids == ["p1", "p2", "p3"]


def _program(n):
    # n distinct papers: unit vectors in their own direction, laid out on a line
    papers = [{"id": f"p{i}", "title": f"T{i}", "abstract": "A", "authors": []} for i in range(n)]
    vectors = [_unit(np.eye(384)[i] + 0.01) for i in range(n)]
    coords = [[float(i), float(-i)] for i in range(n)]
    return papers, vectors, coords


def test_a_few_new_papers_are_placed_by_their_neighbours_and_the_map_stays(tmp_path):
    # A program update that adds a couple of papers mid-conference must not reshuffle the map:
    # every paper keeps its place, a new one goes among its 5 most similar papers, weighted by a
    # sharp softmax of similarity
    papers, vectors, coords = _program(30)
    new = {"id": "new", "title": "N", "abstract": "A", "authors": []}
    conf = make_conference(tmp_path, [*papers, new], ["a"])
    _previous_run(conf, [p["id"] for p in papers], vectors, coords)
    # the new paper is mostly p3, a bit of p4
    new_vector = _unit(np.eye(384)[3] * 0.75 + np.eye(384)[4] * 0.66 + 0.01)
    fresh = lambda m: np.full((len(m), 2), 99.0)
    embed.run("testconf", root=tmp_path, encoder=lambda t: np.asarray([*vectors, new_vector]), reducers={"a": fresh})
    out = json.loads((conf / "data" / "projections" / "a.json").read_text())
    assert all(out[p["id"]] == c for p, c in zip(papers, coords))
    # between p3 and p4, nearer p3; the 3 weak neighbours far down the line barely count
    assert 3 < out["new"][0] < 3.5
    assert out["new"][1] == pytest.approx(-out["new"][0])
    # the next run compares the new paper with the embedding it was placed from
    basis = np.fromfile(conf / "data" / "projections" / "basis.bin", dtype="<f4").reshape(31, 384)
    assert basis[-1] == pytest.approx(new_vector, abs=1e-6)


def test_many_new_papers_still_lay_the_map_out_again(tmp_path):
    # More than 5% new papers: the old positions no longer describe the program
    papers, vectors, coords = _program(20)
    extra = [{"id": f"n{i}", "title": f"N{i}", "abstract": "A", "authors": []} for i in range(2)]
    conf = make_conference(tmp_path, [*papers, *extra], ["a"])
    _previous_run(conf, [p["id"] for p in papers], vectors, coords)
    more = [_unit(np.eye(384)[100 + i] + 0.01) for i in range(2)]
    fresh = lambda m: np.full((len(m), 2), 99.0)
    embed.run("testconf", root=tmp_path, encoder=lambda t: np.asarray([*vectors, *more]), reducers={"a": fresh})
    out = json.loads((conf / "data" / "projections" / "a.json").read_text())
    assert set(map(tuple, out.values())) == {(99.0, 99.0)}


def test_place_new_blends_close_neighbours_and_ignores_weak_ones():
    xy = np.asarray([[0.0, 0.0], [10.0, 0.0], [100.0, 100.0]])
    old = np.eye(3)
    # equally like 0 and 1, slightly like 2
    placed = embed.place_new(xy, old, np.asarray([[0.6, 0.6, 0.1]]))
    assert placed[0] == pytest.approx([5.0, 0.0], abs=0.01)


def test_a_kept_layout_keeps_the_topics_and_new_papers_join_their_neighbours_topic(tmp_path):
    # Re-clustering the same positions reworded topic labels and moved papers between topics
    # mid-conference; with the layout kept, topics stay as they were
    papers, vectors, coords = _program(30)
    new = {"id": "new", "title": "N", "abstract": "A", "authors": []}
    conf = make_conference(tmp_path, [*papers, new], ["a"])
    _previous_run(conf, [p["id"] for p in papers], vectors, coords)
    data = conf / "data"
    previous = [
        {"id": p["id"], "cluster": 0 if i < 15 else (1 if i < 28 else None),
         "clusterLabel": "Alpha" if i < 15 else ("Beta" if i < 28 else None)}
        for i, p in enumerate(papers)
    ]
    (data / "papers.json").write_text(json.dumps(previous))
    (data / "clusters.json").write_text(json.dumps([
        {"id": 0, "label": "Alpha", "size": 15, "terms": ["a"]},
        {"id": 1, "label": "Beta", "size": 13, "terms": ["b"]},
    ]))
    new_vector = _unit(np.eye(384)[3] * 0.75 + np.eye(384)[4] * 0.66 + 0.01)
    embed.run("testconf", root=tmp_path, encoder=lambda t: np.asarray([*vectors, new_vector]),
              reducers={"a": lambda m: np.full((len(m), 2), 99.0)})
    out = {p["id"]: p for p in json.loads((data / "papers.json").read_text())}
    assert [(out[p["id"]]["cluster"], out[p["id"]]["clusterLabel"]) for p in previous] == [
        (p["cluster"], p["clusterLabel"]) for p in previous
    ]
    assert (out["new"]["cluster"], out["new"]["clusterLabel"]) == (0, "Alpha")
    assert json.loads((data / "clusters.json").read_text()) == [
        {"id": 0, "label": "Alpha", "size": 16, "terms": ["a"]},
        {"id": 1, "label": "Beta", "size": 13, "terms": ["b"]},
    ]


def test_a_new_paper_among_unclustered_ones_stays_unclustered():
    weights = embed.neighbour_weights(np.eye(3), np.asarray([[0.9, 0.1, 0.0]]))
    assert embed.vote([None, 0, 0], weights[0]) is None
    assert embed.vote([1, 0, 0], weights[0]) == 1


def test_kept_topics_say_how_to_recompute_them(tmp_path, capsys):
    # #222 review: editing config clusters then running embed silently kept the old topics
    papers, vectors, coords = _program(30)
    conf = make_conference(tmp_path, papers, ["a"])
    _previous_run(conf, [p["id"] for p in papers], vectors, coords)
    data = conf / "data"
    (data / "papers.json").write_text(json.dumps([{"id": p["id"], "cluster": 0, "clusterLabel": "Alpha"} for p in papers]))
    (data / "clusters.json").write_text(json.dumps([{"id": 0, "label": "Alpha", "size": 30, "terms": ["a"]}]))
    embed.run("testconf", root=tmp_path, encoder=lambda t: np.asarray(vectors), reducers={"a": lambda m: np.zeros((len(m), 2))})
    assert "python -m pipeline.clusters" in capsys.readouterr().out
