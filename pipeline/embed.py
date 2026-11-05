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
    if sorted(ids) != sorted(old_ids) or old.shape[1] != matrix.shape[1]:
        print("layout: new projections (the set of papers changed)")
        return None
    if any(set(projections[m]) != set(ids) for m in methods):
        return None
    row = {i: k for k, i in enumerate(old_ids)}
    basis = old[[row[i] for i in ids]]
    norms = np.linalg.norm(basis, axis=1) * np.linalg.norm(matrix, axis=1)
    cosine = np.sum(basis * matrix, axis=1) / np.where(norms == 0, 1, norms)
    print(f"layout: lowest cosine to the layout's embeddings {cosine.min():.4f}")
    if cosine.min() < LAYOUT_MIN_COSINE:
        moved = [f"{ids[k]} ({cosine[k]:.3f})" for k in np.flatnonzero(cosine < LAYOUT_MIN_COSINE)]
        print(f"layout: new projections, {len(moved)} papers changed: {', '.join(moved[:10])}")
        return None
    return {m: np.asarray([projections[m][i] for i in ids], dtype=float) for m in methods}, basis


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
        print("layout: kept the last run's positions (same papers, embeddings barely moved)")
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
    info = add_clusters(papers, default, config.get("clusters"))
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
