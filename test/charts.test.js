// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { vegaSelected } from "../src/widgets/vegaSelected.js";
import {
  BrushableScatterPlot,
  brushFilter,
  scatterSpec,
} from "../src/widgets/brushableScatterPlot.js";
import { BrushableHistogram } from "../src/widgets/brushableHistogram.js";

const data = [
  { id: "a", x: 0, y: 0, type: "full", score: 0.9 },
  { id: "b", x: 5, y: 5, type: "short", score: 0.2 },
  { id: "c", x: 10, y: 10, type: "full", score: 0.5 },
];

describe("vegaSelected adapter", () => {
  it("exposes signal changes as .value and emits input", async () => {
    const spec = {
      data: { values: data },
      mark: "point",
      params: [{ name: "drag", select: "interval" }],
      encoding: { x: { field: "x", type: "quantitative" }, y: { field: "y", type: "quantitative" } },
    };
    const widget = await vegaSelected(spec, { renderer: "svg" });
    expect(widget.value).toEqual({});
    let fired = 0;
    widget.addEventListener("input", () => fired++);
    await widget.view.signal("drag_x", [1, 6]).signal("drag_y", [1, 6]).runAsync();
    expect(widget.value.drag).toEqual({ x: [1, 6], y: [1, 6] });
    expect(fired).toBeGreaterThan(0);
  });
});

describe("brushFilter", () => {
  it("keeps points inside the brush rectangle", () => {
    expect(brushFilter(data, { x: [1, 6], y: [1, 6] }).map((d) => d.id)).toEqual(["b"]);
  });

  it("returns all data without a brush", () => {
    expect(brushFilter(data, null)).toHaveLength(3);
  });
});

describe("scatterSpec", () => {
  it("declares drag and click selections and hides axes", () => {
    const spec = scatterSpec(data, { color: "type", size: "score", tooltip: ["id"] });
    expect(spec.params.map((p) => p.name)).toEqual(["drag", "click"]);
    expect(spec.encoding.x.axis).toBeNull();
    expect(spec.encoding.color.field).toBe("type");
    expect(spec.encoding.size.field).toBe("score");
  });
});

describe("BrushableScatterPlot", () => {
  it("starts with everything brushed and nothing clicked", async () => {
    const widget = await BrushableScatterPlot(data, { renderer: "svg" });
    expect(widget.value.brushed).toHaveLength(3);
    expect(widget.value.clicked).toEqual([]);
  });

  it("updates brushed when the drag signal changes", async () => {
    const widget = await BrushableScatterPlot(data, { renderer: "svg" });
    let fired = 0;
    widget.addEventListener("input", () => fired++);
    await widget.view.signal("drag_x", [1, 11]).signal("drag_y", [1, 11]).runAsync();
    expect(widget.value.brushed.map((d) => d.id)).toEqual(["b", "c"]);
    expect(fired).toBeGreaterThan(0);
  });
});

describe("BrushableHistogram", () => {
  it("starts with the given range", () => {
    const widget = BrushableHistogram(data, { x: (d) => d.score, value: [0.3, 0.9] });
    expect(widget.value).toEqual([0.3, 0.9]);
    expect(widget.querySelector("svg")).not.toBeNull();
  });
});
