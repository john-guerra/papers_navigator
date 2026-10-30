"""Embed papers and compute 2D projections.

Usage: python -m pipeline.embed --conference ieeevis2026
Reads  conferences/<id>/data/papers.raw.json
Writes conferences/<id>/data/{papers.json, embeddings.bin, projections/<method>.json, clusters.json}
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


def run(conference_id: str, root: Path = ROOT, encoder=None, reducers=None) -> None:
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
    papers = unify_keywords(papers)
    matrix = np.asarray(encoder(embed_texts(papers)), dtype=np.float32)
    write_embeddings(matrix, data_dir / "embeddings.bin")

    (data_dir / "projections").mkdir(exist_ok=True)
    coords = {}
    for method in methods:
        xy = np.asarray(reducers[method](matrix), dtype=float)
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
    run(parser.parse_args().conference)
