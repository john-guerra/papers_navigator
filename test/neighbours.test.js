import { describe, expect, it } from "vitest";
import {
  classifyNeighbours,
  createNeighbourIndex,
  createNeighbourSettings,
  NEIGHBOURS_KEY,
  mapOrder,
  missingShare,
  topK,
} from "../src/lib/neighbours.js";

// Deterministic pseudo-random unit vectors
function randomMatrix(n, dims, seed = 1) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const m = new Float32Array(n * dims);
  for (let i = 0; i < n; i++) {
    let norm = 0;
    for (let j = 0; j < dims; j++) {
      m[i * dims + j] = rand();
      norm += m[i * dims + j] ** 2;
    }
    for (let j = 0; j < dims; j++) m[i * dims + j] /= Math.sqrt(norm);
  }
  return m;
}

function bruteForce(matrix, n, dims, i, k) {
  const rows = [];
  for (let j = 0; j < n; j++) {
    if (j === i) continue;
    let s = 0;
    for (let d = 0; d < dims; d++)
      s += matrix[i * dims + d] * matrix[j * dims + d];
    rows.push({ index: j, similarity: s });
  }
  return rows.sort((a, b) => b.similarity - a.similarity).slice(0, k);
}

describe("topK", () => {
  const n = 60;
  const dims = 16;
  const matrix = randomMatrix(n, dims);

  it("matches brute force cosine on L2-normalized rows, itself excluded", () => {
    for (const i of [0, 7, 59]) {
      const got = topK(matrix, i, 10, { dims, n });
      const want = bruteForce(matrix, n, dims, i, 10);
      expect(got.map((d) => d.index)).toEqual(want.map((d) => d.index));
      got.forEach((d, j) =>
        expect(d.similarity).toBeCloseTo(want[j].similarity, 5),
      );
      expect(got.some((d) => d.index === i)).toBe(false);
    }
  });

  it("only considers rows that pass `include`", () => {
    const even = (j) => j % 2 === 0;
    const got = topK(matrix, 3, 5, { dims, n, include: even });
    expect(got).toHaveLength(5);
    expect(got.every((d) => d.index % 2 === 0)).toBe(true);
    const want = bruteForce(matrix, n, dims, 3, n)
      .filter((d) => even(d.index))
      .slice(0, 5);
    expect(got.map((d) => d.index)).toEqual(want.map((d) => d.index));
  });
});

describe("createNeighbourIndex", () => {
  const n = 40;
  const dims = 8;
  const matrix = randomMatrix(n, dims, 7);
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);

  it("returns the same neighbours as brute force, by id, and caches rows", () => {
    const index = createNeighbourIndex(matrix, ids, { dims });
    const got = index.nearest("p5", 15);
    const want = bruteForce(matrix, n, dims, 5, 15);
    expect(got.map((d) => d.id)).toEqual(want.map((d) => `p${d.index}`));
    expect(index.nearest("p5", 15)).toEqual(got);
    expect(index.computed()).toBe(1);
  });

  it("restricts to a set of ids (the papers on the map)", () => {
    const index = createNeighbourIndex(matrix, ids, { dims });
    const shown = new Set(ids.slice(0, 20));
    const got = index.nearest("p2", 10, shown);
    expect(got).toHaveLength(10);
    expect(got.every((d) => shown.has(d.id))).toBe(true);
    const want = bruteForce(matrix, n, dims, 2, n)
      .filter((d) => d.index < 20)
      .slice(0, 10);
    expect(got.map((d) => d.id)).toEqual(want.map((d) => `p${d.index}`));
  });

  it("returns [] for an unknown id", () => {
    expect(
      createNeighbourIndex(matrix, ids, { dims }).nearest("nope", 5),
    ).toEqual([]);
  });
});

describe("mapOrder", () => {
  it("sorts the other points by distance on the map", () => {
    const positions = new Map([
      ["f", [0, 0]],
      ["a", [3, 0]],
      ["b", [1, 0]],
      ["c", [0, 2]],
    ]);
    expect(mapOrder(positions, "f")).toEqual(["b", "c", "a"]);
  });
});

describe("classifyNeighbours", () => {
  // Focus f at the origin; true neighbours a (close), b (close), c (far on the map)
  const positions = new Map([
    ["f", [0, 0]],
    ["a", [1, 0]],
    ["b", [0, 1]],
    ["x", [1, 1]], // map-close, not a true neighbour
    ["c", [9, 9]],
    ["y", [5, 5]],
  ]);
  const similar = [
    { id: "a", similarity: 0.9 },
    { id: "c", similarity: 0.8 },
    { id: "b", similarity: 0.7 },
  ];

  it("marks a true neighbour missing when it isn't among the k nearest on the map", () => {
    const { neighbours } = classifyNeighbours("f", similar, positions, 3);
    expect(neighbours).toEqual([
      { id: "a", similarity: 0.9, mapRank: 1, missing: false },
      { id: "c", similarity: 0.8, mapRank: 5, missing: true },
      { id: "b", similarity: 0.7, mapRank: 2, missing: false },
    ]);
  });

  it("false neighbours: among the k nearest on the map but not true neighbours", () => {
    const { falseNeighbours } = classifyNeighbours("f", similar, positions, 3);
    expect(falseNeighbours).toEqual(["x"]);
  });

  it("uses only the first k true neighbours", () => {
    const { neighbours } = classifyNeighbours("f", similar, positions, 2);
    expect(neighbours.map((d) => d.id)).toEqual(["a", "c"]);
  });

  it("skips neighbours that aren't on the map", () => {
    const { neighbours } = classifyNeighbours(
      "f",
      [{ id: "gone", similarity: 1 }, ...similar],
      positions,
      3,
    );
    expect(neighbours.map((d) => d.id)).toEqual(["a", "c", "b"]);
  });
});

describe("missingShare", () => {
  it("is the average share of true neighbours that are far on the map", () => {
    const positions = new Map([
      ["a", [0, 0]],
      ["b", [1, 0]],
      ["c", [10, 0]],
    ]);
    // True neighbours: a↔c, b↔a, c↔a (k = 1). On the map: a→b, b→a, c→b
    const similar = { a: ["c"], b: ["a"], c: ["a"] };
    const share = missingShare(
      (id) => similar[id].map((n) => ({ id: n, similarity: 1 })),
      positions,
      1,
    );
    expect(share).toBeCloseTo(2 / 3, 6);
  });
});

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => (data[k] = String(v)),
    data,
  };
};

describe("neighbour settings", () => {
  it("defaults to on with k = 10", () => {
    const store = createNeighbourSettings({ storage: memoryStorage() });
    expect(store.value).toEqual({ enabled: true, k: 10 });
  });

  it("remembers valid choices per device and emits input", () => {
    const storage = memoryStorage();
    const store = createNeighbourSettings({ storage });
    let fired = 0;
    store.addEventListener("input", () => fired++);
    store.set({ k: 15, enabled: false });
    expect(store.value).toEqual({ enabled: false, k: 15 });
    expect(fired).toBe(1);
    expect(JSON.parse(storage.data[NEIGHBOURS_KEY])).toEqual({
      k: 15,
      enabled: false,
    });
    expect(createNeighbourSettings({ storage }).value).toEqual({
      enabled: false,
      k: 15,
    });
  });

  it("ignores invalid stored values", () => {
    const storage = memoryStorage({
      [NEIGHBOURS_KEY]: JSON.stringify({ k: 99, enabled: "yes" }),
    });
    expect(createNeighbourSettings({ storage }).value).toEqual({
      enabled: true,
      k: 10,
    });
  });
});
