// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import vegaSelected from "vega-selected/dist/vegaSelected.es.js";
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

describe("vega-selected (npm)", () => {
  it("exposes signal changes as .value and emits input", async () => {
    const spec = {
      data: { values: data },
      mark: "point",
      params: [{ name: "drag", select: "interval" }],
      encoding: {
        x: { field: "x", type: "quantitative" },
        y: { field: "y", type: "quantitative" },
      },
    };
    const widget = await vegaSelected(spec, {
      vegaConfig: { renderer: "svg", actions: false },
    });
    expect(widget.value).toEqual({});
    let fired = 0;
    widget.addEventListener("input", () => fired++);
    await widget.view
      .signal("drag_x", [1, 6])
      .signal("drag_y", [1, 6])
      .runAsync();
    expect(widget.value.drag).toEqual({ x: [1, 6], y: [1, 6] });
    expect(fired).toBeGreaterThan(0);
  });
});

describe("brushFilter", () => {
  it("keeps points inside the brush rectangle", () => {
    expect(
      brushFilter(data, { x: [1, 6], y: [1, 6] }).map((d) => d.id),
    ).toEqual(["b"]);
  });

  it("returns all data without a brush", () => {
    expect(brushFilter(data, null)).toHaveLength(3);
  });
});

describe("scatterSpec", () => {
  it("declares drag and click selections and hides axes", () => {
    const spec = scatterSpec(data, {
      color: "type",
      size: "score",
      tooltip: ["id"],
    });
    expect(spec.params.map((p) => p.name)).toEqual(["drag", "click"]);
    expect(spec.encoding.x.axis).toBeNull();
    // categorical color goes through the 3 + Other mapping (DESIGN.md)
    expect(spec.encoding.color.field).toBe("__color");
    expect(spec.encoding.size.field).toBe("score");
  });
});

describe("scatterSpec color scales", () => {
  it("uses a sequential scale for a quantitative color field", () => {
    const spec = scatterSpec(data, {
      color: "score",
      colorType: "quantitative",
    });
    expect(spec.encoding.color.type).toBe("quantitative");
    // DESIGN.md similarity ramp (viz-similarity-1..3); no CSS vars in jsdom, so the fallbacks
    expect(spec.encoding.color.scale.range).toEqual(["#d5958c", "#b14f45", "#75201a"]);
    expect(spec.encoding.color.scale.scheme).toBeUndefined();
  });

  it("reads the similarity ramp from the --color-viz-similarity-* tokens", () => {
    document.documentElement.style.setProperty("--color-viz-similarity-3", "#ffa99a");
    try {
      const spec = scatterSpec(data, { color: "score", colorType: "quantitative" });
      expect(spec.encoding.color.scale.range[2]).toBe("#ffa99a");
    } finally {
      document.documentElement.style.removeProperty("--color-viz-similarity-3");
    }
  });

  it("still accepts an explicit colorScheme", () => {
    const spec = scatterSpec(data, {
      color: "score",
      colorType: "quantitative",
      colorScheme: "viridis",
    });
    expect(spec.encoding.color.scale).toEqual({ scheme: "viridis" });
  });

  it("paints uncolored points with the viz-neutral token", () => {
    const spec = scatterSpec(data);
    expect(spec.mark.color).toBe("#605954");
  });

  it("uses the viz-cat tokens (not a library scheme) for categories", () => {
    const spec = scatterSpec(data, { color: "type" });
    expect(spec.encoding.color.type).toBe("nominal");
    expect(spec.encoding.color.scale.scheme).toBeUndefined();
    expect(spec.encoding.color.legend.labelExpr).toContain("Other");
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
    await widget.view
      .signal("drag_x", [1, 11])
      .signal("drag_y", [1, 11])
      .runAsync();
    expect(widget.value.brushed.map((d) => d.id)).toEqual(["b", "c"]);
    expect(fired).toBeGreaterThan(0);
  });
});

describe("BrushableHistogram", () => {
  it("starts with the given range", () => {
    const widget = BrushableHistogram(data, {
      x: (d) => d.score,
      value: [0.3, 0.9],
    });
    expect(widget.value).toEqual([0.3, 0.9]);
    expect(widget.querySelector("svg")).not.toBeNull();
  });
});

describe("scatterSpec legend", () => {
  it("puts the color legend below the plot so it doesn't take map width", async () => {
    const { scatterSpec } = await import("../src/widgets/brushableScatterPlot.js");
    const spec = scatterSpec([], { color: "typeLabel" });
    expect(spec.encoding.color.legend).toMatchObject({ orient: "bottom" });
  });
});

describe("scatterSpec color title", () => {
  it("uses colorTitle for the legend", async () => {
    const { scatterSpec } = await import("../src/widgets/brushableScatterPlot.js");
    const spec = scatterSpec([], { color: "score", colorType: "quantitative", colorTitle: "Similarity" });
    expect(spec.encoding.color.title).toBe("Similarity");
  });
});

describe("selectionFromChart", () => {
  it("keeps the brushed papers when a point is clicked (no hidden clicked-point mode)", async () => {
    const { selectionFromChart } = await import("../src/widgets/brushableScatterPlot.js");
    const drag = { x: [1, 11], y: [1, 11] };
    const value = selectionFromChart({ drag, click: { id: ["b"] } }, data);
    expect(value.brushed.map((d) => d.id)).toEqual(["b", "c"]);
    expect(value.clicked.map((d) => d.id)).toEqual(["b"]);
  });
  it("clears clicked when the click selection is empty", async () => {
    const { selectionFromChart } = await import("../src/widgets/brushableScatterPlot.js");
    expect(selectionFromChart({ drag: null, click: null }, data).clicked).toEqual([]);
  });
});

describe("scatterSpec #10: My Papers rings, brush dimming, 3 + Other categories", () => {
  it("adds a ring layer driven by a `mine` id list, so it can update without a redraw", async () => {
    const { scatterSpec } = await import("../src/widgets/brushableScatterPlot.js");
    const spec = scatterSpec(data, { color: "type", ringIds: ["b"] });
    expect(spec.params).toEqual([{ name: "mine", value: ["b"] }]);
    expect(spec.layer).toHaveLength(2);
    const [points, rings] = spec.layer;
    expect(points.params.map((p) => p.name)).toEqual(["drag", "click"]);
    expect(rings.mark).toMatchObject({ type: "point", filled: false });
    expect(rings.transform).toEqual([{ filter: "indexof(mine, datum.id) >= 0" }]);
    expect(rings.encoding.color).toBeUndefined();
  });

  it("updates the rings through the mine signal", async () => {
    const widget = await BrushableScatterPlot(data, { renderer: "svg", ringIds: [] });
    await widget.view.signal("mine", ["a", "c"]).runAsync();
    expect(widget.view.signal("mine")).toEqual(["a", "c"]);
  });

  it("dims points outside the brush and keeps all points bright without one", async () => {
    const { scatterSpec } = await import("../src/widgets/brushableScatterPlot.js");
    const opacity = scatterSpec(data).encoding.opacity;
    expect(opacity.condition).toMatchObject({ param: "drag", empty: true });
    expect(opacity.condition.value).toBeGreaterThan(opacity.value);
  });

  it("colors only the given categories and groups the rest as Other", async () => {
    const { scatterSpec } = await import("../src/widgets/brushableScatterPlot.js");
    const rows = [{ type: "a" }, { type: "b" }, { type: "c" }, { type: "d" }];
    const spec = scatterSpec(rows, { color: "type", categories: ["b", "c", "a"] });
    const other = spec.encoding.color.scale.domain.at(-1);
    expect(spec.data.values.map((d) => d.__color)).toEqual(["a", "b", "c", other]);
    expect(spec.encoding.color.field).toBe("__color");
    expect(spec.encoding.color.scale.domain).toEqual(["b", "c", "a", other]);
    // the bucket is a sentinel (a real category may be called "Other"), labelled "Other"
    expect(other).not.toBe("Other");
    expect(spec.encoding.color.legend.labelExpr).toContain("Other");
    expect(spec.encoding.color.scale.range).toHaveLength(4);
  });
});

describe("topCategories", () => {
  it("returns the n most common values", async () => {
    const { topCategories } = await import("../src/widgets/brushableScatterPlot.js");
    const rows = ["x", "y", "y", "z", "z", "z", "w"].map((type) => ({ type }));
    // ties (w, x both 1) break alphabetically
    expect(topCategories(rows, "type", 3)).toEqual(["z", "y", "w"]);
  });
});

describe("BrushableScatterPlot with rings", () => {
  it("still brushes when the spec is layered", async () => {
    const widget = await BrushableScatterPlot(data, { renderer: "svg", ringIds: ["a"] });
    await widget.view.signal("drag_x", [1, 11]).signal("drag_y", [1, 11]).runAsync();
    expect(widget.value.brushed.map((d) => d.id)).toEqual(["b", "c"]);
  });
});

describe("BrushableScatterPlot pointAt", () => {
  it("returns the point nearest to a screen position, within a tolerance", async () => {
    const widget = await BrushableScatterPlot(data, { renderer: "svg", width: 200, height: 200 });
    document.body.append(widget);
    const view = widget.view;
    const [ox, oy] = view.origin();
    const rect = widget.querySelector("svg").getBoundingClientRect();
    const px = (d) => [rect.left + ox + view.scale("x")(d.x), rect.top + oy + view.scale("y")(d.y)];
    const [x, y] = px(data[1]);
    expect(widget.pointAt(x + 3, y - 2)?.id).toBe(data[1].id);
    expect(widget.pointAt(x + 200, y + 200)).toBeNull();
    widget.remove();
  });
});
