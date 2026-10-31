import { describe, expect, it, vi } from "vitest";
import { createLazyEmbeddings } from "../src/lib/lazyEmbeddings.js";
import { createNeighbourIndex } from "../src/lib/neighbours.js";

const buffer = (n, dims) => new Float32Array(n * dims).fill(0.5).buffer;

describe("createLazyEmbeddings", () => {
  it("fetches nothing until load() is called", () => {
    const fetchBuffer = vi.fn(async () => buffer(3, 4));
    const embeddings = createLazyEmbeddings(fetchBuffer, 3, { dims: 4 });
    expect(fetchBuffer).not.toHaveBeenCalled();
    expect(embeddings.matrix).toBeNull();
    expect(embeddings.dims).toBeNull();
  });

  it("loads once, then exposes the matrix and dims synchronously", async () => {
    const fetchBuffer = vi.fn(async () => buffer(3, 4));
    const embeddings = createLazyEmbeddings(fetchBuffer, 3, { dims: 4 });
    const [a, b] = await Promise.all([embeddings.load(), embeddings.load()]);
    expect(fetchBuffer).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(a.matrix).toBeInstanceOf(Float32Array);
    expect(embeddings.matrix).toBe(a.matrix);
    expect(embeddings.dims).toBe(4);
    await embeddings.load();
    expect(fetchBuffer).toHaveBeenCalledTimes(1);
  });

  it("derives dims from the buffer size when not given", async () => {
    const embeddings = createLazyEmbeddings(async () => buffer(2, 384), 2);
    await embeddings.load();
    expect(embeddings.dims).toBe(384);
  });

  it("rejects a buffer that doesn't match the papers", async () => {
    const embeddings = createLazyEmbeddings(async () => buffer(3, 4), 2, {
      dims: 4,
    });
    await expect(embeddings.load()).rejects.toThrow(/mismatch/);
  });

  it("forgets a failed load so the next call tries again (offline)", async () => {
    const fetchBuffer = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(buffer(2, 4));
    const embeddings = createLazyEmbeddings(fetchBuffer, 2, { dims: 4 });
    await expect(embeddings.load()).rejects.toThrow("offline");
    expect(embeddings.matrix).toBeNull();
    await embeddings.load();
    expect(fetchBuffer).toHaveBeenCalledTimes(2);
    expect(embeddings.matrix).toHaveLength(8);
  });
});

describe("createNeighbourIndex with a lazy matrix", () => {
  it("has no neighbours until the matrix arrives, then ranks them", () => {
    let matrix = null;
    const index = createNeighbourIndex(() => matrix, ["a", "b", "c"], {
      dims: 2,
    });
    expect(index.nearest("a", 2)).toEqual([]);
    expect(index.computed()).toBe(0);
    matrix = new Float32Array([1, 0, 0.8, 0.6, 0, 1]);
    expect(index.nearest("a", 2).map((d) => d.id)).toEqual(["b", "c"]);
  });

  it("reads dims from a getter once the matrix is loaded", () => {
    let state = { matrix: null, dims: null };
    const index = createNeighbourIndex(() => state.matrix, ["a", "b"], {
      dims: () => state.dims,
    });
    expect(index.nearest("a", 1)).toEqual([]);
    state = { matrix: new Float32Array([1, 0, 0, 1]), dims: 2 };
    expect(index.nearest("a", 1).map((d) => d.id)).toEqual(["b"]);
  });
});
