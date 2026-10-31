// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  diameterOf,
  similarityLegend,
  wedgePath,
} from "../src/widgets/similarityLegend.js";

describe("diameterOf", () => {
  it("turns a point area (px², Vega's size) into the dot's diameter", () => {
    expect(diameterOf(Math.PI)).toBeCloseTo(2);
    expect(diameterOf(240)).toBeCloseTo(17.48, 1);
    expect(diameterOf(-1)).toBe(0);
  });
});

describe("wedgePath", () => {
  it("has a flat bottom and a top that follows the dot diameter, not a straight line", () => {
    // area grows linearly 12 → 240 px²: the diameter grows as its square root
    const area = (t) => 12 + 228 * t;
    const d = wedgePath({
      width: 120,
      height: 20,
      diameterAt: (t) => diameterOf(area(t)),
      steps: 4,
    });
    const points = d
      .replace(/[MZ]/g, "")
      .trim()
      .split(/\s*L\s*/)
      .map((p) => p.split(",").map(Number));
    const base = 20;
    // first and last points sit on the baseline at both ends
    expect(points[0]).toEqual([0, base]);
    const tops = points.slice(1, 6);
    expect(tops.map((p) => p[0])).toEqual([0, 30, 60, 90, 120]);
    const heights = tops.map((p) => base - p[1]);
    expect(heights[0]).toBeCloseTo(diameterOf(12), 1);
    expect(heights[4]).toBeCloseTo(diameterOf(240), 1);
    // concave: the first quarter grows more than the last
    expect(heights[1] - heights[0]).toBeGreaterThan(heights[4] - heights[3]);
    expect(points.at(-1)).toEqual([120, base]);
    expect(d.endsWith("Z")).toBe(true);
  });
});

describe("similarityLegend", () => {
  const legend = () =>
    similarityLegend({
      title: "Similarity",
      labels: ["less similar", "more similar"],
      colorAt: (t) => (t < 0.5 ? "#c37b71" : "#75201a"),
      diameterAt: (t) => 4 + 13 * t,
      width: 120,
    });

  it("draws one tapered bar filled with the ramp, titled and labelled at its ends", () => {
    const el = legend();
    expect(el.classList.contains("similarity-legend")).toBe(true);
    expect(el.querySelector(".similarity-legend-title").textContent).toBe(
      "Similarity",
    );
    const labels = [...el.querySelectorAll(".similarity-legend-labels span")];
    expect(labels.map((s) => s.textContent)).toEqual([
      "less similar",
      "more similar",
    ]);
    const stops = el.querySelectorAll("linearGradient stop");
    expect(stops.length).toBeGreaterThan(2);
    expect(stops[0].getAttribute("stop-color")).toBe("#c37b71");
    expect(stops[stops.length - 1].getAttribute("stop-color")).toBe("#75201a");
    const path = el.querySelector("path");
    expect(path.getAttribute("fill")).toMatch(/^url\(#/);
  });

  it("says what it shows to screen readers and gives each legend its own gradient id", () => {
    const a = legend();
    const b = legend();
    expect(a.getAttribute("role")).toBe("img");
    expect(a.getAttribute("aria-label")).toBe(
      "Similarity: smaller, lighter dots are less similar; larger, darker dots are more similar",
    );
    expect(a.querySelector("linearGradient").id).not.toBe(
      b.querySelector("linearGradient").id,
    );
  });
});
