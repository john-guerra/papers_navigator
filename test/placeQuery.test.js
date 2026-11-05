import { polygonContains } from "d3";
import { describe, expect, it } from "vitest";
import {
  matchArea,
  placeByNeighbours,
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

describe("matchArea (#167: where the matching papers are, as smooth contours)", () => {
  const box = { width: 100, height: 100, xDomain: [0, 10], yDomain: [0, 10] };
  // Inside the outer ring of any polygon of the multipolygon
  const covers = (area, px, py) =>
    area.polygons.some(([outer]) => polygonContains(outer, [px, py]));

  it("one polygon per group of matches, nothing between them", () => {
    const area = matchArea(
      [
        { x: 1, y: 1, weight: 1 },
        { x: 1.5, y: 1, weight: 1 },
        { x: 9, y: 9, weight: 1 },
      ],
      box,
    );
    expect(area.polygons).toHaveLength(2);
    expect(covers(area, 1.2, 1)).toBe(true);
    expect(covers(area, 9, 9)).toBe(true);
    expect(covers(area, 5, 5)).toBe(false);
    expect(covers(area, 9, 1)).toBe(false);
    // Smooth outlines in data units: not on a 0.4-unit (4px) cell lattice
    const xs = area.polygons.flat(2).map(([x]) => x);
    expect(xs.some((x) => Math.abs(x / 0.4 - Math.round(x / 0.4)) > 0.01)).toBe(
      true,
    );
  });

  it("keeps the densest region holding `mass` of the weight: a light match can drop out", () => {
    const area = matchArea(
      [
        { x: 2, y: 2, weight: 1 },
        { x: 8, y: 8, weight: 0.02 },
      ],
      { ...box, mass: 0.8 },
    );
    expect(covers(area, 2, 2)).toBe(true);
    expect(covers(area, 8, 8)).toBe(false);
  });

  it("peaks inside the blob that holds the top match", () => {
    const pts = [
      { x: 1, y: 1, weight: 1 },
      { x: 1.3, y: 1.2, weight: 1 },
      { x: 9, y: 9, weight: 0.8 },
      { x: 8.7, y: 9.2, weight: 0.8 },
    ];
    const near = (p, x, y) => Math.hypot(p.x - x, p.y - y) < 1;
    expect(
      near(matchArea(pts, { ...box, top: { x: 9, y: 9 } }).peak, 9, 9),
    ).toBe(true);
    expect(
      near(matchArea(pts, { ...box, top: { x: 1, y: 1 } }).peak, 1.1, 1.1),
    ).toBe(true);
    // Without a top match: the global peak
    expect(near(matchArea(pts, box).peak, 1.1, 1.1)).toBe(true);
  });

  it("is null without matches", () => {
    expect(matchArea([], box)).toBeNull();
  });

  it("away from the edges, the same area and peak as without the margin (#181 review)", () => {
    let seed = 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pts = Array.from({ length: 60 }, () => ({
      x: 4 + rnd() * 2,
      y: 4 + rnd() * 2,
      weight: rnd(),
    }));
    const big = {
      width: 820,
      height: 1000,
      xDomain: [0, 10],
      yDomain: [0, 10],
    };
    const plain = matchArea(pts, { ...big, margin: 0 });
    const padded = matchArea(pts, big);
    const a = plain.polygons.flat(3);
    const b = padded.polygons.flat(3);
    expect(b).toHaveLength(a.length);
    a.forEach((v, i) => expect(b[i]).toBeCloseTo(v, 9));
    expect(padded.peak.x).toBeCloseTo(plain.peak.x, 9);
    expect(padded.peak.y).toBeCloseTo(plain.peak.y, 9);
  });

  // #181: matches at the plot's edge drew a blob cut by a straight line, the grid's edge
  describe("matches at the plot's edge: a whole, round blob, not cut by the grid", () => {
    const edges = {
      right: [
        { x: 10, y: 5 },
        { x: 10, y: 5.4 },
      ],
      left: [
        { x: 0, y: 5 },
        { x: 0, y: 5.4 },
      ],
      top: [
        { x: 5, y: 10 },
        { x: 5.4, y: 10 },
      ],
      bottom: [
        { x: 5, y: 0 },
        { x: 5.4, y: 0 },
      ],
    };
    for (const [edge, pts] of Object.entries(edges))
      it(edge, () => {
        const area = matchArea(
          pts.map((p) => ({ ...p, weight: 1 })),
          box,
        );
        const ring = area.polygons.flat(2);
        const horizontal = edge === "left" || edge === "right";
        const across = ring.map(([x, y]) => (horizontal ? x : y));
        const along = ring.map(([x, y]) => (horizontal ? y : x));
        const outer = edge === "right" || edge === "top" ? Math.max : Math.min;
        const reach = outer(...across);
        // Past the edge by most of the kernel (22px = 2.2 units): the matches sit on it
        expect(Math.abs(reach - (outer === Math.max ? 10 : 0))).toBeGreaterThan(
          1.5,
        );
        // Round at its far end: the outline doesn't run along a straight line there (the
        // points within 0.5px of its extreme span ~12px as anywhere on the map, not its whole
        // side: 76px when the grid cut it)
        const atEnd = along.filter(
          (_, i) => Math.abs(across[i] - reach) < 0.05,
        );
        expect(Math.max(...atEnd) - Math.min(...atEnd)).toBeLessThan(2);
        // The same shape as away from the edges (a mirror image of the right one)
        expect(Math.max(...along) - Math.min(...along)).toBeGreaterThan(4);
        // The ★ stays on the map (its padding holds it)
        expect(area.peak.x).toBeGreaterThanOrEqual(0);
        expect(area.peak.x).toBeLessThanOrEqual(10);
        expect(area.peak.y).toBeGreaterThanOrEqual(0);
        expect(area.peak.y).toBeLessThanOrEqual(10);
      });
  });
});

describe("queryMarkers matches (#167)", () => {
  const papers = ["a", "b", "c", "d", "e", "f"].map((id) => ({
    id,
    title: id,
  }));
  const shown = papers.map((p, i) => ({
    ...p,
    x: positions[i][0],
    y: positions[i][1],
  }));

  it("carries the shown papers at or above the Strong cut, weighted by their margin over Good", () => {
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
    // b and c (group 1, very similar) are Strong; a is not shown; group 2 is far below
    expect(m.matches.map((d) => [d.x, d.y])).toEqual([
      [1, 0],
      [0, 1],
    ]);
    for (const d of m.matches) expect(d.weight).toBeGreaterThan(0.4);
  });

  it("leaves the area out with a single Strong match on the map", () => {
    const [m] = queryMarkers({
      vectors: [unit([1, 0.2, 0.2])],
      matrix,
      papers,
      shown: shown.filter((d) => d.id !== "a" && d.id !== "b"),
      k: 3,
      dims: DIMS,
      goodCut: 0.5,
      strongCut: 0.9,
    });
    expect(m.matches).toEqual([]);
  });

  it("without cuts, falls back to its nearest papers", () => {
    const [m] = queryMarkers({
      vectors: [unit([1, 0.2, 0.2])],
      matrix,
      papers,
      shown,
      k: 3,
      dims: DIMS,
    });
    expect(m.matches).toHaveLength(3);
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
