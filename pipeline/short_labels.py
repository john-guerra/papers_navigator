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
import sys
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
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
# v3 (#99 review): rerun only for weak labels (`is_weak`), with few-shot examples from VIS 2026
REFINE_VERSION = "v3"
SYSTEM_PROMPT_V3 = (
    "You label research papers from {conference}. Every paper there is about visualization, so "
    "the label must name what sets THIS paper apart: its specific method, phenomenon, "
    "application domain or artifact, something that would not fit most other papers. Reply "
    "with ONLY the 1-2 word label. Keep acronyms and tool names. No punctuation, no quotes.\n"
    "Good labels from this conference: INR rendering (a volume rendering method for implicit "
    "neural representations), Sheaf theory (the math behind a model of visual encodings), "
    "PaintEcho (the paper's named tool), mCCDF regression (a plot adapted to ordinal "
    "regression results).\n"
    "Bad labels: Agentic System (fits dozens of papers), Learning Experience (vague: names no "
    "method, domain or artifact)."
)
PROMPTS = {"v2": SYSTEM_PROMPT, REFINE_VERSION: SYSTEM_PROMPT_V3}
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


def prompt_hash(conference: str, version: str = PROMPT_VERSION) -> str:
    spec = {
        "version": version,
        "system": PROMPTS[version].format(conference=conference),
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


def write_atomic(path: Path, text: str) -> None:
    """Write-then-rename, so an interrupted run never leaves a half-written file."""
    path = Path(path)
    tmp = path.with_name(f".{path.name}.{threading.get_ident()}.tmp")
    tmp.write_text(text)
    tmp.replace(path)


def input_hash(paper) -> str:
    """Hash of what the LLM sees for `paper`: a changed title/keywords/abstract needs a new label."""
    return hashlib.sha256(user_prompt(paper).encode()).hexdigest()[:16]


class _Missing:
    """No LLM answer known for a paper (unlike None: the LLM answered, but nothing usable)."""

    def __repr__(self):
        return "MISSING"


MISSING = _Missing()


def _cache_file(cache_root, model, conference, paper, version=PROMPT_VERSION) -> Path:
    """<cache>/<model>/<promptHash>/<hash of id + paper text>.json: hashing the (scraped,
    untrusted) id means names never collide or escape the cache, and an edited abstract misses."""
    root = Path(cache_root).resolve()
    key = hashlib.sha256(f"{paper['id']}\n{input_hash(paper)}".encode()).hexdigest()[:24]
    path = (root / _safe_name(model) / prompt_hash(conference, version) / f"{key}.json").resolve()
    if not path.is_relative_to(root):
        raise ValueError(f"cache path escapes {root}: {path}")
    return path


def llm_label(paper, client, cache_root, conference="the IEEE VIS conference", model=None, version=PROMPT_VERSION):
    """Validated LLM label (or None if the model's replies were rejected) for `paper`; cached per
    model + prompt. `client=None` reads the cache only and returns MISSING when it has no entry."""
    model = model or client.model
    path = _cache_file(cache_root, model, conference, paper, version)
    if path.exists():
        return json.loads(path.read_text())["label"]
    if client is None:
        return MISSING
    system = PROMPTS[version].format(conference=conference)
    replies = [client.complete(system, user_prompt(paper))]
    label = normalize_label(replies[0])
    if label is None:
        replies.append(client.complete(system + STRICT_SUFFIX, user_prompt(paper)))
        label = normalize_label(replies[1])
    path.parent.mkdir(parents=True, exist_ok=True)
    record = {"id": paper["id"], "label": label, "replies": replies, "model": model, "promptVersion": version}
    write_atomic(path, json.dumps(record, ensure_ascii=False))
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


# --- Casing and near-duplicates -----------------------------------------------------------


def _keeps_case(part: str, forms) -> bool:
    """Acronyms, inner capitals and digits (LLM, mCCDF, GPU2), and words the abstracts
    capitalize mid-sentence (proper nouns: Morse, Jacobi)."""
    if re.search(r"[A-Z].*[A-Z]", part) or re.search(r".[A-Z]", part) or re.search(r"\d", part):
        return True
    form = forms.get(part.lower(), "")
    return form[:1].isupper() and form.lower() == part.lower()


def _verbatim(label: str, paper) -> str | None:
    """The paper's own spelling of `label` when it uses a deliberate one: an abstract occurrence
    with a capital outside a sentence start ("non-Linnaean"), or a title occurrence with a
    lowercase-initial part ("jk-Plots"; a plain Title Case title says nothing about casing)."""
    if not paper:
        return None
    pattern = re.compile(r"(?<![\w-])" + re.escape(label) + r"(?![\w-])", re.I)
    abstract = paper.get("abstract") or ""
    for match in pattern.finditer(abstract):
        before = abstract[: match.start()].rstrip()
        if before and before[-1] not in ".!?:" and any(c.isupper() for c in match.group(0)):
            return match.group(0)
    for match in pattern.finditer(paper.get("title") or ""):
        spelling = match.group(0)
        if any(c.isupper() for c in spelling) and any(part[:1].islower() for part in re.split(r"[\s-]+", spelling)):
            return match.group(0)
    return None


def sentence_case(label: str, forms, paper=None) -> str:
    """"Byte Dance" → "Byte dance", "Image-based vision" stays, "LLM Grounding" → "LLM grounding",
    "uncertainty Morse" → "Uncertainty Morse". `forms` = surface_forms of the abstracts. Each
    hyphenated part is checked on its own ("Non-Linnaean": the abstracts write "non-Linnaean"),
    and the paper's own deliberate spelling of the whole label wins (`_verbatim`: "jk-Plots")."""
    own = _verbatim(label, paper)
    if own:
        return own
    words = []
    for word in label.split():
        form = forms.get(word.lower(), "")
        form_parts = form.split("-") if form.lower() == word.lower() else []
        parts = word.split("-")
        words.append(
            "-".join(
                p if _keeps_case(p, forms)
                else form_parts[i] if form_parts and any(c.isupper() for c in form_parts[i])
                else p.lower()
                for i, p in enumerate(parts)
            )
        )
    text = " ".join(words)
    return text[:1].upper() + text[1:] if text and not _keeps_case(text.split()[0].split("-")[0], forms) else text


def merge_near_duplicates(papers) -> None:
    """Labels that differ only in spacing or case ("Leak Analysis", "LeakAnalysis") get one
    spelling: a title-derived one if any, else the most common (ties: alphabetical)."""
    groups: dict[str, list] = {}
    for paper in papers:
        groups.setdefault(re.sub(r"\s+", "", paper["shortLabel"].lower()), []).append(paper)
    for group in groups.values():
        spellings = Counter(p["shortLabel"] for p in group)
        if len(spellings) < 2:
            continue
        titles = sorted(p["shortLabel"] for p in group if p["shortLabelSource"] == "title")
        best = titles[0] if titles else sorted(spellings, key=lambda s: (-spellings[s], s))[0]
        for paper in group:
            if paper["shortLabelSource"] != "title":
                paper["shortLabel"] = best


# --- Weak labels (rerun with prompt v3) ------------------------------------------------------

# Words that say little on their own: a label made only of these ("Design algorithm",
# "Foundation models", "Novice interaction") fits too many papers
VAGUE_WORDS = GENERIC_LABEL_WORDS | {
    "model", "models", "system", "systems", "design", "learning", "interaction", "analysis",
    "signal", "image", "images", "vision", "experience", "review", "agentic", "agent", "agents",
    "foundation", "interpretation", "novice", "novices", "time", "surface", "substance",
    "cognitive", "algorithm", "algorithms", "noise", "process", "performance", "insight",
    "insights", "understanding", "quality", "effect", "effects", "impact", "perspective",
    "reflection", "task", "tasks", "human", "ai", "knowledge", "skill", "skills", "practice",
    "practices", "behavior", "communication", "exploration", "generation", "representation",
    "structure", "pattern", "patterns", "space", "view", "views", "installation", "skin",
    "based", "image-based", "multi", "collaborative", "intelligent", "explanation", "support",
}
TEXT_TOKEN = re.compile(TOKEN_PATTERN)


def _words(text) -> list[str]:
    return [w.lower() for w in TEXT_TOKEN.findall(text or "")]


def _grounded(word: str, paper_words: set) -> bool:
    """`word` (or a word sharing its first 5 letters: "agentic"/"agents") is in the paper."""
    return word in paper_words or any(w[:5] == word[:5] for w in paper_words if len(word) >= 5)


def is_weak(label, source, paper, flagged=()) -> bool:
    """A label worth a second try with prompt v3: a keyphrase fallback, one John flagged
    (config shortLabels.weakLabels), one made only of vague words, or one whose words
    (crudely stemmed) appear nowhere in the paper's title, keywords or abstract ("Byte dance")."""
    if source == "keyphrase" or not label:
        return True
    words = _words(label)
    if label.lower() in {f.lower() for f in flagged} or all(w in VAGUE_WORDS for w in words):
        return True
    paper_words = set(_words(paper_text(paper)))
    return not any(_grounded(w, paper_words) for w in words)


def specificity(label, document_frequency, n_docs) -> float:
    """Mean IDF of the label's words across the papers (title + keywords + abstract)."""
    words = _words(label)
    if not words:
        return 0.0
    return float(np.mean([np.log((n_docs + 1) / (document_frequency.get(w, 0) + 1)) for w in words]))


def pick_refined(v2, v3, paper, document_frequency, n_docs, flagged=()):
    """(raw label, winning prompt version): v3 if it's valid and not weak, else the more
    specific of the two valid labels (ties: v2), else None. Without a v2 label the paper keeps
    its keyphrase rather than a weak v3 ("Design space" would replace "Rendering quantum")."""
    if v3 and not is_weak(v3, "llm", paper, flagged):
        return v3, REFINE_VERSION
    if not v2:
        return None, None
    candidates = [(label, version) for label, version in ((v2, PROMPT_VERSION), (v3, REFINE_VERSION)) if label]
    if not candidates:
        return None, None
    return max(candidates, key=lambda c: (specificity(c[0], document_frequency, n_docs), c[1] == PROMPT_VERSION))


# --- The pipeline step --------------------------------------------------------------------


def _stored_llm(entry, paper, model) -> dict:
    """The committed raw LLM labels for `paper` from shortLabels.json, {prompt version: label
    or None}, for this model and paper text ({} if none)."""
    if not entry or "llm" not in entry or entry.get("model") != model or entry.get("inputHash") != input_hash(paper):
        return {}
    llm = entry["llm"]
    return {k: v for k, v in llm.items() if k in PROMPTS} if isinstance(llm, dict) else {PROMPT_VERSION: llm}


def add_short_labels(
    papers, embeddings, config, client=None, encoder=None, cache_root=CACHE_ROOT, concurrency=1, store=None
):
    """Sets `shortLabel` / `shortLabelSource` on each paper; returns the metadata dict, whose
    `labels` (id → label, source, raw LLM label, model, prompt version, input hash) is committed
    in shortLabels.json and passed back as `store` on the next run: the source of truth, so a
    fresh clone or a wiped cache keeps the LLM labels. The LLM (or its cache) is asked only
    about papers the store doesn't cover; without an LLM those are reported loudly.

    LLM requests run `concurrency` at a time (each cached as soon as it finishes); labels are
    assigned in paper order, so the output doesn't depend on which request finishes first."""
    opts = {**DEFAULTS, **(config.get("shortLabels") or {})}
    conference = config.get("name") or config.get("id") or "the conference"
    model = client.model if client else opts["model"]
    stop_words = (config.get("clusters") or {}).get("stopWords", [])
    fallback = keyphrase_labels(papers, embeddings, encoder, stop_words=stop_words)
    names = [title_tool_name(p) for p in papers]
    store = store or {}
    stored = {p["id"]: _stored_llm(store.get(p["id"]), p, model) for p, name in zip(papers, names) if not name}

    def ask(todo, version):
        """{id: label} from the store, else the cache/LLM (MISSING when neither knows)."""
        known = {p["id"]: stored[p["id"]][version] for p in todo if version in stored[p["id"]]}
        rest = [p for p in todo if p["id"] not in known]

        def label_of(paper):
            return llm_label(paper, client, cache_root, conference, model=model, version=version)

        if concurrency > 1 and client is not None:
            with ThreadPoolExecutor(max_workers=concurrency) as pool:
                known.update(zip((p["id"] for p in rest), pool.map(label_of, rest)))
        else:
            known.update((p["id"], label_of(p)) for p in rest)
        return known

    base = [p for p, name in zip(papers, names) if not name]
    v2 = ask(base, PROMPT_VERSION)
    missing = [p for p in base if v2[p["id"]] is MISSING]
    if missing:
        print(
            f"WARNING: {len(missing)} papers have no LLM label (not in shortLabels.json or the cache, "
            f"and no LLM available); they get keyphrase labels. Run "
            f"`python -m pipeline.short_labels --llm lmstudio` to label them: "
            + ", ".join(p["id"] for p in missing[:10])
            + (" …" if len(missing) > 10 else ""),
            file=sys.stderr,
        )
    # Weak v2 labels (and keyphrase fallbacks) get a second try with prompt v3
    flagged = opts.get("weakLabels", [])
    weak = [p for p in base if v2[p["id"]] is not MISSING and is_weak(v2[p["id"]], "llm" if v2[p["id"]] else "keyphrase", p, flagged)]
    v3 = ask(weak, REFINE_VERSION)
    frequency = Counter(w for p in papers for w in set(_words(paper_text(p))))
    chosen = {}
    for paper in base:
        raw2, raw3 = v2[paper["id"]], v3.get(paper["id"], MISSING)
        if raw2 is MISSING:
            chosen[paper["id"]] = (None, None)
        elif raw3 is MISSING:
            chosen[paper["id"]] = (raw2, PROMPT_VERSION if raw2 else None)
        else:
            chosen[paper["id"]] = pick_refined(raw2, raw3, paper, frequency, len(papers), flagged)
    forms = surface_forms([p.get("abstract") for p in papers])
    labels = {}
    for paper, name, keyphrase in zip(papers, names, fallback):
        raw = None if name else chosen[paper["id"]][0]
        if name:
            paper["shortLabel"], paper["shortLabelSource"] = name, "title"
        elif raw:
            paper["shortLabel"], paper["shortLabelSource"] = sentence_case(raw, forms, paper), "llm"
        else:
            paper["shortLabel"], paper["shortLabelSource"] = sentence_case(keyphrase, forms, paper), "keyphrase"
    merge_near_duplicates(papers)
    for paper, name in zip(papers, names):
        entry = {"label": paper["shortLabel"], "source": paper["shortLabelSource"]}
        if not name and v2[paper["id"]] is not MISSING:
            raws = {PROMPT_VERSION: v2[paper["id"]]}
            if v3.get(paper["id"], MISSING) is not MISSING:
                raws[REFINE_VERSION] = v3[paper["id"]]
            entry.update(llm=raws, promptVersion=chosen[paper["id"]][1], model=model, inputHash=input_hash(paper))
        labels[paper["id"]] = entry
    counts = {s: sum(p["shortLabelSource"] == s for p in papers) for s in ("title", "llm", "keyphrase")}
    asked = any("llm" in e for e in labels.values())
    return {
        "model": model if asked else None,
        "promptVersions": {v: prompt_hash(conference, v) for v in PROMPTS} if asked else None,
        "refined": {v: sum(e.get("promptVersion") == v for e in labels.values()) for v in PROMPTS},
        "counts": counts,
        "missingLlm": len(missing),
        "labels": labels,
    }


def write_meta(meta, data_dir: Path) -> None:
    write_atomic(Path(data_dir) / "shortLabels.json", json.dumps(meta, indent=1, ensure_ascii=False) + "\n")


def read_store(data_dir: Path) -> dict:
    """The committed id → label entries from a previous run (empty if none)."""
    path = Path(data_dir) / "shortLabels.json"
    return json.loads(path.read_text()).get("labels", {}) if path.exists() else {}


def read_embeddings(path: Path, n: int, dims: int = DIMS) -> np.ndarray:
    return np.fromfile(path, dtype="<f4").reshape(n, dims)


def run(
    conference_id, root=ROOT, llm=None, client=None, encoder=None, cache_root=CACHE_ROOT, dims=DIMS, concurrency=4
):
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
    meta = add_short_labels(
        papers, embeddings, config, client, encoder, cache_root, concurrency, store=read_store(data_dir)
    )
    write_atomic(data_dir / "papers.json", json.dumps(papers, ensure_ascii=False))
    write_meta(meta, data_dir)
    labels = [p["shortLabel"] for p in papers]
    duplicates = len(labels) - len({label.lower() for label in labels})
    print(f"short labels: {meta['counts']}, {duplicates} duplicates, {time.time() - started:.0f}s")
    return meta


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--conference", default="ieeevis2026")
    parser.add_argument("--llm", choices=["lmstudio"], default=None)
    parser.add_argument("--concurrency", type=int, default=4, help="parallel LLM requests (default 4)")
    args = parser.parse_args()
    run(args.conference, llm=args.llm, concurrency=args.concurrency)
