// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import vegaSelected from "vega-selected/dist/vegaSelected.es.js";
import {
  BrushableScatterPlot,
  brushFilter,
  reliabilityRange,
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
    expect(spec.params.map((p) => p.name)).toEqual([
      "drag",
      "click",
      "levelCut",
    ]);
    expect(spec.encoding.x.axis).toBeNull();
    // categorical color goes through the 3 + Other mapping (DESIGN.md)
    expect(spec.encoding.color.condition.field).toBe("__color");
    expect(spec.encoding.size.field).toBe("score");
  });
});

describe("scatterSpec color scales", () => {
  it("uses a sequential scale for a quantitative color field", () => {
    const spec = scatterSpec(data, {
      color: "score",
      colorType: "quantitative",
    });
    expect(spec.encoding.color.condition.type).toBe("quantitative");
    // DESIGN.md similarity ramp (viz-similarity-1..3); no CSS vars in jsdom, so the fallbacks
    expect(spec.encoding.color.condition.scale.range).toEqual([
      "#d5958c",
      "#b14f45",
      "#75201a",
    ]);
    expect(spec.encoding.color.condition.scale.scheme).toBeUndefined();
  });

  it("reads the similarity ramp from the --color-viz-similarity-* tokens", () => {
    document.documentElement.style.setProperty(
      "--color-viz-similarity-3",
      "#ffa99a",
    );
    try {
      const spec = scatterSpec(data, {
        color: "score",
        colorType: "quantitative",
      });
      expect(spec.encoding.color.condition.scale.range[2]).toBe("#ffa99a");
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
    expect(spec.encoding.color.condition.scale).toEqual({ scheme: "viridis" });
  });

  it("paints uncolored points with the viz-neutral token", () => {
    const spec = scatterSpec(data);
    expect(spec.encoding.color.condition.value).toBe("#605954");
  });

  it("uses the viz-cat tokens (not a library scheme) for categories", () => {
    const spec = scatterSpec(data, { color: "type" });
    expect(spec.encoding.color.condition.type).toBe("nominal");
    expect(spec.encoding.color.condition.scale.scheme).toBeUndefined();
    expect(spec.encoding.color.condition.legend.labelExpr).toContain("Other");
  });
});

describe("scatterSpec reliability (#84)", () => {
  it("takes another sequential range, e.g. the reliability ramp", () => {
    const range = reliabilityRange().slice().reverse();
    const spec = scatterSpec(data, {
      color: "score",
      colorType: "quantitative",
      colorRange: range,
      scoreDomain: [0.2, 0.9],
    });
    expect(spec.encoding.color.condition.scale).toMatchObject({
      range: ["#28377a", "#5f74bf", "#a3b0dc"],
      domain: [0.2, 0.9],
      clamp: true,
    });
  });

  it("draws the distortion overlay behind the points, ignoring the pointer", async () => {
    const overlay = [{ x: 0, x2: 5, y: 0, y2: 5, distortion: 0.8 }];
    const spec = scatterSpec(data, { overlay });
    expect(spec.layer).toHaveLength(2);
    const [shade, points] = spec.layer;
    expect(shade.mark).toMatchObject({ type: "rect", interactive: false });
    expect(shade.data.values).toBe(overlay);
    expect(shade.encoding.opacity.field).toBe("distortion");
    expect(points.params.map((p) => p.name)).toEqual(["drag", "click"]);
    // Still a working brushable chart
    const widget = await BrushableScatterPlot(data, {
      overlay,
      renderer: "svg",
    });
    expect(widget.value.brushed).toHaveLength(3);
  });

  it("clips the overlay to the plot", () => {
    const overlay = [{ x: 0, x2: 5, y: 0, y2: 5, distortion: 0.8 }];
    expect(scatterSpec(data, { overlay }).layer[0].mark.clip).toBe(true);
  });

  it("keeps the overlay out during a tween and fades it in as it settles", async () => {
    const overlay = [{ x: 0, x2: 5, y: 0, y2: 5, distortion: 0.8 }];
    const before = await BrushableScatterPlot(
      data.map((d) => ({ ...d, x: d.x * 2 })),
      { renderer: "svg" },
    );
    const after = await BrushableScatterPlot(data, {
      renderer: "svg",
      overlay,
      from: before,
      animate: { duration: 400 },
    });
    await after.stop();
    // In the real view: no cells mid-motion, all of them once it has settled
    const rects = () => {
      let n = 0;
      const walk = (node) => {
        if (
          node.marktype === "rect" &&
          node.role === "mark" &&
          !node.name?.includes("brush")
        )
          n += node.items.length;
        (node.items ?? []).forEach(walk);
      };
      walk(after.view.scenegraph().root);
      return n;
    };
    await after.view.signal("tm", 100).runAsync();
    expect(rects()).toBe(0);
    await after.view.signal("tm", 400).runAsync();
    expect(rects()).toBe(1);
    const spec = scatterSpec(data, {
      overlay,
      transition: {
        duration: 400,
        total: 400,
        xDomain: [
          [0, 20],
          [0, 10],
        ],
        yDomain: [
          [0, 10],
          [0, 10],
        ],
        motion: new Map(),
        exits: [],
        stageStart: () => 0,
      },
    });
    const [shade] = spec.layer;
    expect(shade.transform[0]).toEqual({ filter: "tm >= 300" });
    expect(shade.transform[1].calculate).toContain("datum.distortion * 0.35");
    expect(shade.encoding.opacity).toMatchObject({
      field: "__so",
      scale: null,
    });
  });

  it("has no overlay layer without cells", () => {
    expect(scatterSpec(data, { overlay: [] }).layer).toBeUndefined();
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

describe("scatterSpec legend (DESIGN.md → Legend)", () => {
  const legendTexts = async (spec) => {
    const vega = await import("vega");
    const { compile } = await import("vega-lite");
    const view = new vega.View(vega.parse(compile(spec).spec), {
      renderer: "none",
    });
    const svg = await view.toSVG();
    view.finalize();
    return [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
  };

  it("sits in the top-right corner on surface, so it never takes map width", async () => {
    const { scatterSpec } =
      await import("../src/widgets/brushableScatterPlot.js");
    const spec = scatterSpec([], { color: "typeLabel" });
    expect(spec.config.legend).toMatchObject({
      orient: "top-right",
      fillColor: "#fffdfa",
      padding: 8,
    });
  });

  it("labels the similarity ramp at its ends, not with scores", async () => {
    const { scatterSpec } =
      await import("../src/widgets/brushableScatterPlot.js");
    const spec = scatterSpec(data, {
      color: "score",
      colorType: "quantitative",
      colorTitle: "Similarity",
      scoreDomain: [0.3, 0.9],
      legendLabels: ["less similar", "more similar"],
      // size echoes the score: its legend must not merge into the ramp's (symbol legend)
      size: "score",
      width: 300,
      height: 200,
    });
    const { compile } = await import("vega-lite");
    const [legend] = compile(spec).spec.legends;
    expect(legend.fill).toBe("color");
    expect(legend.size).toBeUndefined();
    const texts = await legendTexts(spec);
    expect(texts).toEqual(
      expect.arrayContaining(["Similarity", "less similar", "more similar"]),
    );
    expect(texts.some((t) => /^\d\.\d$/.test(t))).toBe(false);
  });

  it("falls back to the data's extent without a score domain (e.g. reliability)", async () => {
    const { scatterSpec } =
      await import("../src/widgets/brushableScatterPlot.js");
    const spec = scatterSpec(data, {
      color: "score",
      colorType: "quantitative",
      legendLabels: ["less reliable", "more reliable"],
    });
    expect(spec.encoding.color.condition.legend.values).toEqual([0.2, 0.9]);
  });

  it("keeps categories (3 + Other) as a list of labels", async () => {
    const { scatterSpec } =
      await import("../src/widgets/brushableScatterPlot.js");
    const spec = scatterSpec(data, { color: "type", width: 300, height: 200 });
    const texts = await legendTexts(spec);
    expect(texts).toEqual(expect.arrayContaining(["full", "short"]));
  });
});

describe("scatterSpec color title", () => {
  it("uses colorTitle for the legend", async () => {
    const { scatterSpec } =
      await import("../src/widgets/brushableScatterPlot.js");
    const spec = scatterSpec([], {
      color: "score",
      colorType: "quantitative",
      colorTitle: "Similarity",
    });
    expect(spec.encoding.color.condition.title).toBe("Similarity");
  });
});

describe("selectionFromChart", () => {
  it("keeps the brushed papers when a point is clicked (no hidden clicked-point mode)", async () => {
    const { selectionFromChart } =
      await import("../src/widgets/brushableScatterPlot.js");
    const drag = { x: [1, 11], y: [1, 11] };
    const value = selectionFromChart({ drag, click: { id: ["b"] } }, data);
    expect(value.brushed.map((d) => d.id)).toEqual(["b", "c"]);
    expect(value.clicked.map((d) => d.id)).toEqual(["b"]);
  });
  it("clears clicked when the click selection is empty", async () => {
    const { selectionFromChart } =
      await import("../src/widgets/brushableScatterPlot.js");
    expect(
      selectionFromChart({ drag: null, click: null }, data).clicked,
    ).toEqual([]);
  });
});

describe("scatterSpec #10: My Papers rings, brush dimming, 3 + Other categories", () => {
  it("adds a ring layer driven by a `mine` id list, so it can update without a redraw", async () => {
    const { scatterSpec } =
      await import("../src/widgets/brushableScatterPlot.js");
    const spec = scatterSpec(data, { color: "type", ringIds: ["b"] });
    expect(spec.params).toEqual([
      { name: "mine", value: ["b"] },
      { name: "levelCut", value: null },
    ]);
    expect(spec.layer).toHaveLength(2);
    const [points, rings] = spec.layer;
    expect(points.params.map((p) => p.name)).toEqual(["drag", "click"]);
    expect(rings.mark).toMatchObject({ type: "point", filled: false });
    expect(rings.transform).toEqual([
      { filter: "indexof(mine, datum.id) >= 0" },
    ]);
    expect(rings.encoding.color).toBeUndefined();
  });

  it("updates the rings through the mine signal", async () => {
    const widget = await BrushableScatterPlot(data, {
      renderer: "svg",
      ringIds: [],
    });
    await widget.view.signal("mine", ["a", "c"]).runAsync();
    expect(widget.view.signal("mine")).toEqual(["a", "c"]);
  });

  it("draws points outside the brush or below the relevance level in viz-dim (#46)", async () => {
    const { scatterSpec } =
      await import("../src/widgets/brushableScatterPlot.js");
    const spec = scatterSpec(data, {
      color: "score",
      colorType: "quantitative",
    });
    const color = spec.encoding.color;
    expect(color.condition.test).toEqual({
      and: [
        { param: "drag", empty: true },
        "levelCut == null || datum.score >= levelCut",
      ],
    });
    expect(color.condition.field).toBe("score");
    expect(color.value).toBe("#e1ddd8");
    // null = "All": cosine scores can be negative and must not be dimmed
    expect(spec.params.find((p) => p.name === "levelCut")).toEqual({
      name: "levelCut",
      value: null,
    });
    // neutral (no color field): same rule, single colour
    const neutral = scatterSpec(data).encoding.color;
    expect(neutral.condition.value).toBe("#605954");
    expect(neutral.value).toBe("#e1ddd8");
  });

  it("starts the similarity ramp at the Good cut when given", async () => {
    const { scatterSpec } =
      await import("../src/widgets/brushableScatterPlot.js");
    const spec = scatterSpec(data, {
      color: "score",
      colorType: "quantitative",
      scoreDomain: [0.3, 0.7],
    });
    expect(spec.encoding.color.condition.scale).toMatchObject({
      domain: [0.3, 0.7],
      clamp: true,
    });
  });

  it("updates the level through the levelCut signal without a redraw", async () => {
    const widget = await BrushableScatterPlot(data, {
      renderer: "svg",
      color: "score",
      colorType: "quantitative",
    });
    await widget.view.signal("levelCut", 0.5).runAsync();
    expect(widget.view.signal("levelCut")).toBe(0.5);
  });

  it("colors only the given categories and groups the rest as Other", async () => {
    const { scatterSpec } =
      await import("../src/widgets/brushableScatterPlot.js");
    const rows = [{ type: "a" }, { type: "b" }, { type: "c" }, { type: "d" }];
    const spec = scatterSpec(rows, {
      color: "type",
      categories: ["b", "c", "a"],
    });
    const other = spec.encoding.color.condition.scale.domain.at(-1);
    expect(spec.data.values.map((d) => d.__color)).toEqual([
      "a",
      "b",
      "c",
      other,
    ]);
    expect(spec.encoding.color.condition.field).toBe("__color");
    expect(spec.encoding.color.condition.scale.domain).toEqual([
      "b",
      "c",
      "a",
      other,
    ]);
    // the bucket is a sentinel (a real category may be called "Other"), labelled "Other"
    expect(other).not.toBe("Other");
    expect(spec.encoding.color.condition.legend.labelExpr).toContain("Other");
    expect(spec.encoding.color.condition.scale.range).toHaveLength(4);
  });
});

describe("topCategories", () => {
  it("returns the n most common values", async () => {
    const { topCategories } =
      await import("../src/widgets/brushableScatterPlot.js");
    const rows = ["x", "y", "y", "z", "z", "z", "w"].map((type) => ({ type }));
    // ties (w, x both 1) break alphabetically
    expect(topCategories(rows, "type", 3)).toEqual(["z", "y", "w"]);
  });
});

describe("BrushableScatterPlot with rings", () => {
  it("still brushes when the spec is layered", async () => {
    const widget = await BrushableScatterPlot(data, {
      renderer: "svg",
      ringIds: ["a"],
    });
    await widget.view
      .signal("drag_x", [1, 11])
      .signal("drag_y", [1, 11])
      .runAsync();
    expect(widget.value.brushed.map((d) => d.id)).toEqual(["b", "c"]);
  });
});

describe("BrushableScatterPlot pointAt", () => {
  it("returns the point nearest to a screen position, within a tolerance", async () => {
    const widget = await BrushableScatterPlot(data, {
      renderer: "svg",
      width: 200,
      height: 200,
    });
    document.body.append(widget);
    const view = widget.view;
    const [ox, oy] = view.origin();
    const rect = widget.querySelector("svg").getBoundingClientRect();
    const px = (d) => [
      rect.left + ox + view.scale("x")(d.x),
      rect.top + oy + view.scale("y")(d.y),
    ];
    const [x, y] = px(data[1]);
    expect(widget.pointAt(x + 3, y - 2)?.id).toBe(data[1].id);
    expect(widget.pointAt(x + 200, y + 200)).toBeNull();
    widget.remove();
  });
});

describe("BrushableScatterPlot touch brushing (#85)", () => {
  // Vega hands pointerdown the item under the last pointermove; a touch has no hover first, so
  // the item is null and Vega-Lite's brush (a "scope" stream: inScope(event.item)) ignores it
  const PointerEventClass = globalThis.PointerEvent ?? MouseEvent;
  const press = (surface, pointerType) => {
    const event = new PointerEventClass("pointerdown", {
      bubbles: true,
      clientX: 40,
      clientY: 50,
    });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    surface.dispatchEvent(event);
  };
  const record = async () => {
    const widget = await BrushableScatterPlot(data, {
      renderer: "svg",
      width: 200,
      height: 200,
    });
    document.body.append(widget);
    const surface = widget.querySelector("svg");
    const seen = [];
    for (const type of ["pointermove", "pointerdown"])
      surface.addEventListener(type, (e) =>
        seen.push([type, e.clientX, e.clientY]),
      );
    return { widget, surface, seen };
  };

  it("sends a pointermove at the touch point before a touch pointerdown", async () => {
    const { widget, surface, seen } = await record();
    press(surface, "touch");
    expect(seen).toEqual([
      ["pointermove", 40, 50],
      ["pointerdown", 40, 50],
    ]);
    widget.remove();
  });

  it("leaves mouse presses alone (a mouse always hovers first)", async () => {
    const { widget, surface, seen } = await record();
    press(surface, "mouse");
    expect(seen).toEqual([["pointerdown", 40, 50]]);
    widget.remove();
  });
});

describe("BrushableScatterPlot only emits on selection changes", () => {
  it("doesn't emit input when a non-selection signal (levelCut, mine) changes", async () => {
    const widget = await BrushableScatterPlot(data, {
      renderer: "svg",
      ringIds: [],
    });
    let fired = 0;
    widget.addEventListener("input", () => fired++);
    await widget.view.signal("levelCut", 0.5).runAsync();
    await widget.view.signal("mine", ["a"]).runAsync();
    await new Promise((r) => setTimeout(r, 50));
    expect(fired).toBe(0);
    await widget.view
      .signal("drag_x", [1, 11])
      .signal("drag_y", [1, 11])
      .runAsync();
    await new Promise((r) => setTimeout(r, 50));
    expect(fired).toBeGreaterThan(0);
  });
});

describe("tooltip fields with titles and formats", () => {
  it("accepts {field, title, format} as well as plain field names", () => {
    const spec = scatterSpec([{ id: "a", x: 0, y: 0, score: 0.5 }], {
      tooltip: ["id", { field: "score", title: "Similarity", format: ".0%" }],
    });
    expect(spec.encoding.tooltip).toEqual([
      { field: "id" },
      { field: "score", title: "Similarity", format: ".0%" },
    ]);
  });
});
