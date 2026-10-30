// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  BrushableScatterPlot,
  scatterSpec,
} from "../src/widgets/brushableScatterPlot.js";

const before = [
  { id: "a", x: 0, y: 0, cluster: 1, clusterLabel: "One" },
  { id: "b", x: 10, y: 0, cluster: 1, clusterLabel: "One" },
  { id: "c", x: 0, y: 10, cluster: 2, clusterLabel: "Two" },
  { id: "d", x: 10, y: 10, cluster: 2, clusterLabel: "Two" },
];
const options = { renderer: "svg", width: 200, height: 200, ringIds: [] };

// Rows of the points layer as Vega has them now (after the tween formulas)
const drawn = (widget) => {
  const name = widget.view.getState({
    data: (n) => n.startsWith("data_"),
    signals: () => false,
  }).data;
  const key = Object.keys(name).find((n) =>
    widget.view.data(n).some((d) => d.__x1 !== undefined),
  );
  return widget.view.data(key);
};

describe("scatterSpec transition (#82)", () => {
  it("adds no tween without a transition", () => {
    const spec = scatterSpec(before, { ringIds: [] });
    expect(spec.transform).toBeUndefined();
    expect(spec.params.map((p) => p.name)).not.toContain("tm");
  });
});

describe("BrushableScatterPlot animated redraw (#82)", () => {
  it("draws points where they were, then moves them to their new positions", async () => {
    const first = await BrushableScatterPlot(before, options);
    const moved = before.map((d) => ({ ...d, x: d.x + 5, y: d.y * 2 }));
    const second = await BrushableScatterPlot(moved, {
      ...options,
      from: first,
      animate: { duration: 40 },
    });
    const start = Object.fromEntries(
      drawn(second).map((d) => [d.id, [d.x, d.y]]),
    );
    expect(start.d).toEqual([10, 10]);
    await second.finished;
    const end = Object.fromEntries(
      drawn(second).map((d) => [d.id, [d.x, d.y]]),
    );
    expect(end.d).toEqual([15, 20]);
    expect(second.animationStats?.frames).toBeGreaterThan(0);
    // The selection is always about the new positions
    expect(second.value.brushed).toHaveLength(4);
  });

  it("fades leaving points out and removes them at the end", async () => {
    const first = await BrushableScatterPlot(before, options);
    const second = await BrushableScatterPlot(before.slice(0, 3), {
      ...options,
      from: first,
      animate: { duration: 30 },
    });
    expect(drawn(second).map((d) => d.id)).toContain("d");
    await second.finish();
    expect(drawn(second).map((d) => d.id)).not.toContain("d");
    expect(second.pointAt(0, 0, 1e6)?.id).not.toBe("d");
  });

  it("does not animate when nothing moves", async () => {
    const first = await BrushableScatterPlot(before, options);
    const second = await BrushableScatterPlot(
      before.map((d) => ({ ...d })),
      { ...options, from: first, animate: { duration: 30 } },
    );
    expect(() => second.view.signal("tm")).toThrow();
  });

  it("snapshots positions mid-motion so an interrupted animation continues from there", async () => {
    const first = await BrushableScatterPlot(before, options);
    const moved = before.map((d) => ({ ...d, x: d.x + 100 }));
    const second = await BrushableScatterPlot(moved, {
      ...options,
      from: first,
      animate: { duration: 10000 },
    });
    await new Promise((r) => setTimeout(r, 120));
    const snap = second.snapshot();
    const [xa] = snap.positions.get("a");
    expect(xa).toBeGreaterThanOrEqual(0);
    expect(xa).toBeLessThan(100);
  });

  it("restores a region selection given in data units", async () => {
    const first = await BrushableScatterPlot(before, options);
    await first.view
      .signal("drag_x", [-1, 11])
      .signal("drag_y", [-1, 1])
      .runAsync();
    // The page passes the old brush when only filters changed
    const brush = { x: [-1, 11], y: [-1, 1] };
    const second = await BrushableScatterPlot(before.slice(0, 3), {
      ...options,
      from: first,
      brush,
      animate: { duration: 20 },
    });
    expect(second.value.brushed.map((d) => d.id).sort()).toEqual(["a", "b"]);
    const restored = second.brush();
    expect(restored.x[0]).toBeCloseTo(-1, 6);
    expect(restored.y[1]).toBeCloseTo(1, 6);
  });
});
