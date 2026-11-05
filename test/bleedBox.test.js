import { describe, expect, it } from "vitest";
import { bleedBox } from "../src/lib/bleedBox.js";

// #181 review: the search-area layer reaches past the chart's box, but never past a box that
// clips or scrolls (a sticky map column scrolled sideways by 20px) nor the window
describe("bleedBox", () => {
  const chart = [100, 50, 500, 450];
  it("grows the box by x px sideways and y px up and down", () => {
    expect(bleedBox(chart, { x: 24, y: 16 })).toEqual([76, 34, 524, 466]);
  });
  it("stops at every limit ([x0, y0, x1, y1], ±Infinity for none)", () => {
    const scrollBox = [96, -Infinity, 504, Infinity];
    const window = [0, 0, 1280, 700];
    expect(
      bleedBox(chart, { x: 24, y: 16, limits: [scrollBox, window] }),
    ).toEqual([96, 34, 504, 466]);
    expect(
      bleedBox([10, 5, 300, 690], { x: 24, y: 16, limits: [window] }),
    ).toEqual([0, 0, 324, 700]);
  });
  it("never inside out: an empty box where limits leave nothing", () => {
    const [x0, y0, x1, y1] = bleedBox(chart, { limits: [[600, 0, 700, 10]] });
    expect(x1 - x0).toBeGreaterThanOrEqual(0);
    expect(y1 - y0).toBeGreaterThanOrEqual(0);
  });
});
