import { describe, expect, it } from "vitest";
import {
  domainIncluding,
  interpolateDomain,
  isInside,
  mapNeighbourhood,
  miniMapMotion,
  miniMapSummary,
  neighbourhoodDomain,
} from "../src/lib/miniMap.js";

// The focus "f" at (10, 10); a ring of near papers; two far ones
const rows = [
  { id: "f", x: 10, y: 10 },
  { id: "n1", x: 11, y: 10 },
  { id: "n2", x: 10, y: 12 },
  { id: "n3", x: 8, y: 10 },
  { id: "n4", x: 10, y: 9 },
  { id: "far", x: 30, y: 10 },
  { id: "far2", x: 10, y: -40 },
  { id: "nopos", x: null, y: 3 },
];
const positions = new Map(
  rows.filter((d) => Number.isFinite(d.x)).map((d) => [d.id, [d.x, d.y]]),
);

describe("mapNeighbourhood (#101)", () => {
  it("lists the k nearest papers on the map, nearest first, the paper itself excluded", () => {
    expect(mapNeighbourhood(positions, "f", 2)).toEqual(["n1", "n4"]);
    expect(mapNeighbourhood(positions, "f", 4).sort()).toEqual(
      ["n1", "n2", "n3", "n4"].sort(),
    );
  });
  it("is empty for a paper that isn't on the map", () => {
    expect(mapNeighbourhood(positions, "zz", 3)).toEqual([]);
  });
});

describe("neighbourhoodDomain (#101)", () => {
  it("centers the paper and covers its k nearest map neighbours with padding", () => {
    const d = neighbourhoodDomain(positions, "f", {
      k: 4,
      padding: 0.25,
      aspect: 1,
    });
    // farthest of the 4 nearest is 2 away (n2, n3): half span 2 × 1.25
    expect(d.x[0]).toBeCloseTo(7.5);
    expect(d.x[1]).toBeCloseTo(12.5);
    expect(d.y[0]).toBeCloseTo(7.5);
    expect(d.y[1]).toBeCloseTo(12.5);
    for (const id of ["n1", "n2", "n3", "n4"])
      expect(isInside(d, positions.get(id))).toBe(true);
    expect(isInside(d, positions.get("far"))).toBe(false);
  });
  it("keeps one data unit per pixel on both axes (width / height = aspect)", () => {
    const d = neighbourhoodDomain(positions, "f", {
      k: 4,
      padding: 0,
      aspect: 1.5,
    });
    const w = d.x[1] - d.x[0];
    const h = d.y[1] - d.y[0];
    expect(w / h).toBeCloseTo(1.5);
    // the tighter axis still covers the neighbours: |dy| = 2 → height ≥ 4
    expect(h).toBeGreaterThanOrEqual(4 - 1e-9);
    expect((d.x[0] + d.x[1]) / 2).toBeCloseTo(10);
    expect((d.y[0] + d.y[1]) / 2).toBeCloseTo(10);
  });
  it("never collapses to a point when the neighbours coincide with the paper", () => {
    const same = new Map([
      ["a", [1, 1]],
      ["b", [1, 1]],
      ["c", [5, 9]],
    ]);
    const d = neighbourhoodDomain(same, "a", { k: 1, aspect: 1 });
    expect(d.x[1] - d.x[0]).toBeGreaterThan(0);
    expect(d.y[1] - d.y[0]).toBeGreaterThan(0);
  });
  it("is null for a paper that isn't on the map", () => {
    expect(neighbourhoodDomain(positions, "zz")).toBeNull();
  });
});

describe("domainIncluding (#101)", () => {
  const base = neighbourhoodDomain(positions, "f", {
    k: 4,
    padding: 0.25,
    aspect: 1,
  });
  it("keeps the domain when the point is already inside", () => {
    expect(domainIncluding(base, [10, 10], [11, 10])).toBe(base);
  });
  it("zooms out around the same center until the point is inside, with padding", () => {
    const d = domainIncluding(base, [10, 10], [30, 10], { padding: 0.1 });
    expect((d.x[0] + d.x[1]) / 2).toBeCloseTo(10);
    expect((d.y[0] + d.y[1]) / 2).toBeCloseTo(10);
    expect(d.x[1]).toBeCloseTo(32);
    expect(isInside(d, [30, 10])).toBe(true);
    // the aspect ratio is kept
    expect((d.x[1] - d.x[0]) / (d.y[1] - d.y[0])).toBeCloseTo(1);
    const tall = domainIncluding(base, [10, 10], [10, -40], { padding: 0 });
    expect(tall.y[0]).toBeCloseTo(-40);
    expect(isInside(tall, [10, -40])).toBe(true);
  });
});

describe("interpolateDomain", () => {
  it("eases from one domain to the other", () => {
    const a = { x: [0, 10], y: [0, 5] };
    const b = { x: [-10, 20], y: [-5, 10] };
    expect(interpolateDomain(a, b, 0)).toEqual(a);
    expect(interpolateDomain(a, b, 1)).toEqual(b);
    const mid = interpolateDomain(a, b, 0.5);
    expect(mid.x[0]).toBeCloseTo(-5);
    expect(mid.y[1]).toBeCloseTo(7.5);
  });
});

describe("miniMapSummary (#101)", () => {
  const domain = { x: [7, 13], y: [7, 13] };
  it("says how many related papers are nearby on the map and how many far", () => {
    const text = miniMapSummary({
      title: "Focus",
      relatedIds: ["n1", "n2", "far", "far2", "nopos"],
      positions,
      domain,
    });
    expect(text).toBe(
      "Map neighbourhood of “Focus”: 2 related papers nearby, 2 far on the map",
    );
  });
  it("handles one or none", () => {
    expect(
      miniMapSummary({ title: "F", relatedIds: ["n1"], positions, domain }),
    ).toBe(
      "Map neighbourhood of “F”: 1 related paper nearby, 0 far on the map",
    );
    expect(
      miniMapSummary({ title: "F", relatedIds: [], positions, domain }),
    ).toBe("Map neighbourhood of “F”");
  });
});

describe("miniMapMotion (#101)", () => {
  it("animates with a short tween and a pulse when map animation is on", () => {
    expect(miniMapMotion({ enabled: true, speed: "normal" })).toEqual({
      tween: 350,
      pulse: 700,
    });
    expect(miniMapMotion({ enabled: true, speed: "fast" }).tween).toBe(200);
  });
  it("jumps without a pulse when animation is off (reduced motion)", () => {
    expect(miniMapMotion({ enabled: false, speed: "normal" })).toEqual({
      tween: 0,
      pulse: 0,
    });
  });
});
