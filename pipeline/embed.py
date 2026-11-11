"""Embed papers and compute 2D projections.

Usage: python -m pipeline.embed --conference ieeevis2026
Reads  conferences/<id>/data/papers.raw.json
Writes conferences/<id>/data/{papers.json, embeddings.bin, projections/<method>.json,
projections/basis.bin (the embeddings the projections were computed from), clusters.json}
"""

import argparse
import json
from pathlib import Path

import numpy as np

from pipeline.clusters import add_clusters, report, write_clusters
from pipeline.normalize import unify_keywords
from pipeline.short_labels import add_short_labels, read_store, write_atomic, write_meta

ROOT = Path(__file__).resolve().parent.parent
MODEL = "all-MiniLM-L6-v2"


def _umap(matrix):
    import umap
    from sklearn.preprocessing import StandardScaler

    return umap.UMAP(random_state=42).fit_transform(StandardScaler().fit_transform(matrix))


def _tsne(matrix):
    from sklearn.manifold import TSNE

    return TSNE(random_state=42, init="pca").fit_transform(matrix)


def _pca(matrix):
    from sklearn.decomposition import PCA

    return PCA(2).fit_transform(matrix)


REDUCERS = {"umap": _umap, "tsne": _tsne, "pca": _pca}


def default_encoder(texts):
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(MODEL).encode(texts, normalize_embeddings=True, show_progress_bar=True)


def embed_texts(papers) -> list[str]:
    return [f"{p['title']}\n{p['abstract']}" if p.get("abstract") else p["title"] for p in papers]


def write_embeddings(matrix: np.ndarray, path: Path) -> None:
    np.asarray(matrix).astype("<f4").tofile(path)


# Cosine to the last run's embedding above which a paper keeps its place (#178)
LAYOUT_MIN_COSINE = 0.98
# New papers a kept layout can take in (placed by their neighbours), as a share of the old ones
LAYOUT_MAX_ADDED = 0.05
# How many of the most similar papers place a new one
PLACE_NEIGHBOURS = 5


# Softmax temperature for those neighbours' weights: near-equal ones blend, weak ones (unrelated
# papers still score ~0.1-0.2) barely count
PLACE_TEMPERATURE = 0.05


def neighbour_weights(old_vectors: np.ndarray, new_vectors: np.ndarray, k: int = PLACE_NEIGHBOURS):
    """For each new paper, its k most similar old papers (cosine; the rows are unit vectors) and
    their weights: a softmax of similarity (PLACE_TEMPERATURE), summing to 1."""
    sims = np.asarray(new_vectors) @ np.asarray(old_vectors).T
    out = []
    for row in sims:
        top = np.argsort(-row)[: min(k, len(row))]
        w = np.exp((row[top] - row[top[0]]) / PLACE_TEMPERATURE)
        out.append((top, w / w.sum()))
    return out


def place_new(old_xy: np.ndarray, old_vectors: np.ndarray, new_vectors: np.ndarray, k: int = PLACE_NEIGHBOURS):
    """Positions for papers added to a kept layout: the weighted mean of their neighbours'
    positions (neighbour_weights), so a new paper lands among the papers it's like without
    moving anything."""
    return np.asarray(
        [(old_xy[top] * w[:, None]).sum(axis=0) for top, w in neighbour_weights(old_vectors, new_vectors, k)],
        dtype=float,
    ).reshape(-1, 2)


def vote(labels: list, weights) -> object:
    """The label (a topic id, or None for no topic) with the most neighbour weight."""
    top, w = weights
    totals: dict = {}
    for i, wi in zip(top, w):
        totals[labels[i]] = totals.get(labels[i], 0.0) + float(wi)
    return max(totals.items(), key=lambda kv: kv[1])[0]


def keep_clusters(papers: list[dict], matrix: np.ndarray, data_dir: Path):
    """With the layout kept, the topics stay too: re-running HDBSCAN on the same positions
    rewords labels and moves papers between topics. Old papers keep `cluster`/`clusterLabel`
    from the last papers.json; a new one takes its neighbours' topic by weight (vote); sizes in
    clusters.json are recounted, labels and terms kept. Returns the cluster list, or None when
    the last run's topics can't be read (then the caller clusters afresh)."""
    try:
        previous = {p["id"]: p for p in json.loads((data_dir / "papers.json").read_text())}
        info = json.loads((data_dir / "clusters.json").read_text())
    except (OSError, ValueError, TypeError, KeyError):
        return None
    if not info or not all("cluster" in p for p in previous.values()):
        return None
    labels = {c["id"]: c["label"] for c in info}
    old_rows = [k for k, p in enumerate(papers) if p["id"] in previous]
    new_rows = [k for k, p in enumerate(papers) if p["id"] not in previous]
    for k in old_rows:
        old = previous[papers[k]["id"]]
        papers[k]["cluster"], papers[k]["clusterLabel"] = old["cluster"], old.get("clusterLabel")
    old_topics = [papers[k]["cluster"] for k in old_rows]
    for k, weights in zip(new_rows, neighbour_weights(matrix[old_rows], matrix[new_rows])):
        topic = vote(old_topics, weights)
        papers[k]["cluster"], papers[k]["clusterLabel"] = topic, labels.get(topic)
    sizes = {}
    for p in papers:
        if p["cluster"] is not None:
            sizes[p["cluster"]] = sizes.get(p["cluster"], 0) + 1
    return [{**c, "size": sizes.get(c["id"], 0)} for c in info]


def keep_previous_order(papers: list[dict], previous: Path) -> list[dict]:
    """Papers in the order of the previous papers.json (#178), new ones last in scrape order.

    UMAP's output depends on the input order even with a fixed seed, so a refreshed scrape that
    lists the same papers in another order would otherwise reshuffle the map and its clusters."""
    try:
        rank = {p["id"]: i for i, p in enumerate(json.loads(previous.read_text()))}
    except (OSError, ValueError, TypeError, KeyError):
        return papers
    return sorted(papers, key=lambda p: rank.get(p["id"], len(rank)))


def previous_layout(papers: list[dict], matrix: np.ndarray, data_dir: Path, methods: list[str]):
    """The last layout and the embeddings it was computed from, if this run can keep it (#178).

    UMAP and t-SNE are chaotic: one embedding moving slightly (a retitled paper) reshuffles the
    whole map and its clusters. With the same papers and every embedding within cosine
    LAYOUT_MIN_COSINE of the embeddings the layout was computed from (`projections/basis.bin`,
    else the last run's embeddings.bin), the positions still describe the program. Comparing
    with the basis, not the last run, keeps small edits from adding up refresh after refresh
    (#179 review). Returns ({method: xy}, basis rows in `papers` order) or None."""
    try:
        old_ids = [p["id"] for p in json.loads((data_dir / "papers.json").read_text())]
        basis_file = data_dir / "projections" / "basis.bin"
        if not basis_file.exists():
            basis_file = data_dir / "embeddings.bin"
        old = np.fromfile(basis_file, dtype="<f4").reshape(len(old_ids), -1)
        projections = {
            m: json.loads((data_dir / "projections" / f"{m}.json").read_text()) for m in methods
        }
    except (OSError, ValueError, TypeError, KeyError):
        return None
    ids = [p["id"] for p in papers]
    old_set = set(old_ids)
    added = [i for i in ids if i not in old_set]
    if (
        not old_set <= set(ids)
        or len(added) > LAYOUT_MAX_ADDED * len(old_ids)
        or old.shape[1] != matrix.shape[1]
    ):
        print("layout: new projections (the set of papers changed)")
        return None
    if any(set(projections[m]) != old_set for m in methods):
        print("layout: new projections (a projection file lists other papers than papers.json)")
        return None
    row = {i: k for k, i in enumerate(old_ids)}
    kept_rows = [k for k, i in enumerate(ids) if i in old_set]
    kept_ids = [ids[k] for k in kept_rows]
    basis_kept = old[[row[i] for i in kept_ids]]
    current = matrix[kept_rows]
    norms = np.linalg.norm(basis_kept, axis=1) * np.linalg.norm(current, axis=1)
    cosine = np.sum(basis_kept * current, axis=1) / np.where(norms == 0, 1, norms)
    print(f"layout: lowest cosine to the layout's embeddings {cosine.min():.4f}")
    if cosine.min() < LAYOUT_MIN_COSINE:
        moved = [f"{kept_ids[k]} ({cosine[k]:.3f})" for k in np.flatnonzero(cosine < LAYOUT_MIN_COSINE)]
        print(f"layout: new projections, {len(moved)} papers changed: {', '.join(moved[:10])}")
        return None
    new_rows = [k for k, i in enumerate(ids) if i not in old_set]
    layout = {}
    for m in methods:
        xy = np.zeros((len(ids), 2))
        xy[kept_rows] = [projections[m][i] for i in kept_ids]
        if new_rows:
            xy[new_rows] = place_new(xy[kept_rows], current, matrix[new_rows])
        layout[m] = xy
    if added:
        print(f"layout: kept, {len(added)} new papers placed by their {PLACE_NEIGHBOURS} most similar: {', '.join(added)}")
    # The basis: what each position was computed from (a new paper: its own embedding)
    basis = np.zeros_like(matrix)
    basis[kept_rows] = basis_kept
    basis[new_rows] = matrix[new_rows]
    return layout, basis


def run(
    conference_id: str, root: Path = ROOT, encoder=None, reducers=None, relayout: bool = False
) -> None:
    encoder = encoder or default_encoder
    reducers = REDUCERS if reducers is None else reducers
    conf_dir = Path(root) / "conferences" / conference_id
    config = json.loads((conf_dir / "config.json").read_text())
    methods = config.get("projections", ["umap"])
    unknown = [m for m in methods if m not in reducers]
    if unknown:
        raise ValueError(f"unknown projection method(s): {', '.join(unknown)}")

    data_dir = conf_dir / "data"
    papers = json.loads((data_dir / "papers.raw.json").read_text())
    excluded = set(config.get("excludeTypeLabels", []))
    papers = [p for p in papers if p.get("typeLabel") not in excluded]
    papers = keep_previous_order(papers, data_dir / "papers.json")
    papers = unify_keywords(papers)
    matrix = np.asarray(encoder(embed_texts(papers)), dtype=np.float32)
    previous = None if relayout else previous_layout(papers, matrix, data_dir, methods)
    kept, basis = previous if previous else (None, matrix)
    if kept:
        print("layout: kept the last run's positions (same papers or a few new ones, embeddings barely moved)")
    write_embeddings(matrix, data_dir / "embeddings.bin")

    (data_dir / "projections").mkdir(exist_ok=True)
    # The embeddings the positions were computed from, for the next run's layout gate
    write_embeddings(np.asarray(basis, dtype=np.float32), data_dir / "projections" / "basis.bin")
    coords = {}
    for method in methods:
        xy = kept[method] if kept else np.asarray(reducers[method](matrix), dtype=float)
        coords[method] = xy
        projection = {p["id"]: [float(x), float(y)] for p, (x, y) in zip(papers, xy)}
        (data_dir / "projections" / f"{method}.json").write_text(json.dumps(projection))
        print(f"projection {method}: {len(projection)} points")

    default = coords[methods[0]]
    for p, (x, y) in zip(papers, default):
        p["x"], p["y"] = float(x), float(y)
        p["authorNames"] = ", ".join(a["name"] for a in p.get("authors") or [])
        p["affiliations"] = ", ".join(
            sorted({a["affiliation"] for a in p.get("authors") or [] if a.get("affiliation")})
        )
    # Topic clusters on the default projection (pipeline/clusters.py)
    info = keep_clusters(papers, matrix, data_dir) if kept else None
    if info is None:
        info = add_clusters(papers, default, config.get("clusters"))
    else:
        print(
            "clusters: kept the last run's topics (layout kept); after editing config clusters "
            "(stopWords, sizes) or titles, run `python -m pipeline.clusters` to recompute them"
        )
    # Short labels (pipeline/short_labels.py): committed LLM labels (shortLabels.json), the cache,
    # keyphrases; no LLM calls (papers it doesn't know are reported)
    short_meta = None
    if (config.get("shortLabels") or {}).get("enabled"):
        short_meta = add_short_labels(papers, matrix, config, encoder=encoder, store=read_store(data_dir))
    write_atomic(data_dir / "papers.json", json.dumps(papers, ensure_ascii=False))
    write_clusters(info, data_dir)
    if short_meta:
        write_meta(short_meta, data_dir)
    report(papers, info)
    print(f"wrote {len(papers)} papers, embeddings {matrix.shape}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--conference", default="ieeevis2026")
    parser.add_argument(
        "--relayout",
        action="store_true",
        help="compute new projections even when the last run's positions could be kept",
    )
    args = parser.parse_args()
    run(args.conference, relayout=args.relayout)
