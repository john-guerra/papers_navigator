import hashlib
import json
import threading
import time

import numpy as np
import pytest

from pipeline import short_labels as sl


# --- tool names from the title -------------------------------------------------------------


@pytest.mark.parametrize(
    "title, name",
    [
        ("FADEx: Feature Attribution for Dimensionality Reduction Explanations", "FADEx"),
        ("MAPLE: A Multi-Agent Pipeline for Layout Exploration", "MAPLE"),
        ("VIVA: Visual Inspection of Video Analytics", "VIVA"),
        ("CUBE-ism: Cubist Views of Data Cubes", "CUBE-ism"),
        ("reVISit-XR - Running Studies in Mixed Reality", "reVISit-XR"),
        ("GNN101: Visual Learning of Graph Neural Networks", "GNN101"),
        ("Libra+: Faster Libraries", "Libra+"),
        ("Topological Autoencoders++: Fast and Accurate", "Topological Autoencoders++"),
    ],
)
def test_title_tool_name_detects_coined_names(title, name):
    assert sl.title_tool_name({"title": title, "abstract": ""}) == name


@pytest.mark.parametrize(
    "title",
    [
        "Toward AI VIS Co-Scientists: A Roadmap",
        "The Grand Challenge of Visualization: Open Problems",
        "Beyond the Good, the Bad, and the Ugly: Charts",
        "Marks, Channels, and Dead Ends: A Survey",
        "Field Guide: Visualizing Birds",
        "Olli with Hypergraphs: Accessible Charts",
        "The CAPED Framework: Design",
        "A Title Without Any Colon",
        "Ripples: How Charts Spread",
    ],
)
def test_title_tool_name_rejects_generic_prefixes(title):
    assert sl.title_tool_name({"title": title, "abstract": "We study ripples in charts."}) is None


def test_title_tool_name_accepts_a_plain_word_the_abstract_uses_as_a_name():
    paper = {"title": "Loom: Weaving Narratives", "abstract": "We present Loom, a tool. With Loom, users weave."}
    assert sl.title_tool_name(paper) == "Loom"
    assert sl.title_tool_name({"title": "Loom: Weaving", "abstract": "We weave a loom."}) is None


def test_title_tool_name_accepts_a_lowercase_coinage_named_in_the_abstract():
    paper = {"title": "lpviz: Linear Programs", "abstract": "We present lpviz, an interactive tool."}
    assert sl.title_tool_name(paper) == "lpviz"


# --- normalizing LLM outputs ---------------------------------------------------------------


@pytest.mark.parametrize(
    "raw, label",
    [
        ("DR Explainability", "DR Explainability"),
        ('"Uncertainty Glyphs".', "Uncertainty Glyphs"),
        ("Label: Tactile Charts\n", "Tactile Charts"),
        ("**LLM Agents**", "LLM Agents"),
        ("  multi-agent  ", "multi-agent"),
    ],
)
def test_normalize_label_cleans_outputs(raw, label):
    assert sl.normalize_label(raw) == label


@pytest.mark.parametrize("raw", ["", "Visualization", "User Study", "data analysis", "Three Word Label", None])
def test_normalize_label_rejects_generic_or_long_outputs(raw):
    assert sl.normalize_label(raw) is None


# --- LLM labeling with a mocked client -----------------------------------------------------


class FakeClient:
    model = "fake/model"

    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def complete(self, system, user):
        self.calls.append((system, user))
        return self.replies.pop(0)


PAPER = {"id": "p1", "title": "Dimensionality reduction explanations", "keywords": ["DR"], "abstract": "We explain DR."}


def test_llm_label_returns_the_validated_reply_and_caches_it(tmp_path):
    client = FakeClient(["DR Explainability"])
    assert sl.llm_label(PAPER, client, tmp_path) == "DR Explainability"
    # second run: served from the cache, no call
    again = FakeClient([])
    assert sl.llm_label(PAPER, again, tmp_path) == "DR Explainability"
    assert again.calls == []
    files = list(tmp_path.rglob("*.json"))
    assert len(files) == 1
    assert json.loads(files[0].read_text())["label"] == "DR Explainability"


def test_llm_label_retries_once_with_a_stricter_prompt_then_gives_up(tmp_path):
    client = FakeClient(["Visualization", "Interactive Visual Analytics System"])
    assert sl.llm_label(PAPER, client, tmp_path) is None
    assert len(client.calls) == 2
    assert client.calls[1][0] != client.calls[0][0]


def test_llm_label_retry_can_succeed(tmp_path):
    client = FakeClient(["A study of things", "DR Explainability"])
    assert sl.llm_label(PAPER, client, tmp_path) == "DR Explainability"


def test_llm_label_cache_only_mode_does_not_call(tmp_path):
    assert sl.llm_label(PAPER, None, tmp_path, model="fake/model") is sl.MISSING


def test_user_prompt_contains_title_keywords_and_abstract():
    text = sl.user_prompt(PAPER)
    assert "Title: Dimensionality reduction explanations" in text
    assert "Keywords: DR" in text
    assert "Abstract: We explain DR." in text


def test_lmstudio_client_sends_temperature_zero_and_reads_content():
    sent = {}

    class Resp:
        def raise_for_status(self):
            pass

        def json(self):
            return {"choices": [{"message": {"content": "DR Explainability", "reasoning_content": "…"}}]}

    def post(url, json, timeout):
        sent.update(url=url, body=json)
        return Resp()

    client = sl.LMStudioClient("http://localhost:1234/v1", "google/gemma-4-e4b", post=post)
    assert client.complete("sys", "user") == "DR Explainability"
    assert sent["url"] == "http://localhost:1234/v1/chat/completions"
    assert sent["body"]["temperature"] == 0
    assert sent["body"]["max_tokens"] >= 600
    assert sent["body"]["model"] == "google/gemma-4-e4b"


def test_lmstudio_client_refuses_non_local_urls():
    with pytest.raises(ValueError):
        sl.LMStudioClient("https://api.example.com/v1", "m")


# --- keyphrase fallback --------------------------------------------------------------------


def hash_encoder(texts):
    """Deterministic fake embeddings: bag of hashed words, so phrases sharing words are close."""
    out = np.zeros((len(texts), 64))
    for i, t in enumerate(texts):
        for w in t.lower().split():
            out[i, int(hashlib.md5(w.encode()).hexdigest(), 16) % 64] += 1
    norms = np.linalg.norm(out, axis=1, keepdims=True)
    return out / np.where(norms == 0, 1, norms)


KP_PAPERS = [
    {"id": "a", "title": "Uncertainty glyphs for weather ensembles", "keywords": ["uncertainty glyphs"],
     "abstract": "We design uncertainty glyphs. A user study shows uncertainty glyphs help with ensembles."},
    {"id": "b", "title": "Tactile charts for blind readers", "keywords": ["tactile charts", "accessibility"],
     "abstract": "Tactile charts let blind readers explore data. A user study with tactile charts."},
    {"id": "c", "title": "LLM agents that write charts", "keywords": ["LLM agents"],
     "abstract": "LLM agents generate charts. A user study evaluates LLM agents."},
]


def test_keyphrase_labels_are_specific_and_deterministic():
    embeddings = hash_encoder([sl.paper_text(p) for p in KP_PAPERS])
    a = sl.keyphrase_labels(KP_PAPERS, embeddings, encoder=hash_encoder)
    b = sl.keyphrase_labels(KP_PAPERS, embeddings, encoder=hash_encoder)
    assert a == b
    assert [label.lower() for label in a] == ["uncertainty glyphs", "tactile charts", "llm agents"]
    # "user study" appears in every paper: never a label
    assert all("study" not in label.lower() for label in a)


def test_keyphrase_labels_keep_acronym_casing():
    embeddings = hash_encoder([sl.paper_text(p) for p in KP_PAPERS])
    assert sl.keyphrase_labels(KP_PAPERS, embeddings, encoder=hash_encoder)[2] == "LLM agents"


def test_keyphrase_labels_fall_back_to_the_title_without_candidates():
    papers = [{"id": "x", "title": "T", "abstract": None}, {"id": "y", "title": "Zebra", "abstract": None}]
    labels = sl.keyphrase_labels(papers, np.ones((2, 64)) / 8, encoder=hash_encoder)
    assert labels[0] == "T" and labels[1]


# --- the pipeline step ---------------------------------------------------------------------


def make_conference(tmp_path, papers, **config):
    conf = tmp_path / "conferences" / "testconf"
    (conf / "data").mkdir(parents=True)
    (conf / "config.json").write_text(json.dumps({"id": "testconf", "name": "Test Conf", **config}))
    (conf / "data" / "papers.json").write_text(json.dumps(papers, ensure_ascii=False))
    hash_encoder([sl.paper_text(p) for p in papers]).astype("<f4").tofile(conf / "data" / "embeddings.bin")
    return conf


def test_run_adds_labels_without_changing_anything_else(tmp_path):
    papers = [{**KP_PAPERS[0], "x": 1.5}, {**KP_PAPERS[1], "title": "MAPLE: Tactile charts for blind readers"}, KP_PAPERS[2]]
    conf = make_conference(tmp_path, papers)
    before = (conf / "data" / "papers.json").read_bytes()
    sl.run("testconf", root=tmp_path, encoder=hash_encoder, cache_root=tmp_path / "cache", dims=64)
    out = json.loads((conf / "data" / "papers.json").read_text())
    assert [p["shortLabelSource"] for p in out] == ["keyphrase", "title", "keyphrase"]
    assert out[1]["shortLabel"] == "MAPLE"
    stripped = [{k: v for k, v in p.items() if k not in ("shortLabel", "shortLabelSource")} for p in out]
    assert json.dumps(stripped, ensure_ascii=False).encode() == before
    meta = json.loads((conf / "data" / "shortLabels.json").read_text())
    assert meta["counts"] == {"title": 1, "llm": 0, "keyphrase": 2}


def test_run_uses_the_llm_for_papers_without_a_tool_name(tmp_path):
    conf = make_conference(tmp_path, KP_PAPERS)
    client = FakeClient(["Uncertainty Glyphs", "Visualization", "Study", "LLM Charting", "Charts", "Data"])  # v3 retry for b too
    sl.run(
        "testconf", root=tmp_path, encoder=hash_encoder, cache_root=tmp_path / "cache", dims=64, client=client,
        concurrency=1,  # FakeClient answers in call order
    )
    out = json.loads((conf / "data" / "papers.json").read_text())
    assert [(p["shortLabel"], p["shortLabelSource"]) for p in out] == [
        ("Uncertainty glyphs", "llm"),
        ("Tactile charts", "keyphrase"),
        ("LLM charting", "llm"),
    ]
    meta = json.loads((conf / "data" / "shortLabels.json").read_text())
    assert meta["model"] == "fake/model" and set(meta["promptVersions"]) == {"v2", "v3"}


def test_run_does_nothing_when_disabled(tmp_path):
    conf = make_conference(tmp_path, KP_PAPERS, shortLabels={"enabled": False})
    before = (conf / "data" / "papers.json").read_bytes()
    assert sl.run("testconf", root=tmp_path, encoder=hash_encoder, cache_root=tmp_path / "cache", dims=64) is None
    assert (conf / "data" / "papers.json").read_bytes() == before


class SlowClient:
    """Answers from the title; later papers answer first, so completion order != paper order."""

    model = "fake/model"

    def __init__(self):
        self.lock = threading.Lock()
        self.active = self.peak = 0

    def complete(self, system, user):
        title = user.splitlines()[0].removeprefix("Title: ")
        with self.lock:
            self.active += 1
            self.peak = max(self.peak, self.active)
        time.sleep(0.05 * (len(PARALLEL) - int(title.split()[-1])))
        with self.lock:
            self.active -= 1
        return f"Topic {title.split()[-1]}"


PARALLEL = [{"id": f"q{i}", "title": f"Paper number {i}", "abstract": "Some topic words here."} for i in range(8)]


def test_concurrent_llm_requests_keep_paper_order_and_cache_each(tmp_path):
    client = SlowClient()
    papers = [dict(p) for p in PARALLEL]
    embeddings = hash_encoder([sl.paper_text(p) for p in papers])
    sl.add_short_labels(
        papers, embeddings, {"name": "C"}, client, hash_encoder, cache_root=tmp_path, concurrency=4
    )
    assert [p["shortLabel"] for p in papers] == [f"Topic {i}" for i in range(8)]
    assert client.peak > 1
    assert len(list(tmp_path.rglob("*.json"))) == 8
    assert not list(tmp_path.rglob("*.tmp"))


# --- cache paths (paper ids are scraped, so untrusted) -------------------------------------


@pytest.mark.parametrize("bad_id", ["../../etc/x", "/etc/passwd", "a/../../b"])
def test_cache_writes_stay_inside_the_cache_root(tmp_path, bad_id):
    root = tmp_path / "cache"
    assert sl.llm_label({**PAPER, "id": bad_id}, FakeClient(["DR Explainability"]), root) == "DR Explainability"
    written = [p for p in tmp_path.rglob("*") if p.is_file()]
    assert len(written) == 1 and written[0].resolve().is_relative_to(root.resolve())
    assert "/" not in written[0].name


@pytest.mark.parametrize("model", ["..", ".", ""])
def test_cache_path_rejects_dot_model_names(tmp_path, model):
    with pytest.raises(ValueError):
        sl._cache_file(tmp_path, model, "c", {"id": "p1"})


def test_cache_file_names_never_collide(tmp_path):
    names = {sl._cache_file(tmp_path, "m", "c", {"id": i}).name for i in ["a/b", "a_b", "a b", "..", "."]}
    assert len(names) == 5


# --- casing and near-duplicates ------------------------------------------------------------

FORMS = {"morse": "Morse", "jacobi": "Jacobi", "dance": "dance", "uncertainty": "uncertainty"}


@pytest.mark.parametrize(
    "label, cased",
    [
        ("Byte Dance", "Byte dance"),
        ("LLM Grounding", "LLM grounding"),
        ("Uncertainty Morse", "Uncertainty Morse"),
        ("uncertainty Jacobi", "Uncertainty Jacobi"),
        ("mCCDF Regression", "mCCDF regression"),
        ("Image-based Vision", "Image-based vision"),
        ("Evidence-Action Mismatches", "Evidence-action mismatches"),
        ("GPU2 Rendering", "GPU2 rendering"),
        ("Sheaf theory", "Sheaf theory"),
    ],
)
def test_sentence_case_keeps_acronyms_coinages_and_proper_nouns(label, cased):
    assert sl.sentence_case(label, FORMS) == cased


def test_merge_near_duplicates_prefers_the_title_spelling():
    papers = [
        {"shortLabel": "LeakAnalysis", "shortLabelSource": "title"},
        {"shortLabel": "Leak analysis", "shortLabelSource": "llm"},
        {"shortLabel": "Tactile charts", "shortLabelSource": "llm"},
        {"shortLabel": "Tactile Charts", "shortLabelSource": "keyphrase"},
        {"shortLabel": "tactile charts", "shortLabelSource": "llm"},
    ]
    sl.merge_near_duplicates(papers)
    assert [p["shortLabel"] for p in papers] == ["LeakAnalysis", "LeakAnalysis", "Tactile Charts", "Tactile Charts", "Tactile Charts"]


# --- committed labels (shortLabels.json) are the source of truth ---------------------------


def test_committed_labels_survive_a_wiped_cache(tmp_path, capsys):
    conf = make_conference(tmp_path, KP_PAPERS, shortLabels={"enabled": True, "model": "fake/model"})
    client = FakeClient(["Uncertainty Glyphs", "Visualization", "Study", "LLM Charting", "Charts", "Data"])  # v3 retry for b too
    kwargs = dict(root=tmp_path, encoder=hash_encoder, dims=64)
    sl.run("testconf", cache_root=tmp_path / "cache", client=client, concurrency=1, **kwargs)
    first = (conf / "data" / "papers.json").read_bytes()
    meta = json.loads((conf / "data" / "shortLabels.json").read_text())
    assert meta["labels"]["a"]["llm"] == {"v2": "Uncertainty Glyphs"} and meta["labels"]["a"]["promptVersion"] == "v2"
    assert meta["labels"]["b"]["llm"] == {"v2": None, "v3": None}  # rejected: known, not missing
    capsys.readouterr()
    # fresh clone: no cache, no LLM → same labels from shortLabels.json, no warning, no call
    sl.run("testconf", cache_root=tmp_path / "empty", client=None, **kwargs)
    assert (conf / "data" / "papers.json").read_bytes() == first
    assert "WARNING" not in capsys.readouterr().err
    assert not list((conf / "data").glob(".*.tmp"))


def test_missing_llm_labels_warn_loudly(tmp_path, capsys):
    conf = make_conference(tmp_path, KP_PAPERS)
    sl.run("testconf", root=tmp_path, encoder=hash_encoder, dims=64, cache_root=tmp_path / "cache", client=None)
    err = capsys.readouterr().err
    assert "WARNING: 3 papers have no LLM label" in err
    meta = json.loads((conf / "data" / "shortLabels.json").read_text())
    assert meta["missingLlm"] == 3 and meta["counts"]["keyphrase"] == 3


def test_a_changed_abstract_needs_a_new_llm_label(tmp_path):
    conf = make_conference(tmp_path, KP_PAPERS)
    kwargs = dict(root=tmp_path, encoder=hash_encoder, dims=64, cache_root=tmp_path / "cache", concurrency=1)
    sl.run("testconf", client=FakeClient(["Uncertainty Glyphs", "Tactile Maps", "LLM Charting"]), **kwargs)
    papers = json.loads((conf / "data" / "papers.json").read_text())
    papers[0]["abstract"] = "A different abstract about glyph uncertainty."
    (conf / "data" / "papers.json").write_text(json.dumps(papers))
    client = FakeClient(["Glyph Uncertainty"])
    sl.run("testconf", client=client, **kwargs)
    out = json.loads((conf / "data" / "papers.json").read_text())
    assert len(client.calls) == 1
    assert [p["shortLabel"] for p in out] == ["Glyph uncertainty", "Tactile maps", "LLM charting"]


# --- weak labels get a second try with prompt v3 -------------------------------------------

GLYPH = {"id": "g", "title": "Uncertainty glyphs for weather ensembles", "keywords": [], "abstract": "We design glyphs."}


@pytest.mark.parametrize(
    "label, source, weak",
    [
        ("Uncertainty glyphs", "llm", False),
        ("Design algorithm", "llm", True),  # only vague words
        ("Foundation models", "llm", True),
        ("Byte dance", "llm", True),  # no word from the paper
        ("Weather glyphs", "llm", False),
        ("tactile charts", "keyphrase", True),
        ("Ensemble members", "llm", False),  # "ensembles" shares the stem
    ],
)
def test_is_weak(label, source, weak):
    assert sl.is_weak(label, source, GLYPH) is weak


def test_is_weak_includes_labels_flagged_in_config():
    assert sl.is_weak("Weather glyphs", "llm", GLYPH, flagged=["weather Glyphs"])


def test_pick_refined_prefers_a_good_v3_else_the_more_specific_label():
    df = {"glyphs": 1, "uncertainty": 30, "design": 200, "algorithm": 40, "weather": 3}
    assert sl.pick_refined("Design algorithm", "Weather glyphs", GLYPH, df, 488) == ("Weather glyphs", "v3")
    # v3 still vague: the more specific (higher IDF) label wins
    assert sl.pick_refined("Weather design", "Design algorithm", GLYPH, df, 488) == ("Weather design", "v2")
    assert sl.pick_refined(None, None, GLYPH, df, 488) == (None, None)
    # no v2 label (keyphrase fallback): a vague v3 ("Design space") does not replace the keyphrase
    assert sl.pick_refined(None, "Design algorithm", GLYPH, df, 488) == (None, None)


def test_v3_reruns_only_weak_labels_and_is_recorded(tmp_path):
    conf = make_conference(tmp_path, KP_PAPERS, shortLabels={"enabled": True, "model": "fake/model"})
    client = FakeClient(["Uncertainty Glyphs", "Design Algorithm", "LLM Charting", "Blind Readers"])
    kwargs = dict(root=tmp_path, encoder=hash_encoder, dims=64, concurrency=1)
    sl.run("testconf", cache_root=tmp_path / "cache", client=client, **kwargs)
    assert len(client.calls) == 4
    assert client.calls[3][0] == sl.SYSTEM_PROMPT_V3.format(conference="Test Conf")
    out = json.loads((conf / "data" / "papers.json").read_text())
    assert [p["shortLabel"] for p in out] == ["Uncertainty glyphs", "Blind readers", "LLM charting"]
    labels = json.loads((conf / "data" / "shortLabels.json").read_text())["labels"]
    assert labels["b"]["llm"] == {"v2": "Design Algorithm", "v3": "Blind Readers"}
    assert labels["b"]["promptVersion"] == "v3" and labels["a"]["promptVersion"] == "v2"
    # rerun without cache or LLM: the committed map gives the same labels
    sl.run("testconf", cache_root=tmp_path / "empty", client=None, **kwargs)
    again = json.loads((conf / "data" / "papers.json").read_text())
    assert [p["shortLabel"] for p in again] == ["Uncertainty glyphs", "Blind readers", "LLM charting"]


def test_sentence_case_checks_each_hyphenated_part_against_the_abstracts():
    forms = {"non-linnaean": "non-Linnaean", "taxonomy": "taxonomy"}
    assert sl.sentence_case("Non-Linnaean Taxonomy", forms) == "Non-Linnaean taxonomy"


def test_sentence_case_uses_the_papers_own_deliberate_spelling():
    paper = {"title": "jk-Plots: Joint Kernel Plots", "abstract": "We present jk-plots. With jk-plots, users see more."}
    assert sl.sentence_case("Jk-Plots", {}, paper) == "jk-Plots"
    morse = {"title": "Topology", "abstract": "We use the Morse-Smale complex. Morse-Smale complexes help."}
    assert sl.sentence_case("morse-smale complex", {}, morse) == "Morse-Smale complex"
    # a Title Case title is not a deliberate spelling
    glyphs = {"title": "Uncertainty Glyphs for Weather", "abstract": "We design glyphs."}
    assert sl.sentence_case("Uncertainty Glyphs", {}, glyphs) == "Uncertainty glyphs"
