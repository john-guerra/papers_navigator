"""Short paper labels (1–2 words per paper) for the map (#99).

Usage: python -m pipeline.short_labels --conference ieeevis2026 [--llm lmstudio]
Reads  conferences/<id>/data/{papers.json, embeddings.bin}
Writes conferences/<id>/data/papers.json (+ `shortLabel`, `shortLabelSource` per paper; nothing
       else changes) and conferences/<id>/data/shortLabels.json (model, prompt version, counts).

Each paper's label comes from, in order:
1. "title": the tool/system name before a colon or dash in the title ("FADEx: …" → "FADEx"),
   detected deterministically (`title_tool_name`), keeping the title's casing.
2. "llm": a local LM Studio model (OpenAI-compatible API on localhost only; no external API),
   with `--llm lmstudio`. Replies are validated (1–2 words, not generic), retried once with a
   stricter prompt, and cached in pipeline/cache/short_labels/<model>/<promptHash>/<id>.json so
   reruns are free and deterministic. Without `--llm`, cached replies are still used (no calls).
3. "keyphrase": a deterministic, offline KeyBERT-style fallback: 1–2-word candidates from title +
   keywords + abstract, scored by cosine similarity to the paper's embedding times an IDF
   specificity weight (phrases in many papers lose), with MMR for the alternates.
Config: config.json → "shortLabels" {enabled, model, baseUrl}. `pipeline.embed` reruns this step
when it's configured (cached LLM replies + keyphrases, no LLM calls), so labels survive a re-embed.
"""

import argparse
import hashlib
import json
import re
import time
from pathlib import Path
from urllib.parse import urlparse

import numpy as np

from pipeline.clusters import GENERIC_WORDS, TOKEN_PATTERN, surface_forms

ROOT = Path(__file__).resolve().parent.parent
CACHE_ROOT = ROOT / "pipeline" / "cache" / "short_labels"
DEFAULTS = {"enabled": True, "model": "google/gemma-4-e4b", "baseUrl": "http://localhost:1234/v1"}
DIMS = 384

# --- 1. Tool names from the title ---------------------------------------------------------

# A title prefix starting with one of these is a phrase, not a name ("Toward …:", "The … of …:")
PHRASE_STARTS = {
    "a", "an", "the", "toward", "towards", "beyond", "from", "when", "what", "who", "why", "how",
    "into", "on", "in", "of", "for", "with", "is", "are", "do", "does", "can", "not", "less",
    "more", "make", "save", "lost", "designing", "revisiting", "charting", "exploring", "visualize",
}
SEPARATOR = re.compile(r"^(.+?)(?::\s|\s[-–—]\s)")


def _coined(token: str) -> bool:
    """An acronym or coinage: 2+ capitals in a part (VIVA, CUBE-ism, MV-Bench), inner capital
    (FADEx, reVISit-XR), letters+digits (GNN101, Chart2SVG) or a trailing + (Libra+,
    Autoencoders++). Hyphenated plain words ("What-If", "Multi-Agent") are not coined."""
    letters = token.strip("+")
    if token.endswith("+") and letters:
        return True
    return any(
        re.search(r"[A-Z].*[A-Z]", part)
        or re.search(r"[a-z][A-Z]", part)
        or (re.search(r"[A-Za-z]", part) and re.search(r"\d", part))
        for part in letters.split("-")
    )


def _named_in_abstract(name: str, abstract: str) -> bool:
    """The abstract uses `name` with the same casing outside a sentence start ("We present Loom")."""
    for sentence in re.split(r"(?<=[.!?])\s+", abstract or ""):
        if re.search(rf"(?<!^)(?<=\W){re.escape(name)}(?![\w-])", sentence.strip()):
            return True
    return False


def title_tool_name(paper) -> str | None:
    """The tool/system name before ": " or " - " in the title, or None for a topic phrase.

    1–3 tokens, not starting with a phrase word; every token capitalized or coined and at least
    one coined ("Topological Autoencoders++"). A single plain word ("Loom", "lpviz") counts only
    when the abstract uses it as a name, so "Ripples: How Charts Spread" stays a phrase."""
    match = SEPARATOR.match((paper.get("title") or "").strip())
    if not match:
        return None
    name = match.group(1).strip()
    tokens = name.split()
    if not 1 <= len(tokens) <= 3 or tokens[0].lower() in PHRASE_STARTS:
        return None
    if not all(re.fullmatch(r"[\w][\w.+-]*", t) for t in tokens):
        return None
    if any(_coined(t) for t in tokens) and all(t[0].isupper() or _coined(t) for t in tokens):
        return name
    if len(tokens) == 1 and _named_in_abstract(name, paper.get("abstract") or ""):
        return name
    return None


# --- 2. LLM labels (LM Studio, localhost) -------------------------------------------------

PROMPT_VERSION = "v2"
# v1 (John's test prompt) gave good labels but many repeats ("LLM Agents", "Uncertainty
# Visualization"); v2 adds the conference context and asks for labels that tell papers apart.
SYSTEM_PROMPT = (
    "You label research papers from {conference}, where every paper is about visualization, so "
    "words like visualization, visual, data, study, system, tool, analysis, framework or design "
    "say nothing. Reply with ONLY a 1-2 word label naming this paper's specific topic, the "
    "thing that sets it apart from the other papers at the conference; avoid labels that would "
    "fit many papers. Keep acronyms. No punctuation, no quotes."
)
STRICT_SUFFIX = (
    " Your previous reply was rejected because it was longer than 2 words or too generic. "
    "Reply with exactly 1 or 2 specific words."
)
TEMPERATURE = 0
SEED = 42
MAX_TOKENS = 1200  # the model reasons (~350 tokens) before answering

GENERIC_LABEL_WORDS = {
    "visualization", "visualizations", "visualisation", "visual", "vis", "study", "studies",
    "system", "systems", "analysis", "analyses", "analytics", "data", "framework", "tool", "tools",
    "approach", "paper", "method", "methods", "design", "interactive", "interface", "user",
    "users", "evaluation", "research", "technique", "techniques", "model", "models", "survey",
    "application", "applications", "information", "chart", "charts", "graphics", "display",
}


def normalize_label(raw) -> str | None:
    """1–2 words (hyphenated words and acronyms allowed) without quotes, markdown or trailing
    punctuation, or None if empty, longer or made only of generic words."""
    if not raw:
        return None
    lines = [line for line in str(raw).strip().splitlines() if line.strip()]
    if not lines:
        return None
    text = re.sub(r"^\s*(label|answer)\s*:\s*", "", lines[0], flags=re.I)
    text = re.sub(r"[*_`\"“”‘’'«»]", "", text)
    text = re.sub(r"[.,;:!?()\[\]]+", " ", text)
    words = text.split()
    if not 1 <= len(words) <= 2 or len(" ".join(words)) > 40:
        return None
    if all(w.lower().strip("-") in GENERIC_LABEL_WORDS for w in words):
        return None
    return " ".join(words)


def user_prompt(paper) -> str:
    return (
        f"Title: {paper.get('title') or ''}\n"
        f"Keywords: {', '.join(paper.get('keywords') or [])}\n"
        f"Abstract: {paper.get('abstract') or ''}"
    )


def prompt_hash(conference: str) -> str:
    spec = {
        "version": PROMPT_VERSION,
        "system": SYSTEM_PROMPT.format(conference=conference),
        "strict": STRICT_SUFFIX,
        "temperature": TEMPERATURE,
        "seed": SEED,
        "maxTokens": MAX_TOKENS,
    }
    return hashlib.sha256(json.dumps(spec, sort_keys=True).encode()).hexdigest()[:12]


class LMStudioClient:
    """Chat completions on a local OpenAI-compatible server (LM Studio). Refuses non-local URLs."""

    def __init__(self, base_url, model, post=None, timeout=300):
        if urlparse(base_url).hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError(f"short labels only use a local LLM server, not {base_url}")
        if post is None:
            import requests

            post = requests.post
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.post = post
        self.timeout = timeout

    def available(self) -> bool:
        import requests

        try:
            models = requests.get(f"{self.base_url}/models", timeout=5).json()["data"]
        except Exception:
            return False
        return any(m.get("id") == self.model for m in models)

    def complete(self, system, user) -> str:
        body = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": TEMPERATURE,
            "seed": SEED,
            "max_tokens": MAX_TOKENS,
        }
        response = self.post(f"{self.base_url}/chat/completions", json=body, timeout=self.timeout)
        response.raise_for_status()
        return response.json()["choices"][0]["message"].get("content") or ""


def _safe_name(value) -> str:
    """A single path component: letters, digits, `.`, `-`, `_` only; never empty, `.` or `..`.
    Paper ids come from scraped pages, so they're untrusted."""
    name = re.sub(r"[^\w.-]+", "_", str(value))
    if name.strip(".") == "":
        raise ValueError(f"unsafe cache name: {value!r}")
    return name


def _cache_file(cache_root, model, conference, paper_id) -> Path:
    root = Path(cache_root).resolve()
    path = (root / _safe_name(model) / prompt_hash(conference) / f"{_safe_name(paper_id)}.json").resolve()
    if not path.is_relative_to(root):
        raise ValueError(f"cache path escapes {root}: {path}")
    return path


def llm_label(paper, client, cache_root, conference="the IEEE VIS conference", model=None):
    """Validated LLM label (or None) for `paper`; cached per model + prompt. `client=None` reads
    the cache only."""
    model = model or client.model
    path = _cache_file(cache_root, model, conference, paper["id"])
    if path.exists():
        return json.loads(path.read_text())["label"]
    if client is None:
        return None
    system = SYSTEM_PROMPT.format(conference=conference)
    replies = [client.complete(system, user_prompt(paper))]
    label = normalize_label(replies[0])
    if label is None:
        replies.append(client.complete(system + STRICT_SUFFIX, user_prompt(paper)))
        label = normalize_label(replies[1])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"label": label, "replies": replies, "model": model, "promptVersion": PROMPT_VERSION}, ensure_ascii=False)
    )
    return label


# --- 3. Keyphrase fallback ----------------------------------------------------------------

# Words that never start or end a candidate phrase (generic label words may sit inside one:
# "tactile charts" is fine, "charts" alone or "user study" is not)
STOP_PHRASE_WORDS = set(GENERIC_WORDS) | {
    "ieee", "participants", "et", "al", "also", "however", "particular", "specific",
    "specifically", "real-world", "case", "cases", "task", "tasks", "insights", "domain",
    "experts", "expert", "usage", "key", "paper", "papers", "user", "users",
}
SEGMENT = re.compile(r"[.,;:!?()\[\]\n\"“”]+|-{2,}|\s[-–—]\s")
# A phrase ending in an adjective/verb-like word is a fragment ("produces interactive",
# "benchmarking multimodal", "3D ellipsoid-based"): candidates must end in a noun-like word
FRAGMENT_END = re.compile(r"(ly|based|ive|al|ous|ful|able|ible|ic)$")
NOUN_EXCEPTIONS = {
    "narrative", "archive", "perspective", "objective", "alternative", "initiative", "retrieval",
    "signal", "interval", "tutorial", "journal", "portal", "proposal", "removal", "terminal",
    "material", "manual", "festival", "hospital", "capital", "animal", "topic", "music",
    "traffic", "logic", "clinic", "rhetoric", "epidemic", "pandemic", "magic", "graphic",
}
TOKEN_RE = re.compile(TOKEN_PATTERN)


def candidate_analyzer(stop_words):
    """Text → 1–2-grams of adjacent words within a clause; no stop word, no all-generic or
    numeric phrase. Unlike CountVectorizer's default, removing a stop word never joins its
    neighbours ("glyphs for weather" doesn't give "glyphs weather")."""

    def analyze(text):
        grams = []
        for segment in SEGMENT.split(text.lower()):
            tokens = TOKEN_RE.findall(segment)
            for i, token in enumerate(tokens):
                for gram in (tokens[i : i + 1], tokens[i : i + 2]) if i + 1 < len(tokens) else (tokens[i : i + 1],):
                    if any(w in stop_words for w in gram) or all(w in GENERIC_LABEL_WORDS for w in gram):
                        continue
                    if all(re.fullmatch(r"[\d.-]+", w) for w in gram) or (
                        FRAGMENT_END.search(gram[-1]) and gram[-1] not in NOUN_EXCEPTIONS
                    ):
                        continue
                    grams.append(" ".join(gram))
        return grams

    return analyze


def paper_text(paper) -> str:
    return "\n".join([paper.get("title") or "", ", ".join(paper.get("keywords") or []), paper.get("abstract") or ""])


def default_encoder(texts):
    from pipeline.embed import default_encoder as encode

    return encode(texts)


def _mmr(candidate_vecs, doc_vec, scores, k=3, diversity=0.3) -> list[int]:
    """Indices of up to k candidates: best score first, then relevance traded against redundancy."""
    chosen = [int(np.argmax(scores))]
    while len(chosen) < min(k, len(scores)):
        redundancy = (candidate_vecs @ candidate_vecs[chosen].T).max(axis=1)
        mmr = (1 - diversity) * scores - diversity * redundancy
        mmr[chosen] = -np.inf
        chosen.append(int(np.argmax(mmr)))
    return chosen


def keyphrases(papers, embeddings, encoder=None, k=3, stop_words=()) -> list[list[str]]:
    """Top-k 1–2-word keyphrases per paper (best first), deterministic for a given encoder."""
    from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, CountVectorizer

    encoder = encoder or default_encoder
    docs = [paper_text(p) for p in papers]
    stops = frozenset(ENGLISH_STOP_WORDS | STOP_PHRASE_WORDS | {w.lower() for w in stop_words})
    vectorizer = CountVectorizer(analyzer=candidate_analyzer(stops))
    try:
        counts = vectorizer.fit_transform(docs).tocsr()
    except ValueError:  # empty vocabulary
        return [[] for _ in papers]
    names = vectorizer.get_feature_names_out()
    df = np.asarray((counts > 0).sum(axis=0)).ravel()
    n = len(papers)
    # IDF specificity in (0, 1]: a phrase in one paper keeps its score, one in every paper ~0
    specificity = np.log((n + 1) / (df + 0.5)) / np.log((n + 1) / 1.5)
    used = sorted({int(j) for i in range(n) for j in counts[i].indices})
    vecs = np.zeros((len(names), np.asarray(embeddings).shape[1]), dtype=float)
    if used:
        encoded = np.asarray(encoder([str(names[j]) for j in used]), dtype=float)
        encoded /= np.maximum(np.linalg.norm(encoded, axis=1, keepdims=True), 1e-12)
        vecs[used] = encoded
    result = []
    for i in range(n):
        idx = np.array(sorted(counts[i].indices), dtype=int)
        if not len(idx):
            result.append([])
            continue
        doc = np.asarray(embeddings[i], dtype=float)
        doc = doc / max(np.linalg.norm(doc), 1e-12)
        heading = f"{papers[i].get('title') or ''} {' '.join(papers[i].get('keywords') or [])}".lower()
        in_heading = np.array([1.15 if re.search(rf"\b{re.escape(names[j])}\b", heading) else 1.0 for j in idx])
        scores = np.clip(vecs[idx] @ doc, 0, None) * specificity[idx] * in_heading
        picks = _mmr(vecs[idx], doc, scores, k=k)
        result.append([str(names[idx[j]]) for j in picks])
    return result


def keyphrase_labels(papers, embeddings, encoder=None, stop_words=()) -> list[str]:
    """One keyphrase label per paper, spelled as in the abstracts ("LLM agents"); a paper with
    no candidate gets its title's first two words."""
    forms = surface_forms([p.get("abstract") for p in papers], [p.get("title") for p in papers])
    labels = []
    for paper, phrases in zip(papers, keyphrases(papers, embeddings, encoder, stop_words=stop_words)):
        if phrases:
            labels.append(" ".join(forms.get(w, w) for w in phrases[0].split()))
        else:
            labels.append(" ".join((paper.get("title") or "").split()[:2]))
    return labels


# --- The pipeline step --------------------------------------------------------------------


def add_short_labels(papers, embeddings, config, client=None, encoder=None, cache_root=CACHE_ROOT):
    """Sets `shortLabel` / `shortLabelSource` on each paper; returns the metadata dict."""
    opts = {**DEFAULTS, **(config.get("shortLabels") or {})}
    conference = config.get("name") or config.get("id") or "the conference"
    model = client.model if client else opts["model"]
    stop_words = (config.get("clusters") or {}).get("stopWords", [])
    fallback = keyphrase_labels(papers, embeddings, encoder, stop_words=stop_words)
    for paper, keyphrase in zip(papers, fallback):
        name = title_tool_name(paper)
        label = None if name else llm_label(paper, client, cache_root, conference, model=model)
        paper["shortLabel"], paper["shortLabelSource"] = (
            (name, "title") if name else (label, "llm") if label else (keyphrase, "keyphrase")
        )
    counts = {s: sum(p["shortLabelSource"] == s for p in papers) for s in ("title", "llm", "keyphrase")}
    return {
        "model": model if counts["llm"] else None,
        "promptVersion": PROMPT_VERSION if counts["llm"] else None,
        "promptHash": prompt_hash(conference) if counts["llm"] else None,
        "counts": counts,
    }


def write_meta(meta, data_dir: Path) -> None:
    (Path(data_dir) / "shortLabels.json").write_text(json.dumps(meta, indent=2) + "\n")


def read_embeddings(path: Path, n: int, dims: int = DIMS) -> np.ndarray:
    return np.fromfile(path, dtype="<f4").reshape(n, dims)


def run(conference_id, root=ROOT, llm=None, client=None, encoder=None, cache_root=CACHE_ROOT, dims=DIMS):
    conf_dir = Path(root) / "conferences" / conference_id
    config = json.loads((conf_dir / "config.json").read_text())
    opts = {**DEFAULTS, **(config.get("shortLabels") or {})}
    if not opts["enabled"]:
        print("short labels disabled in config.json")
        return None
    data_dir = conf_dir / "data"
    papers = json.loads((data_dir / "papers.json").read_text())
    embeddings = read_embeddings(data_dir / "embeddings.bin", len(papers), dims)
    if client is None and llm == "lmstudio":
        client = LMStudioClient(opts["baseUrl"], opts["model"])
        if not client.available():
            print(f"LM Studio not reachable at {opts['baseUrl']} with {opts['model']}: cached labels + keyphrases")
            client = None
    started = time.time()
    meta = add_short_labels(papers, embeddings, config, client, encoder, cache_root)
    if client is None and meta["counts"]["llm"]:  # cache-only run that found cached replies
        meta.update(model=opts["model"])
    (data_dir / "papers.json").write_text(json.dumps(papers, ensure_ascii=False))
    write_meta(meta, data_dir)
    labels = [p["shortLabel"] for p in papers]
    duplicates = len(labels) - len({label.lower() for label in labels})
    print(f"short labels: {meta['counts']}, {duplicates} duplicates, {time.time() - started:.0f}s")
    return meta


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--conference", default="ieeevis2026")
    parser.add_argument("--llm", choices=["lmstudio"], default=None)
    args = parser.parse_args()
    run(args.conference, llm=args.llm)
