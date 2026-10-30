import { describe, expect, it, vi } from "vitest";
import {
  createVectorCache,
  hashText,
  pruneVectorCache,
  programFingerprint,
  researchCuts,
  researchVectors,
} from "../src/lib/myResearch.js";

function memoryStorage() {
  const data = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => delete data[k],
  };
}

describe("researchCuts", () => {
  // mean 0.2, sd 0.1 for the bulk; a few clear outliers
  const bulk = Array.from({ length: 100 }, (_, i) => (i % 2 ? 0.1 : 0.3));
  it("Good = mean + 2 sd, Strong = mean + 2.5 sd of the program's scores", () => {
    const scores = [...bulk, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65];
    const mean = scores.reduce((a, b) => a + b) / scores.length;
    const sd = Math.sqrt(
      scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length,
    );
    const { good, strong } = researchCuts(scores);
    expect(good).toBeCloseTo(mean + 2 * sd);
    expect(strong).toBeCloseTo(mean + 2.5 * sd);
  });

  it("falls back to the 10th best when fewer than 5 papers clear Good", () => {
    const scores = [...bulk, 0.9];
    const { good, strong } = researchCuts(scores);
    expect(good).toBe(0.3);
    expect(strong).toBeGreaterThanOrEqual(good);
  });

  it("never puts Strong above the best score", () => {
    const scores = [...bulk, 0.9, 0.88, 0.87, 0.86, 0.85];
    expect(researchCuts(scores).strong).toBeLessThanOrEqual(0.9);
  });

  it("handles no scores", () => {
    expect(researchCuts([null])).toEqual({ good: 0, strong: 0 });
  });
});

describe("hashText", () => {
  it("is stable and differs between texts", () => {
    expect(hashText("abc")).toBe(hashText("abc"));
    expect(hashText("abc")).not.toBe(hashText("abd"));
    expect(hashText("abc")).toMatch(/^[0-9a-f]+$/);
  });
});

describe("createVectorCache", () => {
  it("keeps vectors per conference across loads, compactly, and can be cleared", () => {
    const storage = memoryStorage();
    const cache = createVectorCache("conf", storage);
    cache.set("k", new Float32Array([0.25, -0.5]));
    const again = createVectorCache("conf", storage);
    expect([...again.get("k")]).toEqual([0.25, -0.5]);
    expect(again.get("missing")).toBeUndefined();
    expect(storage.data["papersNavigator:conf:researchVectors"]).not.toContain(
      "0.25",
    );
    again.clear();
    expect(createVectorCache("conf", storage).get("k")).toBeUndefined();
  });

  it("keeps only the most recent entries", () => {
    const cache = createVectorCache("conf", memoryStorage(), { max: 2 });
    cache.set("a", new Float32Array([1]));
    cache.set("b", new Float32Array([2]));
    cache.set("c", new Float32Array([3]));
    expect(cache.get("a")).toBeUndefined();
    expect([...cache.get("c")]).toEqual([3]);
  });
});

describe("pruneVectorCache", () => {
  it("drops cached vectors of abstracts no rule uses any more, also from storage", async () => {
    const storage = memoryStorage();
    const cache = createVectorCache("conf", storage);
    const embed = vi.fn(async () => new Float32Array([1, 0]));
    await researchVectors(embed, ["kept", "gone"], cache);
    pruneVectorCache(cache, [
      { type: "topic", value: "Mine", research: ["kept"] },
      { type: "author", value: "Ann" },
    ]);
    embed.mockClear();
    const again = createVectorCache("conf", storage);
    await researchVectors(embed, ["kept"], again);
    expect(embed).not.toHaveBeenCalled();
    await researchVectors(embed, ["gone"], again);
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it("empties the cache when no rule has abstracts", async () => {
    const storage = memoryStorage();
    const cache = createVectorCache("conf", storage);
    await researchVectors(async () => [1, 0], ["a"], cache);
    pruneVectorCache(cache, []);
    expect(storage.data["papersNavigator:conf:researchVectors"] ?? "{}").toBe(
      "{}",
    );
  });
});

describe("researchVectors with a cache", () => {
  it("embeds each abstract once; later calls come from the cache", async () => {
    const cache = createVectorCache("conf", memoryStorage());
    const embed = vi.fn(async () => new Float32Array([0.6, 0.8]));
    await researchVectors(embed, ["a", "b"], cache);
    expect(embed).toHaveBeenCalledTimes(2);
    const again = await researchVectors(embed, ["a", "b"], cache);
    expect(embed).toHaveBeenCalledTimes(2);
    expect([...again[1]]).toEqual([expect.closeTo(0.6), expect.closeTo(0.8)]);
  });
});

describe("programFingerprint", () => {
  it("changes when the papers or their embeddings change", () => {
    const papers = [{ id: "a" }, { id: "b" }];
    const m = new Float32Array([1, 0, 0, 1]);
    const f = programFingerprint(papers, m);
    expect(programFingerprint(papers, new Float32Array([1, 0, 0, 1]))).toBe(f);
    expect(programFingerprint([{ id: "a" }], m)).not.toBe(f);
    expect(
      programFingerprint(papers, new Float32Array([1, 0, 0.1, 1])),
    ).not.toBe(f);
  });
});
