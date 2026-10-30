"""Topic clusters: HDBSCAN on the default 2D projection + c-TF-IDF labels (spec US2.3).

Usage: python -m pipeline.clusters --conference ieeevis2026
Reads  conferences/<id>/data/{papers.json, projections/<first method>.json}
Writes conferences/<id>/data/papers.json (+ `cluster`, `clusterLabel` per paper; null = noise)
       conferences/<id>/data/clusters.json ([{id, label, size, terms}], id 0 = largest)
`pipeline.embed` runs this too, so a full pipeline run always refreshes the clusters.

Why the 2D projection and not the 384-d embeddings: on VIS 2026, HDBSCAN on the embeddings
finds 2 clusters (30% noise) because distances concentrate in high dimensions, while on UMAP
it finds ~16 topics; clustering what the map shows also keeps every label on a visible clump
(same approach as chi2026_papers/scripts/compute_topic_labels.py). Deterministic: HDBSCAN has
no randomness and the UMAP projection uses a fixed seed.
Parameters come from config.json → "clusters" (minClusterSize, minSamples, stopWords).
"""

import argparse
import json
import re
from collections import Counter
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DEFAULTS = {"minClusterSize": 12, "minSamples": 3, "stopWords": []}
# Words of 2+ characters; hyphenated compounds (multi-agent, high-dimensional) stay one token
TOKEN_PATTERN = r"(?u)\b\w[\w-]*\w\b"
TOKEN = re.compile(TOKEN_PATTERN)
SENTENCE = re.compile(r"(?<=[.!?:])\s+|\n")
# Words that say how a paper is written, not what it is about
GENERIC_WORDS = [
    "paper", "propose", "proposed", "present", "presents", "approach", "approaches", "method",
    "methods", "results", "result", "show", "shows", "using", "based", "novel", "use", "used",
    "new", "work", "study", "studies", "findings", "provide", "provides", "including", "help",
    "enable", "enables", "allows", "support", "supports", "different", "various", "existing",
]


def cluster_points(xy, min_cluster_size=12, min_samples=3) -> np.ndarray:
    """HDBSCAN labels (-1 = noise), renumbered so cluster 0 is the largest (ties: first seen)."""
    from sklearn.cluster import HDBSCAN

    if len(xy) < max(min_cluster_size, min_samples + 1):
        return np.full(len(xy), -1)
    raw = HDBSCAN(min_cluster_size=min_cluster_size, min_samples=min_samples, copy=True).fit_predict(
        np.asarray(xy, dtype=float)
    )
    counts = Counter(int(label) for label in raw if label >= 0)
    first = {}
    for i, label in enumerate(raw):
        first.setdefault(int(label), i)
    order = sorted(counts, key=lambda label: (-counts[label], first[label]))
    remap = {old: new for new, old in enumerate(order)}
    return np.array([remap.get(int(label), -1) for label in raw])


def ctfidf_terms(docs, labels, top_n=8, stop_words=(), ngram_range=(1, 2)) -> list[list[str]]:
    """Top terms per cluster (index = cluster id) by class-based TF-IDF (BERTopic-style).

    Each cluster's docs become one document; TF is L1-normalized and square-rooted (damps
    words common everywhere), IDF is computed across clusters.
    """
    from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, CountVectorizer
    from sklearn.preprocessing import normalize

    labels = np.asarray(labels)
    ids = sorted(set(labels.tolist()) - {-1})
    cluster_docs = [" ".join(d for d, label in zip(docs, labels) if label == c) for c in ids]
    many = len(cluster_docs) > 3
    vectorizer = CountVectorizer(
        ngram_range=ngram_range,
        token_pattern=TOKEN_PATTERN,
        stop_words=sorted(ENGLISH_STOP_WORDS | {w.lower() for w in stop_words}),
        min_df=2 if many else 1,
        max_df=0.85 if many else 1.0,
    )
    tf = vectorizer.fit_transform(cluster_docs)
    names = vectorizer.get_feature_names_out()
    tf_norm = normalize(tf, norm="l1", axis=1).sqrt().tocsr()
    avg_words = tf.sum(axis=1).mean()
    df = np.asarray((tf > 0).sum(axis=0)).ravel()
    idf = np.log(1 + avg_words / (df + 1))
    scores = tf_norm.multiply(idf).tocsr()
    result = []
    for row in range(len(ids)):
        s = np.asarray(scores[row].todense()).ravel()
        # stable sort: ties broken by vocabulary (alphabetical) order, so runs are reproducible
        top = np.argsort(-s, kind="stable")[:top_n]
        result.append([str(names[i]) for i in top if s[i] > 0])
    return result


def surface_forms(docs, fallback_docs=()) -> dict[str, str]:
    """lowercase token → its most common spelling mid-sentence in `docs` (abstracts), else in
    `fallback_docs` (titles); ties go to the lowercase form. Sentence-initial words are
    skipped, so "Challenge" at the start of a sentence doesn't capitalize the label."""

    def count(texts, skip_initial):
        counts: dict[str, Counter] = {}
        for text in texts:
            for sentence in SENTENCE.split(text or ""):
                tokens = TOKEN.findall(sentence)
                for token in tokens[1:] if skip_initial else tokens:
                    counts.setdefault(token.lower(), Counter())[token] += 1
        return counts

    def best(low, forms):
        return sorted(forms.items(), key=lambda kv: (-kv[1], kv[0] != low, kv[0]))[0][0]

    result = {low: best(low, forms) for low, forms in count(fallback_docs, False).items()}
    result.update({low: best(low, forms) for low, forms in count(docs, True).items()})
    return result


def _stem(word: str) -> str:
    """Crude stem so a label never says both forms: folds a plural ("agents" → "agent") and
    keeps 6 letters ("accessible"/"accessibility", "volume"/"volumetric")."""
    word = word[:-1] if len(word) > 3 and word.endswith("s") and not word.endswith("ss") else word
    return word[:6]


def make_label(terms, forms=None, max_words=4, enough_words=3) -> str:
    """2–4 word label from ranked terms; sentence-cased, spelled as in the abstracts.

    A unigram is replaced by a bigram among the top 4 terms that contains it ("dimensionality"
    → "dimensionality reduction"; lower-ranked bigrams are often fragments like "large
    language"); terms whose words (plurals folded, hyphenated parts included) are already used
    are skipped; stops once it has `enough_words`, never exceeds `max_words`."""
    forms = forms or {}
    bigrams = [t for t in terms[:4] if len(t.split()) == 2]
    chosen: list[str] = []
    count = 0
    for term in terms:
        options = [b for b in bigrams if term in b.split()] if " " not in term else []
        for candidate in [*options[:1], term]:
            words = candidate.split()
            used = {_stem(w) for t in chosen for w in re.split(r"[\s-]+", t)}
            stems = {_stem(w) for w in re.split(r"[\s-]+", candidate)}
            if stems <= used:
                break
            if stems & used or count + len(words) > max_words:
                continue
            chosen.append(candidate)
            count += len(words)
            break
        if count >= enough_words:
            break
    label = ", ".join(" ".join(forms.get(w, w) for w in t.split()) for t in chosen)
    return label[:1].upper() + label[1:]


def paper_text(paper) -> str:
    return " ".join([paper.get("title") or "", paper.get("abstract") or "", " ".join(paper.get("keywords") or [])])


def compute(papers, xy, options=None):
    """(labels per paper, [{id, label, size, terms}]) for papers positioned at `xy`."""
    opts = {**DEFAULTS, **(options or {})}
    labels = cluster_points(xy, opts["minClusterSize"], opts["minSamples"])
    docs = [paper_text(p) for p in papers]
    if labels.max(initial=-1) < 0:
        return labels, []
    terms = ctfidf_terms(docs, labels, stop_words=GENERIC_WORDS + list(opts["stopWords"]))
    forms = surface_forms([p.get("abstract") for p in papers], [p.get("title") for p in papers])
    info = [
        {"id": c, "label": make_label(t, forms), "size": int((labels == c).sum()), "terms": t}
        for c, t in enumerate(terms)
    ]
    return labels, info


def add_clusters(papers, xy, options=None) -> list[dict]:
    """Sets `cluster` / `clusterLabel` on each paper (None for noise); returns the cluster list."""
    labels, info = compute(papers, xy, options)
    names = {c["id"]: c["label"] for c in info}
    for paper, label in zip(papers, labels):
        paper["cluster"] = int(label) if label >= 0 else None
        paper["clusterLabel"] = names.get(int(label))
    return info


def write_clusters(info, data_dir: Path) -> None:
    (Path(data_dir) / "clusters.json").write_text(json.dumps(info, ensure_ascii=False))


def run(conference_id: str, root: Path = ROOT) -> None:
    conf_dir = Path(root) / "conferences" / conference_id
    config = json.loads((conf_dir / "config.json").read_text())
    data_dir = conf_dir / "data"
    method = config.get("projections", ["umap"])[0]
    papers = json.loads((data_dir / "papers.json").read_text())
    projection = json.loads((data_dir / "projections" / f"{method}.json").read_text())
    xy = np.array([projection[p["id"]] for p in papers], dtype=float)
    info = add_clusters(papers, xy, config.get("clusters"))
    (data_dir / "papers.json").write_text(json.dumps(papers, ensure_ascii=False))
    write_clusters(info, data_dir)
    report(papers, info)


def report(papers, info) -> None:
    noise = sum(p["cluster"] is None for p in papers)
    print(f"clusters: {len(info)}, noise {noise}/{len(papers)} ({noise / max(len(papers), 1):.0%})")
    for c in info:
        print(f"  {c['id']:>3} n={c['size']:>3}  {c['label']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--conference", default="ieeevis2026")
    run(parser.parse_args().conference)
