import { polygonContains } from "d3";
import { describe, expect, it } from "vitest";
import {
  isolineLabels,
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

describe("similarityTerrain (#182: a topo map of the match %)", () => {
  // 20 px per unit
  const box = { width: 200, height: 200, xDomain: [0, 10], yDomain: [0, 10] };
  const covers = (level, px, py) =>
    level.polygons.some(([outer]) => polygonContains(outer, [px, py]));
  // A dense patch of papers around (cx, cy), every one scoring `score`
  const patch = (cx, cy, score, n = 5) =>
    Array.from({ length: n * n }, (_, i) => ({
      x: cx + ((i % n) - (n - 1) / 2) * 0.4,
      y: cy + (Math.floor(i / n) - (n - 1) / 2) * 0.4,
      score,
    }));

  it("height = a Gaussian-weighted average of nearby papers' scores", () => {
    const t = similarityTerrain([...patch(2, 2, 0.6), ...patch(8, 8, 0.2)], {
      ...box,
      levels: [0.3],
    });
    expect(t.valueAt(2, 2)).toBeCloseTo(0.6, 2);
    expect(t.valueAt(8, 8)).toBeCloseTo(0.2, 2);
    // Between two papers of 0.6 and 0.2, close together: about their average
    const pair = similarityTerrain(
      [...patch(4.6, 5, 0.6, 3), ...patch(5.4, 5, 0.2, 3)],
      { ...box, levels: [0.3] },
    );
    expect(pair.valueAt(5, 5)).toBeGreaterThan(0.35);
    expect(pair.valueAt(5, 5)).toBeLessThan(0.45);
  });

  it("no terrain in empty space: masked where there are few papers", () => {
    // Two strong patches far apart: their average would invent a ridge between them
    const t = similarityTerrain(
      [...patch(1.5, 5, 0.6), ...patch(8.5, 5, 0.6)],
      {
        ...box,
        levels: [0.3, 0.35],
      },
    );
    expect(t.valueAt(5, 5)).toBeLessThan(0.3);
    expect(t.levels[0].polygons).toHaveLength(2);
    expect(covers(t.levels[0], 5, 5)).toBe(false);
    expect(covers(t.levels[0], 1.5, 5)).toBe(true);
    // A lone paper: at most a small island on its own dot (within 20px of it)
    const lone = similarityTerrain([{ x: 5, y: 5, score: 0.5 }], {
      ...box,
      levels: [0.3],
    });
    const ring = lone.levels[0]?.polygons.flat(2) ?? [];
    for (const [x, y] of ring) expect(Math.hypot(x - 5, y - 5)).toBeLessThan(1);
  });

  it("one entry per level that has an isoline, in data units, smooth", () => {
    const pts = [
      ...patch(3, 3, 0.5),
      ...patch(3, 3, 0.3, 7).filter((p) => Math.hypot(p.x - 3, p.y - 3) > 1),
    ];
    const t = similarityTerrain(pts, {
      ...box,
      levels: [0.3, 0.35, 0.4, 0.45, 0.5, 0.55],
    });
    const values = t.levels.map((l) => l.value);
    expect(values[0]).toBe(0.3);
    // 0.55 is above the field: no isoline
    expect(values).not.toContain(0.55);
    // Nested: a higher level inside the lower one
    expect(covers(t.levels.at(-1), 3, 3)).toBe(true);
    expect(covers(t.levels[0], 3, 3)).toBe(true);
    const xs = t.levels[0].polygons.flat(2).map(([x]) => x);
    expect(xs.some((x) => Math.abs(x / 0.2 - Math.round(x / 0.2)) > 0.01)).toBe(
      true,
    );
  });

  it("the ★ goes to the highest peak, inside the top isoline", () => {
    const pts = [...patch(2.5, 2.5, 0.38), ...patch(7, 7, 0.52)];
    const t = similarityTerrain(pts, {
      ...box,
      levels: terrainLevels(0.3, 0.52),
    });
    expect(Math.hypot(t.peak.x - 7, t.peak.y - 7)).toBeLessThan(0.5);
    expect(covers(t.levels.at(-1), t.peak.x, t.peak.y)).toBe(true);
  });

  it("no ★ peak when no isoline rises above Good (the ★ then sits on the top match)", () => {
    const t = similarityTerrain(patch(5, 5, 0.32), {
      ...box,
      levels: terrainLevels(0.3, 0.32),
    });
    expect(t.levels).toHaveLength(1);
    expect(t.peak).toBeNull();
  });

  it("null without papers", () => {
    expect(similarityTerrain([], { ...box, levels: [0.3] })).toBeNull();
  });

  it("past the plot's edge it falls off like anywhere else (#181: not cut by the grid)", () => {
    const t = similarityTerrain(patch(9.6, 5, 0.6), { ...box, levels: [0.3] });
    const xs = t.levels[0].polygons.flat(2).map(([x]) => x);
    expect(Math.max(...xs)).toBeGreaterThan(10.5);
    // The ★ stays on the map
    expect(t.peak).toBeNull();
    const t2 = similarityTerrain(patch(9.6, 5, 0.6), {
      ...box,
      levels: [0.3, 0.35],
    });
    expect(t2.peak.x).toBeLessThanOrEqual(10);
  });

  it("inside the map, the same field as without the margin (#181 review)", () => {
    const pts = patch(5, 5, 0.5);
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

describe("isolineLabels (#182: “45%” on 2–3 levels, off the topic labels)", () => {
  // A circle of radius r (data units = px here) around (50, 50)
  const ring = (r) =>
    Array.from({ length: 73 }, (_, i) => [
      50 + r * Math.cos((i / 72) * 2 * Math.PI),
      50 + r * Math.sin((i / 72) * 2 * Math.PI),
    ]);
  const levels = [0.3, 0.35, 0.4, 0.45, 0.5].map((value, i) => ({
    value,
    polygons: [[ring(45 - i * 8)]],
  }));
  const toPx = ([x, y]) => [x, y];
  const bounds = [0, 0, 100, 100];

  it("labels the lowest, a middle and the top level", () => {
    const labels = isolineLabels(levels, { toPx, bounds });
    expect(labels.map((l) => l.text)).toEqual(["30%", "40%", "50%"]);
    // On its own isoline
    labels.forEach((l) => {
      const r = 45 - levels.findIndex((d) => d.value === l.value) * 8;
      expect(Math.hypot(l.x - 50, l.y - 50)).toBeCloseTo(r, 0);
    });
  });

  it("all of them when there are 3 or fewer; rounds to whole percents", () => {
    const two = [
      { value: 0.47, polygons: levels[0].polygons },
      { value: 0.52, polygons: levels[2].polygons },
    ];
    expect(isolineLabels(two, { toPx, bounds }).map((l) => l.text)).toEqual([
      "47%",
      "52%",
    ]);
  });

  it("never crosses an obstacle (topic labels, the ★'s name), nor another label", () => {
    // Topic labels over the top and bottom halves of the map: only the sides are free
    const obstacles = [
      [0, 0, 100, 40],
      [0, 60, 100, 100],
    ];
    const labels = isolineLabels(levels, { toPx, bounds, obstacles });
    expect(labels.length).toBeGreaterThan(0);
    const boxes = labels.map((l) => l.box);
    for (const [, b, , d] of boxes) {
      expect(b).toBeGreaterThanOrEqual(40);
      expect(d).toBeLessThanOrEqual(60);
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b, c, d] = boxes[i];
        const [e, f, g, h] = boxes[j];
        expect(a < g && e < c && b < h && f < d).toBe(false);
      }
  });

  it("drops a label with no free spot, and stays inside the bounds", () => {
    const labels = isolineLabels(levels, {
      toPx,
      bounds,
      obstacles: [[0, 0, 100, 100]],
    });
    expect(labels).toEqual([]);
    for (const l of isolineLabels(levels, { toPx, bounds: [0, 0, 100, 52] }))
      expect(l.box[3]).toBeLessThanOrEqual(52);
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
      strongCut: 0.9,
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
      strongCut: 0.45,
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
    ).toEqual({ dx: 0, dy: 14 });
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
      expect(spot.dx).toBe(39);
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
