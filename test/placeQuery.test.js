import { describe, expect, it } from "vitest";
import {
  placeByNeighbours,
  queryAnnouncement,
  queryMarkers,
} from "../src/lib/placeQuery.js";

const DIMS = 3;
const unit = (v) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};
/** A Float32Array matrix (row i = vectors[i], normalized). */
const toMatrix = (vectors) => Float32Array.from(vectors.flatMap(unit));

// Two groups of papers: around e1 (drawn near (0, 0)) and around e2 (drawn near (10, 10))
const vectors = [
  [1, 0.3, 0],
  [1, 0, 0.3],
  [1, 0.3, 0.3],
  [0.3, 1, 0],
  [0, 1, 0.3],
  [0.3, 1, 0.3],
];
const matrix = toMatrix(vectors);
const positions = [
  [0, 0],
  [1, 0],
  [0, 1],
  [10, 10],
  [11, 10],
  [10, 11],
];

describe("placeByNeighbours", () => {
  it("places a paper's own embedding at (near) its own position", () => {
    for (let i = 0; i < vectors.length; i++) {
      const own = matrix.subarray(i * DIMS, (i + 1) * DIMS);
      const p = placeByNeighbours(own, matrix, positions, { k: 3, dims: DIMS });
      expect(
        Math.hypot(p.x - positions[i][0], p.y - positions[i][1]),
      ).toBeLessThan(0.75);
      expect(p.neighbours[0]).toEqual({
        index: i,
        similarity: expect.closeTo(1, 5),
      });
    }
  });

  it("lands among the k most similar papers, most similar first", () => {
    const p = placeByNeighbours(unit([1, 0.02, 0.02]), matrix, positions, {
      k: 3,
      dims: DIMS,
    });
    expect(p.neighbours.map((d) => d.index).sort()).toEqual([0, 1, 2]);
    expect(p.neighbours[0].similarity).toBeGreaterThanOrEqual(
      p.neighbours[1].similarity,
    );
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(1);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(1);
  });

  it("weights by similarity: the more similar neighbour pulls harder", () => {
    // Two papers, the query closer to the first
    const m = toMatrix([
      [1, 0, 0],
      [0, 1, 0],
    ]);
    const pos = [
      [0, 0],
      [10, 0],
    ];
    const p = placeByNeighbours(unit([1, 0.6, 0]), m, pos, {
      k: 2,
      dims: DIMS,
    });
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(5);
    // Equal similarity: halfway
    const mid = placeByNeighbours(unit([1, 1, 0]), m, pos, {
      k: 2,
      dims: DIMS,
    });
    expect(mid.x).toBeCloseTo(5, 5);
    expect(mid.y).toBeCloseTo(0, 5);
  });

  it("measures the spread of the neighbours around the placement", () => {
    const tight = placeByNeighbours(unit([1, 0.02, 0.02]), matrix, positions, {
      k: 3,
      dims: DIMS,
    });
    // Equally similar to both groups: neighbours on both sides, a wide spread
    const torn = placeByNeighbours(unit([1, 1, 0]), matrix, positions, {
      k: 6,
      dims: DIMS,
    });
    expect(tight.spread).toBeGreaterThan(0);
    expect(tight.spread).toBeLessThan(1);
    expect(torn.spread).toBeGreaterThan(5);
    // Two equal neighbours 10 apart: each 5 from the midpoint
    const m = toMatrix([
      [1, 0, 0],
      [0, 1, 0],
    ]);
    const two = placeByNeighbours(
      unit([1, 1, 0]),
      m,
      [
        [0, 0],
        [10, 0],
      ],
      {
        k: 2,
        dims: DIMS,
      },
    );
    expect(two.spread).toBeCloseTo(5, 5);
  });

  it("uses the positions passed in (drawn / aligned) and skips papers not drawn", () => {
    const moved = positions.map(([x, y]) => [x * 2 + 100, -y]);
    const own = matrix.subarray(0, DIMS);
    const p = placeByNeighbours(own, matrix, moved, { k: 3, dims: DIMS });
    expect(p.x).toBeCloseTo(100, 0);
    expect(p.y).toBeCloseTo(0, 0);
    // Paper 0 filtered out (no position): its neighbours in the same group stand in
    const filtered = [null, ...positions.slice(1)];
    const q = placeByNeighbours(own, matrix, filtered, { k: 2, dims: DIMS });
    expect(q.neighbours.map((d) => d.index).sort()).toEqual([1, 2]);
    expect(q.x).toBeGreaterThan(0);
    expect(q.x).toBeLessThan(1.01);
  });

  it("returns null when no paper is drawn", () => {
    expect(
      placeByNeighbours(
        unit([1, 0, 0]),
        matrix,
        positions.map(() => null),
        { dims: DIMS },
      ),
    ).toBeNull();
    expect(
      placeByNeighbours(unit([1, 0, 0]), new Float32Array(0), [], {
        dims: DIMS,
      }),
    ).toBeNull();
  });
});

describe("queryMarkers", () => {
  const papers = ["a", "b", "c", "d", "e", "f"].map((id) => ({
    id,
    title: `Paper ${id}`,
  }));
  const shown = papers.map((p, i) => ({
    ...p,
    x: positions[i][0],
    y: positions[i][1],
  }));

  it("one marker for a search, labelled with the query", () => {
    const markers = queryMarkers({
      vectors: [unit([1, 0.02, 0.02])],
      matrix,
      papers,
      shown,
      query: "dimensionality reduction",
      k: 3,
      dims: DIMS,
    });
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      label: "★ Your search",
      text: "“dimensionality reduction”",
    });
    expect(markers[0].nearest.map((d) => d.id).sort()).toEqual(["a", "b", "c"]);
    expect(markers[0].nearest[0]).toHaveProperty("title");
  });

  it("one numbered marker per abstract for My research", () => {
    const markers = queryMarkers({
      vectors: [unit([1, 0, 0]), unit([0, 1, 0])],
      matrix,
      papers,
      shown,
      research: true,
      k: 3,
      dims: DIMS,
    });
    expect(markers.map((m) => m.label)).toEqual([
      "★ My research 1",
      "★ My research 2",
    ]);
    expect(markers[0].x).toBeLessThan(2);
    expect(markers[1].x).toBeGreaterThan(9);
    // A single abstract: no number
    const one = queryMarkers({
      vectors: [unit([1, 0, 0])],
      matrix,
      papers,
      shown,
      research: true,
      k: 3,
      dims: DIMS,
    });
    expect(one[0].label).toBe("★ My research");
  });

  it("nothing without vectors or papers on the map", () => {
    expect(queryMarkers({ vectors: null, matrix, papers, shown })).toEqual([]);
    expect(
      queryMarkers({
        vectors: [unit([1, 0, 0])],
        matrix,
        papers,
        shown: [],
        dims: DIMS,
      }),
    ).toEqual([]);
  });

  describe("faint: few similar papers visible", () => {
    const query = unit([1, 0.02, 0.02]);
    const run = (options) =>
      queryMarkers({
        vectors: [query],
        matrix,
        papers,
        k: 3,
        dims: DIMS,
        shown,
        ...options,
      })[0];

    it("not faint when the best matches are on the map", () => {
      expect(run({}).faint).toBe(false);
      expect(run({ weakCut: 0.2 }).faint).toBe(false);
    });

    it("faint when only dissimilar papers are visible (heavy filters)", () => {
      // Only the e2 group (similarity ~0.3) is left: far below the program's best (~0.95)
      expect(run({ shown: shown.slice(3) }).faint).toBe(true);
    });

    it("faint when the best visible match is under the Weak cut", () => {
      expect(run({ weakCut: 0.99 }).faint).toBe(true);
    });
  });
});

describe("queryAnnouncement", () => {
  it("is read from a visually hidden polite live region by the map", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync(
      new URL("../src/index.md", import.meta.url),
      "utf8",
    );
    expect(page).toMatch(
      /<p id="query-live" class="sr-only" aria-live="polite"><\/p>/,
    );
    expect(page).toMatch(/getElementById\("query-live"\)/);
  });

  const near = (titles) => titles.map((title) => ({ title }));
  it("one sentence per marker, approximate, with its nearest papers", () => {
    expect(
      queryAnnouncement([
        {
          label: "★ Your search",
          nearest: near(["FADEx", "MAPLE", "Split", "Other"]),
          faint: false,
        },
      ]),
    ).toBe("Your search lands near: FADEx; MAPLE; Split (approximate).");
    expect(
      queryAnnouncement([
        { label: "★ My research 1", nearest: near(["A"]), faint: false },
        { label: "★ My research 2", nearest: near(["B"]), faint: true },
      ]),
    ).toBe(
      "My research 1 lands near: A (approximate). My research 2 lands near: B (approximate, few similar papers visible).",
    );
    expect(queryAnnouncement([])).toBe("");
  });
});
