import { describe, expect, it, vi } from "vitest";
import {
  CHUNK_WORDS,
  MAX_ABSTRACT_LENGTH,
  MAX_ABSTRACTS,
  chunkText,
  createResearchStore,
  embedLongText,
  maxSimilarityMatches,
  meanPool,
  rankByMaxSimilarity,
  researchCuts,
  researchLabel,
  researchVectors,
  splitAbstracts,
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

const words = (n, w = "word") => Array.from({ length: n }, () => w).join(" ");

describe("splitAbstracts", () => {
  it("splits on blank lines, trims and collapses whitespace inside each abstract", () => {
    expect(
      splitAbstracts("  First  abstract\nline two.\n\n \n\nSecond one. "),
    ).toEqual(["First abstract line two.", "Second one."]);
  });

  it("returns nothing for empty text", () => {
    expect(splitAbstracts("")).toEqual([]);
    expect(splitAbstracts("  \n\n ")).toEqual([]);
    expect(splitAbstracts(undefined)).toEqual([]);
  });

  it("caps how many abstracts and how long each one is", () => {
    const text = Array.from(
      { length: MAX_ABSTRACTS + 3 },
      (_, i) => `A${i}`,
    ).join("\n\n");
    expect(splitAbstracts(text)).toHaveLength(MAX_ABSTRACTS);
    const long = splitAbstracts("x".repeat(MAX_ABSTRACT_LENGTH + 50))[0];
    expect(long).toHaveLength(MAX_ABSTRACT_LENGTH);
  });
});

describe("chunkText", () => {
  it("keeps a short text in one chunk", () => {
    expect(chunkText("One sentence. Two sentences.")).toEqual([
      "One sentence. Two sentences.",
    ]);
  });

  it("packs whole sentences into chunks of at most maxWords words", () => {
    const s = (n) => `${words(n - 1)} end.`;
    const text = [s(4), s(4), s(4)].join(" ");
    expect(chunkText(text, 8)).toEqual([`${s(4)} ${s(4)}`, s(4)]);
  });

  it("splits a sentence longer than maxWords at word boundaries", () => {
    const chunks = chunkText(words(25), 10);
    expect(chunks.map((c) => c.split(" ").length)).toEqual([10, 10, 5]);
  });

  it("defaults to chunks within the model's 256-token window", () => {
    const chunks = chunkText(`${words(400)}.`);
    expect(chunks.every((c) => c.split(" ").length <= CHUNK_WORDS)).toBe(true);
    expect(CHUNK_WORDS).toBeLessThanOrEqual(150);
  });
});

describe("meanPool", () => {
  it("averages the vectors weighted by length and normalizes the result", () => {
    const v = meanPool(
      [new Float32Array([1, 0]), new Float32Array([0, 1])],
      [3, 1],
    );
    expect(v[0]).toBeCloseTo(3 / Math.sqrt(10));
    expect(v[1]).toBeCloseTo(1 / Math.sqrt(10));
  });
});

describe("embedLongText", () => {
  it("embeds a short text once, as is", async () => {
    const embed = vi.fn(async () => new Float32Array([0.6, 0.8]));
    expect([...(await embedLongText(embed, "Short text."))]).toEqual([
      expect.closeTo(0.6),
      expect.closeTo(0.8),
    ]);
    expect(embed).toHaveBeenCalledWith("Short text.");
  });

  it("embeds a long text chunk by chunk and mean-pools the chunks (no truncation)", async () => {
    const embed = vi.fn(async (t) =>
      t.startsWith("alpha")
        ? new Float32Array([1, 0])
        : new Float32Array([0, 1]),
    );
    const text = `${words(10, "alpha")}. ${words(10, "beta")}.`;
    const v = await embedLongText(embed, text, 12);
    expect(embed).toHaveBeenCalledTimes(2);
    expect(v[0]).toBeCloseTo(Math.SQRT1_2);
    expect(v[1]).toBeCloseTo(Math.SQRT1_2);
  });
});

describe("researchVectors", () => {
  it("one vector per abstract", async () => {
    const embed = vi.fn(async () => new Float32Array([1, 0]));
    expect(await researchVectors(embed, ["a", "b"])).toHaveLength(2);
  });
});

// Unit vectors, 2 dims: p1 near abstract A ([1,0]), p2 near abstract B ([0,1]), p3 between
const DIMS = 2;
const PAPERS = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];
const MATRIX = new Float32Array([1, 0, 0, 1, Math.SQRT1_2, Math.SQRT1_2]);
const A = new Float32Array([1, 0]);
const B = new Float32Array([0, 1]);

describe("rankByMaxSimilarity", () => {
  it("scores each paper by its best abstract, not by the average of the abstracts", () => {
    const ranked = rankByMaxSimilarity([A, B], MATRIX, PAPERS, DIMS);
    expect(
      ranked.map((p) => [p.id, Number(p.score.toFixed(3)), p.abstractIndex]),
    ).toEqual([
      ["p1", 1, 0],
      ["p2", 1, 1],
      ["p3", 0.707, 0],
    ]);
  });
});

describe("maxSimilarityMatches", () => {
  it("keeps papers whose best abstract clears the threshold, scores to 4 decimals", () => {
    expect(maxSimilarityMatches([A, B], MATRIX, PAPERS, 0.9, DIMS)).toEqual({
      p1: 1,
      p2: 1,
    });
  });
});

describe("researchLabel", () => {
  it("names the mode with the number of abstracts", () => {
    expect(researchLabel(1)).toBe("My research (1 abstract)");
    expect(researchLabel(2)).toBe("My research (2 abstracts)");
  });
});

describe("createResearchStore", () => {
  it("keeps the pasted abstracts per conference and whether the mode is on", () => {
    const storage = memoryStorage();
    const store = createResearchStore("conf", storage, null);
    expect(store.value).toEqual({ text: "", active: false });
    const onInput = vi.fn();
    store.addEventListener("input", onInput);
    store.set({ text: "Abstract one.", active: true });
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.data["papersNavigator:conf:research"])).toEqual({
      text: "Abstract one.",
      active: true,
    });
    expect(createResearchStore("conf", storage, null).value).toEqual({
      text: "Abstract one.",
      active: true,
    });
    expect(createResearchStore("other", storage, null).value.text).toBe("");
  });

  it("turns the mode off without forgetting the text, and forgets on request", () => {
    const storage = memoryStorage();
    const store = createResearchStore("conf", storage, null);
    store.set({ text: "Abstract.", active: true });
    store.set({ active: false });
    expect(store.value).toEqual({ text: "Abstract.", active: false });
    store.forget();
    expect(store.value).toEqual({ text: "", active: false });
    expect(storage.data["papersNavigator:conf:research"]).toBeUndefined();
  });

  it("survives garbage in storage", () => {
    const storage = memoryStorage();
    storage.setItem("papersNavigator:conf:research", "{not json");
    expect(createResearchStore("conf", storage, null).value).toEqual({
      text: "",
      active: false,
    });
  });
});

describe("researchCuts weak level", () => {
  it("puts weak at mean + 1 sd, never above good", () => {
    const scores = Array.from({ length: 200 }, (_, i) => i / 200);
    const { weak, good, strong } = researchCuts(scores);
    expect(weak).toBeLessThan(good);
    expect(good).toBeLessThanOrEqual(strong);
    const mean = scores.reduce((a, b) => a + b) / scores.length;
    const sd = Math.sqrt(
      scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length,
    );
    expect(weak).toBeCloseTo(mean + sd);
  });
});
