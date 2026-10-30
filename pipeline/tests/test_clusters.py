import json

import numpy as np

from pipeline import clusters


def blobs(sizes, seed=0, spread=0.3):
    """Well-separated 2D blobs, one per size, centred 10 units apart."""
    rng = np.random.default_rng(seed)
    return np.vstack([rng.normal((10 * i, 0), spread, (n, 2)) for i, n in enumerate(sizes)])


def test_cluster_points_finds_blobs_and_numbers_them_by_size():
    xy = blobs([12, 30, 20])
    labels = clusters.cluster_points(xy, min_cluster_size=8, min_samples=3)
    # largest blob (the second one) is cluster 0, then 1, then 2
    assert set(labels[12:42]) == {0}
    assert set(labels[42:]) == {1}
    assert set(labels[:12]) == {2}


def test_cluster_points_marks_isolated_points_as_noise():
    xy = np.vstack([blobs([20, 20]), [[100.0, 100.0]]])
    labels = clusters.cluster_points(xy, min_cluster_size=8, min_samples=3)
    assert labels[-1] == -1


def test_cluster_points_is_deterministic():
    xy = blobs([15, 25, 18], seed=3, spread=1.5)
    a = clusters.cluster_points(xy, min_cluster_size=8, min_samples=3)
    b = clusters.cluster_points(xy, min_cluster_size=8, min_samples=3)
    assert a.tolist() == b.tolist()


DOCS = (
    ["Graph drawing layouts for large networks. Network layout of node-link diagrams."] * 5
    + ["Color maps and colormap perception. Perceptual color palettes for maps."] * 5
    + ["Uncertainty visualization of ensembles. Ensemble uncertainty in weather forecasts."] * 5
)
LABELS = np.array([0] * 5 + [1] * 5 + [2] * 5)


def test_ctfidf_terms_picks_distinctive_terms_per_cluster():
    terms = clusters.ctfidf_terms(DOCS, LABELS, top_n=5)
    assert len(terms) == 3
    assert any("network" in t or "graph" in t for t in terms[0])
    assert any("color" in t for t in terms[1][:3])
    assert any("uncertainty" in t or "ensemble" in t for t in terms[2][:3])


def test_ctfidf_terms_ignores_extra_stop_words():
    terms = clusters.ctfidf_terms(DOCS, LABELS, top_n=10, stop_words=["network", "networks", "color"])
    assert not any("network" in t.split() for t in terms[0])
    assert "color" not in terms[1]


def test_make_label_joins_2_to_4_words_without_repeats():
    # covered unigrams are skipped; stops once it has 3 words, never more than 4
    assert clusters.make_label(["graph drawing", "graph", "drawing", "networks", "layout"]) == "Graph drawing, networks"
    # a bigram replaces a chosen unigram it contains
    assert clusters.make_label(["color", "color maps", "perception", "palettes"]) == "Color maps, perception"
    assert clusters.make_label(["uncertainty"]) == "Uncertainty"
    assert len(clusters.make_label(["a b", "c d", "e f"]).replace(",", "").split()) <= 4


def test_make_label_restores_the_usual_casing():
    forms = clusters.surface_forms(["LLM agents and LLMs", "an LLM", "Graph drawing", "graph layouts"])
    assert forms["llm"] == "LLM"
    assert forms.get("graph", "graph") == "graph"  # sentence-initial "Graph" is ignored
    assert clusters.make_label(["llm agents", "graph"], forms) == "LLM agents, graph"


def test_make_label_folds_plurals_and_prefers_bigrams():
    assert clusters.make_label(["agents", "llm", "agent", "language"], {"llm": "LLM"}) == "Agents, LLM, language"
    terms = ["topological", "uncertainty", "dimensionality", "dimensionality reduction"]
    assert clusters.make_label(terms) == "Topological, uncertainty, dimensionality reduction"
    # hyphenated parts count as used words; low-ranked bigrams don't replace unigrams
    assert clusters.make_label(["multi-agent", "agents", "vast", "social"]) == "Multi-agent, vast, social"
    assert clusters.make_label(["tactile", "accessibility", "accessible", "chart"]) == "Tactile, accessibility, chart"
    assert clusters.make_label(["agents", "scientific", "language", "agent", "agentic", "large language"]) == "Agents, scientific, language"


def test_surface_forms_ignores_sentence_initial_and_title_capitals():
    forms = clusters.surface_forms(["Challenge entries. The challenge was hard.", "We use GPUs."], ["Dimensionality Reduction"])
    assert forms["challenge"] == "challenge"
    assert forms["gpus"] == "GPUs"
    # only in titles: the title spelling is the fallback
    assert forms["dimensionality"] == "Dimensionality"


def test_ctfidf_terms_keeps_hyphenated_compounds():
    docs = ["Multi-agent systems and multi-agent dialogues."] * 3 + ["Volume rendering of volumes."] * 3
    terms = clusters.ctfidf_terms(docs, np.array([0, 0, 0, 1, 1, 1]))
    assert "multi-agent" in terms[0]


def test_compute_assigns_clusters_and_labels():
    xy = blobs([5, 5, 5])
    papers = [{"id": f"p{i}", "title": d, "abstract": None, "keywords": []} for i, d in enumerate(DOCS)]
    labels, info = clusters.compute(papers, xy, {"minClusterSize": 4, "minSamples": 2})
    assert sorted(set(labels.tolist())) == [0, 1, 2]
    assert [c["id"] for c in info] == [0, 1, 2]
    assert all(c["size"] == 5 for c in info)
    assert all(1 <= len(c["label"].replace(",", "").split()) <= 4 for c in info)
    assert all(isinstance(c["terms"], list) for c in info)


def make_conference(tmp_path, n=15):
    conf = tmp_path / "conferences" / "testconf"
    (conf / "data" / "projections").mkdir(parents=True)
    (conf / "config.json").write_text(
        json.dumps({"id": "testconf", "projections": ["umap", "pca"], "clusters": {"minClusterSize": 4, "minSamples": 2}})
    )
    papers = [{"id": f"p{i}", "title": DOCS[i], "abstract": None, "keywords": [], "x": 0.0} for i in range(n)]
    (conf / "data" / "papers.json").write_text(json.dumps(papers, ensure_ascii=False))
    xy = blobs([5, 5, 5])
    (conf / "data" / "projections" / "umap.json").write_text(json.dumps({p["id"]: list(xy[i]) for i, p in enumerate(papers)}))
    (conf / "data" / "projections" / "pca.json").write_text(json.dumps({p["id"]: [0, 0] for p in papers}))
    return conf


def test_run_adds_cluster_fields_and_writes_clusters_json(tmp_path):
    conf = make_conference(tmp_path)
    clusters.run("testconf", root=tmp_path)
    papers = json.loads((conf / "data" / "papers.json").read_text())
    assert {p["cluster"] for p in papers} == {0, 1, 2}
    assert all(isinstance(p["clusterLabel"], str) for p in papers)
    # other fields untouched, order of keys kept, new ones appended
    assert list(papers[0]) == ["id", "title", "abstract", "keywords", "x", "cluster", "clusterLabel"]
    info = json.loads((conf / "data" / "clusters.json").read_text())
    assert [c["id"] for c in info] == [0, 1, 2]
    by_id = {c["id"]: c["label"] for c in info}
    assert all(p["clusterLabel"] == by_id[p["cluster"]] for p in papers)


def test_run_gives_noise_null_cluster(tmp_path):
    conf = make_conference(tmp_path)
    proj = conf / "data" / "projections" / "umap.json"
    coords = json.loads(proj.read_text())
    coords["p0"] = [500.0, 500.0]
    proj.write_text(json.dumps(coords))
    clusters.run("testconf", root=tmp_path)
    p0 = json.loads((conf / "data" / "papers.json").read_text())[0]
    assert p0["cluster"] is None and p0["clusterLabel"] is None


def test_run_is_idempotent(tmp_path):
    conf = make_conference(tmp_path)
    clusters.run("testconf", root=tmp_path)
    first = (conf / "data" / "papers.json").read_bytes()
    clusters.run("testconf", root=tmp_path)
    assert (conf / "data" / "papers.json").read_bytes() == first
