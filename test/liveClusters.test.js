import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  clusterLabelsByKeyword,
  hdbscan,
  kmeans,
} from "../src/lib/liveClusters.js";

// Two tight blobs and a far point
const blobs = [
  [0, 0],
  [0.1, 0],
  [0, 0.1],
  [0.1, 0.1],
  [0.05, 0.05],
  [10, 10],
  [10.1, 10],
  [10, 10.1],
  [10.1, 10.1],
  [10.05, 10.05],
  [10.02, 10.08],
  [50, -40],
];

describe("kmeans", () => {
  it("separates obvious groups, largest cluster = 0", () => {
    const labels = kmeans(blobs.slice(0, 11), 2, { seed: 1 });
    expect(new Set(labels.slice(0, 5))).toEqual(new Set([1]));
    expect(new Set(labels.slice(5, 11))).toEqual(new Set([0]));
  });

  it("is deterministic for a seed", () => {
    const points = Array.from({ length: 60 }, (_, i) => [
      Math.sin(i * 1.7) * 5,
      Math.cos(i * 0.9) * 5,
    ]);
    expect(kmeans(points, 4, { seed: 7 })).toEqual(
      kmeans(points, 4, { seed: 7 }),
    );
  });

  it("caps k at the number of points", () => {
    expect(
      kmeans(
        [
          [0, 0],
          [1, 1],
        ],
        5,
      ),
    ).toHaveLength(2);
  });
});

describe("hdbscan", () => {
  it("finds the blobs and leaves the far point as noise (-1)", () => {
    const labels = hdbscan(blobs, { minClusterSize: 4, minSamples: 2 });
    expect(new Set(labels.slice(0, 5)).size).toBe(1);
    expect(new Set(labels.slice(5, 11)).size).toBe(1);
    expect(labels[5]).toBe(0); // the larger blob
    expect(labels[0]).toBe(1);
    expect(labels[11]).toBe(-1);
  });

  it("is all noise with fewer points than the minimum cluster size", () => {
    expect(
      hdbscan(
        [
          [0, 0],
          [1, 1],
        ],
        { minClusterSize: 5 },
      ),
    ).toEqual([-1, -1]);
  });

  it("reproduces the pipeline's sklearn HDBSCAN topics on IEEE VIS 2026", () => {
    // pipeline/clusters.py: HDBSCAN(min_cluster_size=12, min_samples=3) on the UMAP projection,
    // clusters renumbered largest first (ties: first seen) — the same convention as here.
    // Not bit-identical: merges at tied mutual-reachability distances depend on sort order
    // (sklearn itself labels 81 papers as noise instead of 80 if the rows are permuted), so a
    // handful of boundary papers may differ (and equal-size clusters may swap numbers).
    const dir = new URL("../conferences/ieeevis2026/data/", import.meta.url);
    const papers = JSON.parse(
      readFileSync(new URL("papers.json", dir), "utf8"),
    );
    const umap = JSON.parse(
      readFileSync(new URL("projections/umap.json", dir), "utf8"),
    );
    const labels = hdbscan(
      papers.map((p) => umap[p.id]),
      { minClusterSize: 12, minSamples: 3 },
    );
    const expected = papers.map((p) => p.cluster ?? -1);
    expect(Math.max(...labels)).toBe(Math.max(...expected));
    // Each live cluster ↔ the pipeline cluster it overlaps most; noise ↔ noise
    const overlap = new Map();
    labels.forEach((l, i) =>
      overlap.set(
        `${l} ${expected[i]}`,
        (overlap.get(`${l} ${expected[i]}`) ?? 0) + 1,
      ),
    );
    const match = new Map([[-1, -1]]);
    for (const [key] of [...overlap].sort((a, b) => b[1] - a[1])) {
      const [l, e] = key.split(" ").map(Number);
      if (!match.has(l) && ![...match.values()].includes(e)) match.set(l, e);
    }
    const same = labels.filter((l, i) => match.get(l) === expected[i]).length;
    expect(same / labels.length).toBeGreaterThan(0.98);
  });
});

describe("clusterLabelsByKeyword", () => {
  it("names each cluster by its most distinctive author keywords", () => {
    const papers = [
      { keywords: ["Uncertainty", "Maps"] },
      { keywords: ["uncertainty", "Evaluation"] },
      { keywords: ["LLM agents", "Evaluation"] },
      { keywords: ["LLM agents"] },
      { keywords: [] },
    ];
    expect(
      clusterLabelsByKeyword(papers, [0, 0, 1, 1, -1], { top: 2 }),
    ).toEqual(["Uncertainty, maps", "LLM agents, evaluation"]);
  });

  it("falls back to a number when a cluster has no keywords", () => {
    expect(clusterLabelsByKeyword([{}, {}], [0, 1])).toEqual([
      "Cluster 1",
      "Cluster 2",
    ]);
  });
});
