"""Embed papers and compute 2D projections.

Usage: python -m pipeline.embed --conference ieeevis2026
Reads  conferences/<id>/data/papers.raw.json
Writes conferences/<id>/data/{papers.json, embeddings.bin, projections/<method>.json}
"""

import argparse
import json
from pathlib import Path

import numpy as np

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
    (data_dir / "papers.json").write_text(json.dumps(papers, ensure_ascii=False))
    print(f"wrote {len(papers)} papers, embeddings {matrix.shape}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--conference", default="ieeevis2026")
    run(parser.parse_args().conference)
