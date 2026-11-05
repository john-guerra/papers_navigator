import { polygonContains } from "d3";
import { describe, expect, it } from "vitest";
import {
  placeByNeighbours,
  similarityTerrain,
  terrainLevels,
  queryAnnouncement,
  queryCuts,
  nameSpot,
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

describe("terrainLevels (#182: an isoline every 0.05 from the Good cut)", () => {
  it("from Good up to the best visible score, in 0.05 steps", () => {
    expect(terrainLevels(0.3, 0.52)).toEqual([0.3, 0.35, 0.4, 0.45, 0.5]);
    expect(terrainLevels(0.3, 0.45)).toEqual([0.3, 0.35, 0.4, 0.45]);
  });
  it("My research: from its own Good cut", () => {
    expect(terrainLevels(0.47, 0.6)).toEqual([0.47, 0.52, 0.57]);
  });
  it("none when nothing reaches Good, or without a Good cut", () => {
    expect(terrainLevels(0.3, 0.29)).toEqual([]);
    expect(terrainLevels(null, 0.6)).toEqual([]);
    expect(terrainLevels(0.3, null)).toEqual([]);
  });
});

describe("similarityTerrain (#182: a topo map of the match %, the highest nearby score)", () => {
  // 20 px per unit
  const box = { width: 200, height: 200, xDomain: [0, 10], yDomain: [0, 10] };
  const covers = (level, px, py) =>
    level.polygons.some(([outer]) => polygonContains(outer, [px, py]));

  it("each paper's own score is the height at its dot, whatever its neighbours score", () => {
    // A 0.5 paper among weak ones: an average would sink it under Good
    const weak = Array.from({ length: 24 }, (_, i) => ({
      x: 5 + Math.cos(i) * (0.6 + (i % 3) * 0.3),
      y: 5 + Math.sin(i) * (0.6 + (i % 3) * 0.3),
      score: 0.1,
    }));
    const t = similarityTerrain([{ x: 5.1, y: 5.1, score: 0.5 }, ...weak], {
      ...box,
      levels: terrainLevels(0.3, 0.5),
    });
    expect(t.valueAt(5.1, 5.1)).toBeGreaterThan(0.48);
    expect(t.levels.map((l) => l.value)).toEqual([0.3, 0.35, 0.4, 0.45]);
    // Levels nest around it, and the ★ is on its dot
    for (const level of t.levels) expect(covers(level, 5.1, 5.1)).toBe(true);
    expect(Math.hypot(t.peak.x - 5.1, t.peak.y - 5.1)).toBeLessThan(0.3);
  });

  it("falls off with distance: a Gaussian of 25px (1.25 units here)", () => {
    const t = similarityTerrain([{ x: 5, y: 5, score: 0.6 }], {
      ...box,
      levels: [0.3],
    });
    // 0.6 · exp(-d² / 2σ²) = 0.3 at d = σ·√(2 ln 2) ≈ 1.47 units
    const xs = t.levels[0].polygons.flat(2).map(([x]) => x);
    expect(Math.max(...xs) - 5).toBeCloseTo(1.47, 1);
    expect(t.valueAt(5, 9)).toBeLessThan(0.01);
  });

  it("levels merge where Good papers cluster, stay apart when they are far, nothing between", () => {
    const near = similarityTerrain(
      [
        { x: 4.6, y: 5, score: 0.4 },
        { x: 5.4, y: 5, score: 0.4 },
      ],
      { ...box, levels: [0.3] },
    );
    expect(near.levels[0].polygons).toHaveLength(1);
    const far = similarityTerrain(
      [
        { x: 2, y: 5, score: 0.4 },
        { x: 8, y: 5, score: 0.4 },
      ],
      { ...box, levels: [0.3] },
    );
    expect(far.levels[0].polygons).toHaveLength(2);
    expect(far.valueAt(5, 5)).toBeLessThan(0.05);
    expect(covers(far.levels[0], 5, 5)).toBe(false);
  });

  it("only the levels that show, lowest first, smooth, in data units", () => {
    const t = similarityTerrain(
      [
        { x: 3, y: 3, score: 0.52 },
        { x: 3.6, y: 3.2, score: 0.41 },
      ],
      { ...box, levels: [0.3, 0.35, 0.4, 0.45, 0.5, 0.55] },
    );
    expect(t.levels.map((l) => l.value)).toEqual([0.3, 0.35, 0.4, 0.45, 0.5]);
    const xs = t.levels[0].polygons.flat(2).map(([x]) => x);
    expect(xs.some((x) => Math.abs(x / 0.2 - Math.round(x / 0.2)) > 0.01)).toBe(
      true,
    );
  });

  it("the ★ goes to the highest peak, inside the top level", () => {
    const t = similarityTerrain(
      [
        { x: 2.5, y: 2.5, score: 0.38 },
        { x: 7, y: 7, score: 0.52 },
      ],
      { ...box, levels: terrainLevels(0.3, 0.52) },
    );
    expect(Math.hypot(t.peak.x - 7, t.peak.y - 7)).toBeLessThan(0.3);
    expect(covers(t.levels.at(-1), t.peak.x, t.peak.y)).toBe(true);
  });

  it("the ★ is exactly on the best paper's dot, even when a near tie owns the highest cell (#195)", () => {
    // PLUTO 50.81% sits on a cell corner, Mastery Learning 50.69% on a cell center (4px cells
    // = 0.2 units here): the grid's highest cell is the runner-up's
    const t = similarityTerrain(
      [
        { x: 3.1, y: 3.1, score: 0.5069 },
        { x: 6, y: 6, score: 0.5081 },
      ],
      { ...box, levels: terrainLevels(0.3, 0.5081) },
    );
    expect(t.peak).toEqual({ x: 6, y: 6 });
  });

  it("no ★ peak when no level rises above Good (the ★ then sits on the top match)", () => {
    const t = similarityTerrain([{ x: 5, y: 5, score: 0.33 }], {
      ...box,
      levels: terrainLevels(0.3, 0.33),
    });
    expect(t.levels).toHaveLength(1);
    expect(t.peak).toBeNull();
  });

  it("a paper under Good draws nothing; null without papers", () => {
    expect(
      similarityTerrain([{ x: 5, y: 5, score: 0.29 }], {
        ...box,
        levels: [0.3],
      }).levels,
    ).toEqual([]);
    expect(similarityTerrain([], { ...box, levels: [0.3] })).toBeNull();
  });

  it("past the plot's edge it falls off like anywhere else (#181: not cut by the grid)", () => {
    const pts = [{ x: 9.8, y: 5, score: 0.6 }];
    const t = similarityTerrain(pts, { ...box, levels: [0.3, 0.35] });
    const xs = t.levels[0].polygons.flat(2).map(([x]) => x);
    expect(Math.max(...xs)).toBeGreaterThan(11);
    // The ★ stays on the map
    expect(t.peak.x).toBeLessThanOrEqual(10);
  });

  it("inside the map, the same field as without the margin (#181 review)", () => {
    const pts = [
      { x: 5, y: 5, score: 0.5 },
      { x: 4.3, y: 5.6, score: 0.4 },
    ];
    const plain = similarityTerrain(pts, { ...box, levels: [0.3], margin: 0 });
    const padded = similarityTerrain(pts, { ...box, levels: [0.3] });
    for (const [x, y] of [
      [5, 5],
      [4, 6],
      [6.5, 5.5],
    ])
      expect(padded.valueAt(x, y)).toBeCloseTo(plain.valueAt(x, y), 9);
  });
});

describe("queryMarkers terrain inputs (#182)", () => {
  const papers = ["a", "b", "c", "d", "e", "f"].map((id) => ({
    id,
    title: id,
  }));
  const shown = papers.map((p, i) => ({
    ...p,
    x: positions[i][0],
    y: positions[i][1],
  }));

  it("carries every shown paper's score and the levels from Good to the best visible", () => {
    const [m] = queryMarkers({
      vectors: [unit([1, 0.2, 0.2])],
      matrix,
      papers,
      shown: shown.filter((d) => d.id !== "a"),
      k: 3,
      dims: DIMS,
      goodCut: 0.5,
    });
    expect(m.scores).toHaveLength(5);
    const top = m.scores.find(
      (d) => d.x === m.nearest[0].x && d.y === m.nearest[0].y,
    );
    expect(top.score).toBeCloseTo(m.nearest[0].similarity, 6);
    expect(m.levels[0]).toBe(0.5);
    expect(m.levels.at(-1)).toBeLessThanOrEqual(m.nearest[0].similarity);
    expect(m.levels.at(-1)).toBeGreaterThan(m.nearest[0].similarity - 0.05);
  });

  it("no terrain without cuts", () => {
    const [m] = queryMarkers({
      vectors: [unit([1, 0.2, 0.2])],
      matrix,
      papers,
      shown,
      k: 3,
      dims: DIMS,
    });
    expect(m.levels).toEqual([]);
  });
});

describe("queryCuts", () => {
  it("maps relevance cuts to queryMarkers options, none without a ranking", () => {
    expect(queryCuts({ weak: 0.2, good: 0.3, strong: 0.45 })).toEqual({
      weakCut: 0.2,
      goodCut: 0.3,
    });
    expect(queryCuts(null)).toEqual({});
  });
});

describe("nameSpot (#172 re-review: the name goes to a free side of the ★)", () => {
  const size = { width: 60, height: 13 };
  it("above the ★ when free", () => {
    expect(nameSpot([100, 100], { ...size, obstacles: [] })).toEqual({
      dx: 0,
      dy: -13,
    });
  });
  it("below, then right, then left when the sides before are taken", () => {
    const above = [70, 80, 130, 95];
    expect(nameSpot([100, 100], { ...size, obstacles: [above] })).toEqual({
      dx: 0,
      dy: 14,
    });
    const below = [70, 105, 130, 125];
    expect(
      nameSpot([100, 100], { ...size, obstacles: [above, below] }),
    ).toEqual({ dx: 39, dy: 0 });
    const right = [110, 90, 180, 110];
    expect(
      nameSpot([100, 100], { ...size, obstacles: [above, below, right] }),
    ).toEqual({ dx: -39, dy: 0 });
  });
  it("a free corner when every side is taken", () => {
    const sides = [
      [70, 80, 130, 95],
      [96, 105, 130, 125],
      [110, 90, 180, 110],
      [20, 95, 90, 100],
    ];
    expect(nameSpot([100, 100], { ...size, obstacles: sides })).toEqual({
      dx: -34.5,
      dy: 14,
    });
  });
  it("the least-covered spot when all are taken", () => {
    const big = [0, 0, 300, 300];
    const smallBelow = [95, 110, 105, 115];
    expect(nameSpot([100, 100], { ...size, obstacles: [big] })).toEqual({
      dx: 0,
      dy: -13,
    });
    expect(
      nameSpot([100, 100], {
        ...size,
        // Its corners taken too
        obstacles: [
          [60, 80, 140, 96],
          smallBelow,
          [20, 100, 80, 130],
          [120, 100, 180, 130],
          [20, 70, 80, 100],
          [120, 70, 180, 100],
        ],
      }),
      // Every spot by the ★ is covered by more than a 3px strip: just past the obstacles below
      // it (#182 review)
    ).toEqual({ dx: 0, dy: 37.5 });
  });

  it("past a topic label around the ★: further below or right before the least covered (#182 review)", () => {
    // A three-line topic label with the ★ on its last line (left edge of the map)
    const label = [20, 64, 160, 116];
    expect(
      nameSpot([60, 100], {
        ...size,
        obstacles: [label],
        bounds: [0, 0, 400, 300],
      }),
    ).toEqual({ dx: 0, dy: 23.5 });
    // Below taken too: right, past the label (it ends 60px right of the ★)
    expect(
      nameSpot([60, 100], {
        ...size,
        obstacles: [
          [20, 64, 120, 116],
          [0, 116, 400, 300],
        ],
        bounds: [0, 0, 400, 300],
      }),
    ).toEqual({ dx: 92, dy: 0 });
  });

  // #181: next to the map's edge the name went off the map and showed only "Yo"
  describe("never leaves the map (`bounds`, the plot's [x0, y0, x1, y1])", () => {
    const bounds = [0, 0, 400, 300];
    const inside = ([px, py], { dx, dy }) =>
      px + dx - size.width / 2 >= bounds[0] &&
      px + dx + size.width / 2 <= bounds[2] &&
      py + dy - size.height / 2 >= bounds[1] &&
      py + dy + size.height / 2 <= bounds[3];
    it("right edge, above and below taken: left, not off the map", () => {
      const star = [392, 150];
      const spot = nameSpot(star, {
        ...size,
        bounds,
        obstacles: [
          [340, 120, 400, 145],
          [340, 155, 400, 180],
        ],
      });
      expect(spot).toEqual({ dx: -39, dy: 0 });
    });
    it("left edge, above and below taken: right", () => {
      const spot = nameSpot([6, 150], {
        ...size,
        bounds,
        obstacles: [
          [0, 120, 60, 145],
          [0, 155, 60, 180],
        ],
      });
      expect(spot).toEqual({ dx: 39, dy: 0 });
    });
    it("top edge: below", () => {
      expect(nameSpot([200, 4], { ...size, bounds })).toEqual({
        dx: 0,
        dy: 14,
      });
    });
    it("bottom edge, above taken: right rather than off the map below", () => {
      const spot = nameSpot([200, 296], {
        ...size,
        bounds,
        obstacles: [[150, 260, 250, 292]],
      });
      // Right of the ★ the box would cross the label by 5px: right of the label (#182 review)
      expect(spot.dx).toBe(82);
      expect(inside([200, 296], spot)).toBe(true);
    });
    it("right edge, every side taken: a free corner on the map", () => {
      const star = [392, 150];
      const spot = nameSpot(star, {
        ...size,
        bounds,
        obstacles: [
          [388, 120, 400, 145],
          [300, 155, 400, 180],
          [300, 145, 385, 155],
        ],
      });
      expect(spot).toEqual({ dx: -34.5, dy: -13 });
      expect(inside(star, spot)).toBe(true);
    });
    it("in a corner with every side taken or off the map: still whole on the map", () => {
      const star = [396, 296];
      const spot = nameSpot(star, {
        ...size,
        bounds,
        obstacles: [[300, 200, 400, 300]],
      });
      expect(inside(star, spot)).toBe(true);
    });
  });
});
