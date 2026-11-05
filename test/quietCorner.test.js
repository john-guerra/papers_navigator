import { describe, expect, it } from "vitest";
import { quietCorner } from "../src/lib/quietCorner.js";

describe("quietCorner (#168: where the legend sits under the points)", () => {
  const size = { width: 400, height: 300, box: [120, 50], inset: 8 };

  it("keeps the top-right corner when it is empty (DESIGN.md's default)", () => {
    expect(quietCorner([[200, 150]], size)).toEqual({
      corner: "top-right",
      left: 272,
      top: 8,
    });
  });

  it("moves to the corner with the fewest points", () => {
    const crowdedTopRight = [
      [350, 20],
      [330, 30],
      [300, 40],
    ];
    expect(quietCorner([...crowdedTopRight, [20, 20]], size).corner).toBe(
      "bottom-right",
    );
    expect(
      quietCorner([...crowdedTopRight, [350, 280], [20, 280]], size),
    ).toMatchObject({ corner: "top-left", left: 8, top: 8 });
  });

  it("bottom corners sit `inset` above the bottom edge", () => {
    const pts = [
      [350, 20],
      [20, 20],
    ];
    expect(quietCorner(pts, size)).toMatchObject({
      corner: "bottom-right",
      left: 272,
      top: 242,
    });
  });

  it("ignores points that are not finite", () => {
    expect(quietCorner([[NaN, 10]], size).corner).toBe("top-right");
  });
});

describe("quietCorner obstacles and hysteresis (#168 review)", () => {
  const size = { width: 400, height: 300, box: [120, 50], inset: 8 };

  it("counts topic labels and the search area (boxes) as occupied", () => {
    // A label box over the top-right corner outweighs one dot in the top-left
    const label = [300, 10, 390, 40];
    expect(
      quietCorner([[20, 20]], { ...size, obstacles: [label] }).corner,
    ).toBe("bottom-right");
  });

  it("stays in the current corner unless another is clearly quieter", () => {
    const pts = [
      [350, 20],
      [330, 30],
    ];
    // top-left is 2 better than top-right: moves (margin 2)
    expect(quietCorner(pts, { ...size, current: "top-right" }).corner).toBe(
      "top-left",
    );
    // one dot better is not enough
    expect(
      quietCorner([[350, 20]], { ...size, current: "top-right" }).corner,
    ).toBe("top-right");
    expect(
      quietCorner([[20, 20]], { ...size, current: "top-left" }),
    ).toMatchObject({ corner: "top-left", left: 8, top: 8 });
  });
});
