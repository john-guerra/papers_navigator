import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  continuity,
  neighborRanks,
  qualityMetrics,
  trustworthiness,
} from "../src/lib/drMetrics.js";

// 4 points on a line; the projection swaps the two ends (p0 ↔ p3)
const high = [[0], [1], [3], [7]];
const low = [[7], [1], [3], [0]];

describe("neighborRanks", () => {
  it("ranks every other point by distance, nearest = 1", () => {
    const ranks = neighborRanks(high);
    const row = (i) => Array.from(ranks.subarray(i * 4, i * 4 + 4));
    expect(row(0)).toEqual([0, 1, 2, 3]);
    expect(row(2)).toEqual([2, 1, 0, 3]);
    expect(row(3)).toEqual([3, 2, 1, 0]);
  });

  it("reads rows from a flat Float32Array with a dimension", () => {
    const flat = new Float32Array([0, 0, 1, 0, 3, 0]);
    expect(Array.from(neighborRanks(flat, { dims: 2 }))).toEqual([
      0, 1, 2, 1, 0, 2, 2, 1, 0,
    ]);
  });
});

describe("trustworthiness and continuity", () => {
  // Hand-checked, k = 1, n = 4: normalization 2 / (n·k·(2n − 3k − 1)) = 1/8.
  // Trustworthiness: low-space nearest neighbours missing in high space, penalized by their
  // high-space rank − k: p0→p2 (2−1), p1→p3 (3−1), p3→p1 (2−1) ⇒ 1 − 4/8 = 0.5.
  // Continuity mirrors it with the roles swapped: p0→p1 (2−1), p1→p0 (3−1), p3→p2 (2−1) ⇒ 0.5.
  // (sklearn.manifold.trustworthiness gives 0.5 for this example too.)
  it("match the hand-computed example", () => {
    const h = neighborRanks(high);
    const l = neighborRanks(low);
    expect(trustworthiness(h, l, 1)).toBeCloseTo(0.5, 12);
    expect(continuity(h, l, 1)).toBeCloseTo(0.5, 12);
  });

  it("are 1 for a projection that keeps every neighbourhood", () => {
    const h = neighborRanks(high);
    const l = neighborRanks([[0], [2], [6], [14]]);
    expect(trustworthiness(h, l, 1)).toBe(1);
    expect(continuity(h, l, 1)).toBe(1);
  });

  it("are not symmetric: a point moved into a gap (hand-checked, k = 1, n = 6)", () => {
    // p5 moves from 50 to 25, between p2 and p3. Normalization 2 / (6·1·8) = 1/24.
    // False neighbours: p2→p5 (rank 5 − 1), p3→p5 (4 − 1), p5→p2 (3 − 1) ⇒ T = 1 − 9/24.
    // Missing neighbours: p2→p1 (2 − 1), p3→p2 (2 − 1), p5→p4 (4 − 1) ⇒ C = 1 − 5/24.
    const h = neighborRanks([[0], [10], [20], [30], [40], [50]]);
    const l = neighborRanks([[0], [10], [20], [30], [40], [25]]);
    expect(trustworthiness(h, l, 1)).toBeCloseTo(1 - 9 / 24, 12);
    expect(continuity(h, l, 1)).toBeCloseTo(1 - 5 / 24, 12);
  });

  it("reject k outside 1 … n/2", () => {
    const h = neighborRanks(high);
    expect(() => trustworthiness(h, h, 0)).toThrow();
    expect(() => trustworthiness(h, h, 3)).toThrow();
  });
});

describe("qualityMetrics on IEEE VIS 2026", () => {
  // Reference values: sklearn.manifold.trustworthiness(X, Y, n_neighbors=k) and, for
  // continuity, trustworthiness(Y, X, n_neighbors=k) on the same files (Euclidean).
  const dir = new URL("../conferences/ieeevis2026/data/", import.meta.url);
  const papers = JSON.parse(readFileSync(new URL("papers.json", dir), "utf8"));
  const buffer = readFileSync(new URL("embeddings.bin", dir));
  const embeddings = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / 4,
  );
  const highRanks = neighborRanks(embeddings, { dims: 384 });
  const reference = {
    umap: { 5: [0.88158, 0.908507], 10: [0.863257, 0.882106] },
    tsne: { 5: [0.929351, 0.890176], 10: [0.885682, 0.858532] },
    pca: { 5: [0.718452, 0.837118], 10: [0.727595, 0.83187] },
  };
  for (const [method, byK] of Object.entries(reference)) {
    it(`matches sklearn for ${method}`, () => {
      const projection = JSON.parse(
        readFileSync(new URL(`projections/${method}.json`, dir), "utf8"),
      );
      const points = papers.map((p) => projection[p.id]);
      for (const [k, [t, c]] of Object.entries(byK)) {
        const m = qualityMetrics(highRanks, points, Number(k));
        expect(m.trustworthiness).toBeCloseTo(t, 5);
        expect(m.continuity).toBeCloseTo(c, 5);
      }
    });
  }
});
