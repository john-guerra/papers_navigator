import { describe, expect, it } from "vitest";
import {
  overlayDomain,
  reliabilityChanged,
  reliabilityDomain,
  reliabilityGrid,
  reliabilityLabel,
  scoresById,
} from "../src/lib/reliability.js";

describe("reliability labels and scores", () => {
  it("names the metric and k in the legend title", () => {
    expect(reliabilityLabel("trustworthiness", 10)).toBe(
      "Reliability (trustworthiness, k=10)",
    );
  });

  it("maps row i to papers[i].id", () => {
    expect(
      scoresById([{ id: "a" }, { id: "b" }], new Float64Array([0.5, 0.75])),
    ).toEqual({ a: 0.5, b: 0.75 });
  });

  it("spans the 5th percentile to the max, ignoring missing values", () => {
    const values = Array.from({ length: 101 }, (_, i) => i / 100);
    expect(reliabilityDomain([...values, NaN])).toEqual([0.05, 1]);
    expect(reliabilityDomain([])).toEqual([0, 1]);
    const [lo, hi] = reliabilityDomain([0.8, 0.8]);
    expect(lo).toBeLessThan(hi);
  });
});

describe("overlayDomain", () => {
  it("spans the 5th percentile to the lower quartile", () => {
    const values = Array.from({ length: 101 }, (_, i) => i / 100);
    expect(overlayDomain(values)).toEqual([0.05, 0.25]);
    const [lo, hi] = overlayDomain([0.8, 0.8, 0.8]);
    expect(lo).toBeLessThan(hi);
  });
});

describe("reliabilityChanged", () => {
  const umap = { a: 0.9 };
  const base = {
    metric: "trustworthiness",
    k: 10,
    overlay: false,
    scores: { umap },
  };

  it("ignores new scores for other projections", () => {
    expect(
      reliabilityChanged(
        base,
        { ...base, scores: { umap, tsne: { a: 1 } } },
        "umap",
      ),
    ).toBe(false);
  });

  it("notices the current projection's scores, metric, k and overlay", () => {
    expect(
      reliabilityChanged(
        base,
        { ...base, scores: { umap: { a: 0.9 } } },
        "umap",
      ),
    ).toBe(true);
    expect(
      reliabilityChanged(base, { ...base, metric: "continuity" }, "umap"),
    ).toBe(true);
    expect(reliabilityChanged(base, { ...base, k: 5 }, "umap")).toBe(true);
    expect(reliabilityChanged(base, { ...base, overlay: true }, "umap")).toBe(
      true,
    );
    expect(reliabilityChanged(null, base, "umap")).toBe(true);
    expect(reliabilityChanged(null, null, "umap")).toBe(false);
  });
});

describe("reliabilityGrid", () => {
  const options = {
    width: 100,
    height: 50,
    xDomain: [0, 10],
    yDomain: [0, 5],
    cell: 10,
    bandwidth: 5,
  };

  it("covers the map in cells of the given pixel size, in data units", () => {
    const points = [
      { x: 0, y: 0, value: 1 },
      { x: 10, y: 5, value: 1 },
      { x: 5, y: 2.5, value: 1 },
    ];
    const cells = reliabilityGrid(points, { ...options, minWeight: 0 });
    expect(cells).toHaveLength(10 * 5);
    expect(cells[0]).toMatchObject({ x: 0, x2: 1, y: 0, y2: 1 });
    expect(cells.at(-1)).toMatchObject({ x: 9, x2: 10, y: 4, y2: 5 });
  });

  it("averages nearby scores with a Gaussian kernel (Nadaraya–Watson)", () => {
    // Two points 20 px either side of the cell at (45, 25) px: equal weights ⇒ mean
    const points = [
      { x: 2.5, y: 2.5, value: 0.4 },
      { x: 6.5, y: 2.5, value: 0.8 },
    ];
    const cells = reliabilityGrid(points, {
      ...options,
      bandwidth: 20,
      minWeight: 0,
      domain: [0.4, 0.8],
    });
    const middle = cells.find((c) => c.x === 4 && c.y === 2);
    expect(middle.value).toBeCloseTo(0.6, 12);
    expect(middle.distortion).toBeCloseTo(0.5, 12);
    // Near the low point: lower value, more distortion
    const left = cells.find((c) => c.x === 2 && c.y === 2);
    expect(left.value).toBeLessThan(0.6);
    expect(left.distortion).toBeGreaterThan(0.5);
  });

  it("leaves out cells far from every point and clamps distortion to [0, 1]", () => {
    const cells = reliabilityGrid([{ x: 0.5, y: 0.5, value: 0.2 }], {
      ...options,
      domain: [0.5, 1],
    });
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThan(50);
    for (const c of cells) {
      expect(c.distortion).toBe(1);
      expect(c.x).toBeLessThan(3);
    }
  });
});
