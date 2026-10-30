import { describe, expect, it } from "vitest";
import {
  lazyLoader,
  rankBySimilarity,
  relevanceCounts,
  relevanceCuts,
  toMatrix,
} from "../src/lib/search.js";
import { applyProjection } from "../src/lib/projections.js";

describe("toMatrix", () => {
  it("rejects a buffer that does not match the papers", () => {
    expect(() => toMatrix(new ArrayBuffer(8), 1, 384)).toThrow(
      "embeddings/papers mismatch",
    );
  });

  it("wraps a matching buffer as Float32Array", () => {
    const m = toMatrix(new Float32Array([1, 2, 3, 4]).buffer, 2, 2);
    expect(Array.from(m)).toEqual([1, 2, 3, 4]);
  });
});

describe("rankBySimilarity", () => {
  const papers = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const matrix = new Float32Array([1, 0, 0, 1, 0.6, 0.8]);

  it("sorts papers by cosine similarity to the query", () => {
    const ranked = rankBySimilarity(
      new Float32Array([1, 0]),
      matrix,
      papers,
      2,
    );
    expect(ranked.map((d) => d.id)).toEqual(["a", "c", "b"]);
    expect(ranked.map((d) => d.score)).toEqual([1, expect.closeTo(0.6, 5), 0]);
  });

  it("does not mutate the input papers", () => {
    rankBySimilarity(new Float32Array([1, 0]), matrix, papers, 2);
    expect(papers[0]).toEqual({ id: "a" });
  });
});

describe("applyProjection", () => {
  it("replaces coordinates and drops papers missing from the projection", () => {
    const input = [{ id: "a", x: 0, y: 0 }, { id: "b" }];
    const { papers, missing } = applyProjection(input, { a: [5, 6] });
    expect(papers).toEqual([{ id: "a", x: 5, y: 6 }]);
    expect(missing).toBe(1);
    expect(input[0]).toEqual({ id: "a", x: 0, y: 0 });
  });
});

describe("lazyLoader (#70)", () => {
  it("loads once, on the first call, and retries after a failure", async () => {
    let calls = 0;
    const load = lazyLoader(async () => {
      calls++;
      if (calls === 1) throw new Error("offline");
      return "matrix";
    });
    expect(calls).toBe(0);
    await expect(load()).rejects.toThrow("offline");
    expect(await load()).toBe("matrix");
    expect(await load()).toBe("matrix");
    expect(calls).toBe(2);
  });
});

describe("Weak relevance level", () => {
  it("adds a weak cut below good (2/3 of it) and counts it", () => {
    const scores = [0.6, 0.5, 0.45, 0.4, 0.35, 0.31, 0.25, 0.21, 0.1];
    const cuts = relevanceCuts(scores);
    expect(cuts.good).toBe(0.3);
    expect(cuts.weak).toBeCloseTo(0.2);
    const papers = scores.map((score) => ({ score }));
    expect(relevanceCounts(papers, cuts)).toEqual({
      strong: 3,
      good: 6,
      weak: 8,
      all: 9,
    });
  });
});
