import hashlib
import json

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
    files = list(tmp_path.rglob("p1.json"))
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
    assert sl.llm_label(PAPER, None, tmp_path, model="fake/model") is None


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
    client = FakeClient(["Uncertainty Glyphs", "Visualization", "Study", "Agent Charts"])
    sl.run("testconf", root=tmp_path, encoder=hash_encoder, cache_root=tmp_path / "cache", dims=64, client=client)
    out = json.loads((conf / "data" / "papers.json").read_text())
    assert [(p["shortLabel"], p["shortLabelSource"]) for p in out] == [
        ("Uncertainty Glyphs", "llm"),
        ("tactile charts", "keyphrase"),
        ("Agent Charts", "llm"),
    ]
    meta = json.loads((conf / "data" / "shortLabels.json").read_text())
    assert meta["model"] == "fake/model" and meta["promptVersion"] == sl.PROMPT_VERSION


def test_run_does_nothing_when_disabled(tmp_path):
    conf = make_conference(tmp_path, KP_PAPERS, shortLabels={"enabled": False})
    before = (conf / "data" / "papers.json").read_bytes()
    assert sl.run("testconf", root=tmp_path, encoder=hash_encoder, cache_root=tmp_path / "cache", dims=64) is None
    assert (conf / "data" / "papers.json").read_bytes() == before


# --- cache paths (paper ids are scraped, so untrusted) -------------------------------------


@pytest.mark.parametrize("bad_id", ["../../etc/x", "/etc/passwd", "a/../../b"])
def test_cache_writes_stay_inside_the_cache_root(tmp_path, bad_id):
    root = tmp_path / "cache"
    assert sl.llm_label({**PAPER, "id": bad_id}, FakeClient(["DR Explainability"]), root) == "DR Explainability"
    written = [p for p in tmp_path.rglob("*") if p.is_file()]
    assert len(written) == 1 and written[0].resolve().is_relative_to(root.resolve())
    assert "/" not in written[0].name


@pytest.mark.parametrize("model, paper_id", [("m", ".."), ("m", "."), ("..", "p1"), ("m", "")])
def test_cache_path_rejects_dot_names(tmp_path, model, paper_id):
    with pytest.raises(ValueError):
        sl._cache_file(tmp_path, model, "c", paper_id)
