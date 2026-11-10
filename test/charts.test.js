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

/** Names of the spec's params (#184: no live ramp-domain params any more). */
const paramNames = (spec) => (spec.params ?? []).map((p) => p.name);

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
      // categorical color: the legend's pick (#200)
      "legendPick",
    ]);
    expect(spec.encoding.x.axis).toBeNull();
    // categorical color goes through the categories + Other mapping (DESIGN.md)
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
      "#c37b71",
      "#a7463d",
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
    expect(paramNames(spec)).not.toContain("rampLo");
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
  it("rings the paper in focus in the list, and only papers on the map (#136)", async () => {
    const widget = await BrushableScatterPlot(
      [...data, { id: "off", x: NaN, y: NaN }],
      { focus: true },
    );
    expect(widget.view.data("focus")).toEqual([]);
    await widget.focusPaper(data[1].id);
    expect(widget.view.data("focus").map(({ x, y }) => ({ x, y }))).toEqual([
      { x: data[1].x, y: data[1].y },
    ]);
    await widget.focusPaper("off");
    expect(widget.view.data("focus")).toEqual([]);
    await widget.focusPaper(null);
    expect(widget.view.data("focus")).toEqual([]);
    // without the option the map has no focus layer and ignores the call
    const plain = await BrushableScatterPlot(data);
    await plain.focusPaper(data[0].id);
  });

  it("renders SVG by default, so its labels stay crisp (#134)", async () => {
    const widget = await BrushableScatterPlot(data);
    expect(widget.querySelector("svg.marks")).not.toBeNull();
    expect(widget.querySelector("canvas")).toBeNull();
    // no per-point ARIA: screen readers would hear hundreds of raw coordinates
    // the marks are visual only: the list and the aria-live lines are the accessible path, so
    // screen readers never walk hundreds of raw coordinates (the brush rect ignores config.aria)
    expect(widget.querySelector("svg.marks").getAttribute("aria-hidden")).toBe(
      "true",
    );
    const exposed = [
      ...widget.querySelectorAll('[role="graphics-symbol"]'),
    ].filter((el) => !el.closest('[aria-hidden="true"]'));
    expect(exposed).toEqual([]);
  });

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

  it("labels the similarity ramp with fixed ticks, evenly spread (#184)", async () => {
    const { scatterSpec } =
      await import("../src/widgets/brushableScatterPlot.js");
    const spec = scatterSpec(data, {
      color: "score",
      colorType: "quantitative",
      colorTitle: "Similarity",
      scoreDomain: [0, 0.6],
      legendLabels: ["0%", "30% (Good)", "60%+"],
      width: 300,
      height: 200,
    });
    const { compile } = await import("vega-lite");
    const [legend] = compile(spec).spec.legends;
    expect(legend.fill).toBe("color");
    const texts = await legendTexts(spec);
    expect(texts).toEqual(
      expect.arrayContaining(["Similarity", "0%", "30% (Good)", "60%+"]),
    );
    expect(texts.some((t) => /^\d\.\d$/.test(t))).toBe(false);
  });

  it("leaves the legend to the tapered bar when size echoes the ramp (#130)", async () => {
    const { scatterSpec, taperedLegend } =
      await import("../src/widgets/brushableScatterPlot.js");
    const options = {
      color: "score",
      colorType: "quantitative",
      colorTitle: "Similarity",
      scoreDomain: [0.3, 0.9],
      legendLabels: ["less similar", "more similar"],
      size: "score",
      width: 300,
      height: 200,
    };
    expect(taperedLegend(options)).toBe(true);
    // size spans the ramp's domain, so the bar tapers from the smallest to the largest dot
    expect(scatterSpec(data, options).encoding.size.scale).toMatchObject({
      domain: [0.3, 0.9],
      clamp: true,
    });
    const { compile } = await import("vega-lite");
    // neither a gradient nor a merged symbol legend from Vega
    expect(compile(scatterSpec(data, options)).spec.legends ?? []).toEqual([]);
    expect(taperedLegend({ ...options, size: null })).toBe(false);
    expect(taperedLegend({ ...options, legendLabels: null })).toBe(false);
    // tied scores collapse the ramp: Vega's plain gradient instead
    expect(taperedLegend({ ...options, scoreDomain: [0.5, 0.5] })).toBe(false);
    expect(taperedLegend({ ...options, scoreDomain: null })).toBe(false);
    expect(
      taperedLegend({ ...options, color: "room", colorType: "nominal" }),
    ).toBe(false);
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
      { name: "legendPick", value: null },
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

  it("maps the similarity ramp over the given fixed domain, clamped (#184)", async () => {
    const { scatterSpec } =
      await import("../src/widgets/brushableScatterPlot.js");
    const spec = scatterSpec(data, {
      color: "score",
      colorType: "quantitative",
      scoreDomain: [0, 0.6],
    });
    expect(spec.encoding.color.condition.scale).toMatchObject({
      domain: [0, 0.6],
      clamp: true,
    });
    expect(paramNames(spec)).not.toContain("rampLo");
    expect(paramNames(spec)).not.toContain("rampHi");
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

  it("with `matches`, dims papers outside the matchIds param (keyword matches, #125)", () => {
    const spec = scatterSpec(data, { color: "type", matches: true });
    expect(spec.params).toContainEqual({ name: "matchIds", value: null });
    expect(spec.encoding.color.condition.test.and).toContain(
      'matchIds == null || indexof(matchIds, datum["id"]) >= 0',
    );
    // without it, no param and no extra test (other maps are unchanged)
    const plain = scatterSpec(data, { color: "type" });
    expect(plain.params.map((p) => p.name)).not.toContain("matchIds");
  });

  it("highlights keyword matches through the matchIds signal without a redraw", async () => {
    const widget = await BrushableScatterPlot(data, {
      renderer: "svg",
      matches: true,
    });
    const view = widget.view;
    await widget.highlightMatches(["a", "c"]);
    expect(widget.view).toBe(view);
    expect(view.signal("matchIds")).toEqual(["a", "c"]);
    await widget.highlightMatches(null);
    expect(view.signal("matchIds")).toBeNull();
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

describe("fixed ramp domain (#184: the same color is the same % at every level)", () => {
  it("keeps the color and size domains when the level changes, and has no setScoreDomain", async () => {
    const widget = await BrushableScatterPlot(data, {
      renderer: "svg",
      width: 300,
      height: 200,
      color: "score",
      colorType: "quantitative",
      size: "score",
      scoreDomain: [0, 0.6],
    });
    document.body.append(widget);
    try {
      expect(widget.view.scale("color").domain()).toEqual([0, 0.6]);
      expect(widget.view.scale("size").domain()).toEqual([0, 0.6]);
      await widget.view.signal("levelCut", 0.45).runAsync();
      expect(widget.view.scale("color").domain()).toEqual([0, 0.6]);
      expect(widget.view.scale("size").domain()).toEqual([0, 0.6]);
      // Clamped: a 0.9 match gets the strongest color, like 0.6
      const color = widget.view.scale("color");
      expect(color(0.9)).toBe(color(0.6));
      // ...and at the low end: negative scores (common at All) get the weakest color and dot
      const size = widget.view.scale("size");
      expect(color(-0.2)).toBe(color(0));
      expect(size(-0.2)).toBe(12);
      expect(size(-0.2)).toBe(size(0));
      expect(widget.setScoreDomain).toBeUndefined();
    } finally {
      widget.remove();
    }
  });
});

describe("papers below the relevance level (#184 review)", () => {
  it("are drawn at the smallest size, as before the fixed domain", async () => {
    const options = {
      color: "score",
      colorType: "quantitative",
      size: "score",
      sizeRange: [12, 240],
      scoreDomain: [0, 0.6],
    };
    const size = scatterSpec(data, options).encoding.size;
    expect(size.condition).toEqual({
      test: "levelCut != null && datum.score < levelCut",
      value: 12,
    });
    // Rendered: at levelCut 0.45 the 0.2 and 0.5 papers differ only by the cut
    const widget = await BrushableScatterPlot(data, {
      ...options,
      renderer: "svg",
      width: 300,
      height: 200,
    });
    document.body.append(widget);
    try {
      await widget.view.signal("levelCut", 0.45).runAsync();
      const sizes = {};
      const walk = (node) => {
        if (node.marktype === "symbol")
          for (const item of node.items)
            if (item.datum?.id) sizes[item.datum.id] = item.size;
        for (const child of node.items ?? []) if (child.items) walk(child);
      };
      walk(widget.view.scenegraph().root);
      expect(sizes.b).toBe(12);
      expect(sizes.c).toBeGreaterThan(12);
      await widget.view.signal("levelCut", null).runAsync();
    } finally {
      widget.remove();
    }
  });
});

describe("tapered legend in the map's background (#168)", () => {
  it("is drawn under the points: before the marks, which stack above it", async () => {
    const widget = await BrushableScatterPlot(data, {
      renderer: "svg",
      width: 300,
      height: 200,
      color: "score",
      colorType: "quantitative",
      size: "score",
      scoreDomain: [0.3, 0.9],
      legendLabels: ["less similar", "more similar"],
      colorTitle: "Similarity",
    });
    document.body.append(widget);
    try {
      await new Promise((r) => setTimeout(r, 100));
      const legend = widget.querySelector(".similarity-legend");
      const marks = widget.querySelector(".marks");
      expect(legend).not.toBeNull();
      expect(legend.parentElement).toBe(marks.parentElement);
      expect(legend.nextElementSibling).toBe(marks);
      expect(marks.style.position).toBe("relative");
      expect(legend.dataset.corner).toBe("top-right");
    } finally {
      widget.remove();
    }
  });
});

describe("Color by: 10 categories + legend highlight (#200)", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    id: `p${i}`,
    x: i,
    y: i,
    // c0 most common … c11 least
    type: `c${i}`,
  })).flatMap((d, i) =>
    Array.from({ length: 12 - i }, (_, k) => ({ ...d, id: `${d.id}-${k}` })),
  );

  it("colors the 10 largest categories and groups the rest as Other", () => {
    const spec = scatterSpec(rows, { color: "type" });
    const { domain, range } = spec.encoding.color.condition.scale;
    expect(domain.slice(0, -1)).toEqual(
      Array.from({ length: 10 }, (_, i) => `c${i}`),
    );
    expect(range).toHaveLength(11);
    // the first three hues are unchanged; the 10 are distinct; Other is last
    expect(range.slice(0, 3)).toEqual(["#2a78d6", "#eb6834", "#1baf7a"]);
    expect(new Set(range).size).toBe(11);
    expect(range.at(-1)).toBe("#c9c3bb");
  });

  it("defaults topCategories to 10", async () => {
    const { topCategories, MAX_CATEGORIES } =
      await import("../src/widgets/brushableScatterPlot.js");
    expect(MAX_CATEGORIES).toBe(10);
    expect(topCategories(rows, "type")).toHaveLength(10);
  });

  it("has a legendPick signal that dims every other category", () => {
    const spec = scatterSpec(rows, { color: "type" });
    expect(paramNames(spec)).toContain("legendPick");
    expect(JSON.stringify(spec.encoding.color.condition.test)).toContain(
      "legendPick",
    );
    // no categories, no pick
    expect(
      paramNames(
        scatterSpec(data, { color: "score", colorType: "quantitative" }),
      ),
    ).not.toContain("legendPick");
  });

  it("highlightCategory sets the pick without redrawing", async () => {
    const widget = await BrushableScatterPlot(rows, { color: "type" });
    const view = widget.view;
    await widget.highlightCategory("c2");
    expect(widget.view).toBe(view);
    expect(view.signal("legendPick")).toBe("c2");
    await widget.highlightCategory(null);
    expect(view.signal("legendPick")).toBeNull();
  });
});

describe("interactiveLegends (#200)", () => {
  it("makes every legend's symbols and labels interactive, keeping their encode", async () => {
    const { interactiveLegends } =
      await import("../src/widgets/brushableScatterPlot.js");
    const spec = interactiveLegends({
      legends: [{ encode: { symbols: { update: { opacity: { value: 1 } } } } }],
      marks: [{ legends: [{}] }],
    });
    // keeps the encode; opacity becomes the pick's dimming (#203 Stage B)
    expect(spec.legends[0].encode.symbols).toEqual({
      update: {
        opacity: {
          signal: "legendPick == null || datum.value === legendPick ? 1 : 0.35",
        },
      },
      interactive: true,
    });
    expect(spec.legends[0].encode.labels.interactive).toBe(true);
    expect(spec.marks[0].legends[0].encode.symbols.interactive).toBe(true);
  });
});

describe("category legend on narrow maps (#200)", () => {
  it("shortens labels under 500px, not on wider maps", () => {
    const rows = [{ type: "a" }, { type: "b" }];
    const legend = (width) =>
      scatterSpec(rows, { color: "type", width }).encoding.color.condition
        .legend;
    expect(legend(358).labelLimit).toBe(90);
    expect(legend(800).labelLimit).toBeUndefined();
    expect(legend("container").labelLimit).toBeUndefined();
  });
});

describe("legend events stay in the legend (#202 review)", () => {
  const rows = ["a", "b", "c"].map((t, i) => ({
    id: `p${i}`,
    x: i,
    y: i,
    type: t,
  }));
  const mount = async () => {
    const w = await BrushableScatterPlot(rows, {
      color: "type",
      width: 400,
      height: 300,
    });
    document.body.append(w);
    return w;
  };
  const fire = (node, type) =>
    node.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true }),
    );

  it("a legend click pins the category and never reaches the brush, the point click or the page", async () => {
    const w = await mount();
    const svg = w.querySelector("svg");
    const seen = [];
    svg.addEventListener("click", () => seen.push("svg"));
    w.addEventListener("click", () => seen.push("widget"));
    svg.addEventListener("pointerdown", () => seen.push("svg-down"));
    const symbol = w.querySelector(".role-legend-symbol path");
    fire(symbol, "pointerdown");
    fire(symbol, "click");
    expect(seen).toEqual([]);
    await new Promise((r) => setTimeout(r));
    expect(w.view.signal("legendPick")).toBe("a");
    // pointing elsewhere keeps the pin; a second click unpins
    fire(w.querySelector("svg"), "pointermove");
    await new Promise((r) => setTimeout(r));
    expect(w.view.signal("legendPick")).toBe("a");
    fire(symbol, "click");
    await new Promise((r) => setTimeout(r));
    expect(w.view.signal("legendPick")).toBeNull();
    w.remove();
  });

  it("pointing at an entry previews it (no tooltip or neighbour lines underneath); leaving restores", async () => {
    const w = await mount();
    const moves = [];
    w.addEventListener("pointermove", () => moves.push("widget"));
    const label = w.querySelectorAll(".role-legend-label text")[1];
    fire(label, "pointermove");
    await new Promise((r) => setTimeout(r));
    expect(w.view.signal("legendPick")).toBe("b");
    expect(moves).toEqual([]);
    fire(w.querySelector("svg"), "pointermove");
    await new Promise((r) => setTimeout(r));
    expect(w.view.signal("legendPick")).toBeNull();
    w.remove();
  });

  it("legendValueAt finds the entry under a point (phones: taps hit the page, not the chart)", async () => {
    const w = await mount();
    const legend = w.querySelector(".role-legend");
    const rect = (x, y, width, height) => () => ({
      left: x,
      top: y,
      right: x + width,
      bottom: y + height,
      width,
      height,
    });
    legend.getBoundingClientRect = rect(300, 0, 100, 100);
    const labels = w.querySelectorAll(".role-legend-label text");
    labels.forEach(
      (t, i) => (t.getBoundingClientRect = rect(316, 10 + i * 16, 60, 12)),
    );
    expect(w.legendValueAt(320, 28)).toBe("b");
    // inside the legend box but between entries: in the legend, no value
    // (4 rows: a, b, c, Other at 10–70)
    expect(w.legendValueAt(305, 90)).toBeNull();
    expect(w.legendValueAt(10, 10)).toBeUndefined();
    w.toggleCategory("c");
    await new Promise((r) => setTimeout(r));
    expect(w.view.signal("legendPick")).toBe("c");
    w.toggleCategory("c");
    await new Promise((r) => setTimeout(r));
    expect(w.view.signal("legendPick")).toBeNull();
    w.remove();
  });
});

describe("legend pick: shown in the legend, labels, Esc (#203 Stage B)", () => {
  it("interactiveLegends dims the other entries while a category is picked, keeping their base opacity", async () => {
    const { interactiveLegends } =
      await import("../src/widgets/brushableScatterPlot.js");
    const spec = interactiveLegends({
      legends: [
        {
          encode: {
            symbols: {
              update: { opacity: { value: 0.7 }, fill: { value: "t" } },
            },
          },
        },
      ],
    });
    const { symbols, labels } = spec.legends[0].encode;
    expect(symbols.update.fill).toEqual({ value: "t" });
    expect(symbols.update.opacity.signal).toBe(
      "legendPick == null || datum.value === legendPick ? 0.7 : 0.245",
    );
    expect(labels.update.opacity.signal).toBe(
      "legendPick == null || datum.value === legendPick ? 1 : 0.35",
    );
  });

  it("labelKeep: only the picked category's papers may keep a label; clearCategory resets the pick", async () => {
    const rows = ["a", "a", "b"].map((t, i) => ({
      id: `p${i}`,
      x: i,
      y: i,
      type: t,
    }));
    const w = await BrushableScatterPlot(rows, { color: "type" });
    expect(w.labelKeep()).toBeNull();
    await w.toggleCategory("a");
    const keep = w.labelKeep();
    expect(rows.map(keep)).toEqual([true, true, false]);
    await w.clearCategory();
    expect(w.view.signal("legendPick")).toBeNull();
    expect(w.labelKeep()).toBeNull();
    // after clearing, a click on "a" pins it again (not unpins)
    await w.toggleCategory("a");
    expect(w.view.signal("legendPick")).toBe("a");
  });
});
