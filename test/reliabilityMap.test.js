import { describe, expect, it } from "vitest";
import {
  gridBuilds,
  reliabilityMapOptions,
} from "../src/components/reliabilityMap.js";

const everyPaper = Array.from({ length: 20 }, (_, i) => ({
  id: `p${i}`,
  x: i % 5,
  y: Math.floor(i / 5),
}));
const scores = Object.fromEntries(everyPaper.map((p, i) => [p.id, i / 19]));
const reliability = {
  metric: "trustworthiness",
  k: 10,
  label: "Reliability (trustworthiness, k=10)",
  overlay: false,
};
const base = {
  reliability,
  scores,
  everyPaper,
  shown: everyPaper,
  width: 220,
  height: 120,
};

describe("reliabilityMapOptions", () => {
  it("adds nothing before the projection is measured", () => {
    expect(
      reliabilityMapOptions({ ...base, scores: null, colorBy: "reliability" }),
    ).toEqual({});
  });

  it("colors by reliability with the ramp darkest at the least reliable end", () => {
    const options = reliabilityMapOptions({ ...base, colorBy: "reliability" });
    expect(options).toMatchObject({
      colorType: "quantitative",
      colorTitle: "Reliability (trustworthiness, k=10)",
      colorRange: ["#28377a", "#5f74bf", "#a3b0dc"],
    });
    expect(options.scoreDomain[1]).toBe(1);
    expect(options.overlay).toBeUndefined();
  });

  it("builds the overlay inside the shown papers' extent, for any color", () => {
    const shown = everyPaper.filter((p) => p.x <= 2);
    const options = reliabilityMapOptions({
      ...base,
      shown,
      colorBy: "typeLabel",
      reliability: { ...reliability, overlay: true },
    });
    expect(options.colorType).toBeUndefined();
    expect(options.overlay.length).toBeGreaterThan(0);
    for (const c of options.overlay) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x2).toBeLessThanOrEqual(2 + 1e-9);
      expect(c.y2).toBeLessThanOrEqual(3 + 1e-9);
    }
  });

  it("reuses the grid on an unrelated redraw and rebuilds it when the inputs change", () => {
    const on = { ...reliability, overlay: true };
    const ownScores = { ...scores };
    const options = (extra = {}) =>
      reliabilityMapOptions({
        ...base,
        scores: ownScores,
        reliability: on,
        cacheKey: ["umap", true],
        // fresh objects each redraw, as the page makes them
        shown: everyPaper.map((p) => ({ ...p })),
        ...extra,
      });
    const start = gridBuilds.count;
    const first = options({ colorBy: "typeLabel" }).overlay;
    expect(gridBuilds.count).toBe(start + 1);
    // Color, search, theme or My Papers changed: same grid, not rebuilt
    expect(options({ colorBy: "reliability" }).overlay).toBe(first);
    expect(gridBuilds.count).toBe(start + 1);
    // A filter, a size, a projection or new scores (k, metric) rebuild it
    options({ shown: everyPaper.slice(0, 10) });
    options({ width: 300 });
    options({ cacheKey: ["tsne", true] });
    reliabilityMapOptions({ ...base, reliability: on, scores: { ...scores } });
    expect(gridBuilds.count).toBe(start + 5);
  });
});
