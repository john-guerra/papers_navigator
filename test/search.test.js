import { describe, expect, it } from "vitest";
import { rankBySimilarity, toMatrix } from "../src/lib/search.js";
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
