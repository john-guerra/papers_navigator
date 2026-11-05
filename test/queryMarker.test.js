// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  BrushableScatterPlot,
  queryRows,
  queryTooltip,
  scatterSpec,
} from "../src/widgets/brushableScatterPlot.js";

const data = [
  { id: "a", x: 0, y: 0 },
  { id: "b", x: 10, y: 0 },
  { id: "c", x: 0, y: 10 },
  { id: "d", x: 10, y: 10 },
];
const marker = {
  label: "★ Your search",
  text: "“<b>dimensionality</b> reduction”",
  x: 2,
  y: 3,
  spread: 2,
  nearest: [
    { id: "a", title: "Paper A", x: 0, y: 0, similarity: 0.61 },
    { id: "c", title: "Paper C", x: 0, y: 10, similarity: 0.42 },
  ],
};

describe("queryRows", () => {
  it("lines to the nearest papers, then the marker (the area is drawn apart, #167 review)", () => {
    const rows = queryRows([marker]);
    expect([...new Set(rows.map((r) => r.kind))]).toEqual(["line", "marker"]);
    expect(rows.find((r) => r.kind === "line")).toMatchObject({
      x: 2,
      y: 3,
      x2: 0,
      y2: 0,
      m: 0,
    });
    // The star and the name are drawn apart (the star marks the spot)
    expect(rows.at(-1)).toMatchObject({
      label: "★ Your search",
      name: "Your search",
      m: 0,
    });
  });

  it("numbers markers by index", () => {
    const rows = queryRows([marker, { ...marker, label: "★ My research 2" }]);
    expect(rows.filter((r) => r.kind === "marker").map((r) => r.m)).toEqual([
      0, 1,
    ]);
    expect(rows.at(-1).name).toBe("My research 2");
  });
});

describe("queryTooltip", () => {
  it("says what it is, that it is approximate, and its nearest papers", () => {
    expect(queryTooltip(marker)).toEqual({
      "Your search": "“<b>dimensionality</b> reduction”",
      Position: "approximate (from its 2 most similar papers)",
      Nearest: "Paper A (61%)",
      "2nd nearest": "Paper C (42%)",
    });
  });

  it("says when few similar papers are visible", () => {
    expect(queryTooltip({ ...marker, faint: true }).Position).toBe(
      "approximate (from its 2 most similar papers) (few similar papers visible)",
    );
  });
});

describe("faint marker", () => {
  it("rows carry `faint`, and the marker layers fade it", async () => {
    const rows = queryRows([{ ...marker, faint: true }]);
    expect(
      rows.filter((r) => r.kind !== "line").every((r) => r.faint === true),
    ).toBe(true);
    const spec = scatterSpec(data, { width: 200, height: 200, query: true });
    const star = spec.layer.find(
      (l) => l.data?.name === "query" && l.encoding.text?.value === "★",
    );
    expect(star.encoding.opacity).toEqual({
      condition: { test: "datum.faint", value: 0.4 },
      value: 1,
    });
    expect(star.mark.opacity).toBeUndefined();
  });

  it("is drawn at lower opacity", async () => {
    const widget = await build();
    await widget.placeQuery([{ ...marker, faint: true }]);
    const svg = widget.querySelector("svg.marks").innerHTML;
    expect(svg).toMatch(/opacity="0.4"/);
  });
});

describe("scatterSpec with a query layer", () => {
  it("adds the empty `query` dataset, the hover param, and its marks under the points (#167)", () => {
    const spec = scatterSpec(data, { width: 200, height: 200, query: true });
    expect(spec.datasets).toEqual({ query: [] });
    expect(spec.params.map((p) => p.name)).toContain("queryHover");
    const pointsAt = spec.layer.findIndex(
      (l) => l.mark.type === "point" && !l.data,
    );
    const queryAt = (test) =>
      spec.layer.findIndex((l) => l.data?.name === "query" && test(l));
    // The star sits under the points, the hover lines over them…
    expect(queryAt((l) => l.encoding.text?.value === "★")).toBeLessThan(
      pointsAt,
    );
    expect(queryAt((l) => l.mark.type === "rule")).toBeGreaterThan(pointsAt);
    // …and the name above everything, topic labels included (#167 review)
    const nameAt = queryAt((l) => l.encoding.text?.field === "name");
    expect(nameAt).toBeGreaterThan(pointsAt);
    expect(spec.layer.at(-1).encoding.text?.field).toBe("name");
    // No diamond, no area cells in Vega (the area is one SVG path behind the map)
    expect(spec.layer.some((l) => l.mark.shape === "diamond")).toBe(false);
    expect(queryAt((l) => l.mark.type === "rect")).toBe(-1);
    expect(
      spec.layer.every(
        (l) => l.data?.name !== "query" || l.mark.interactive === false,
      ),
    ).toBe(true);
    expect(
      scatterSpec(data, { width: 200, height: 200 }).datasets,
    ).toBeUndefined();
  });

  it("keeps both datasets with neighbours on", () => {
    const spec = scatterSpec(data, {
      width: 200,
      height: 200,
      query: true,
      neighbours: true,
    });
    expect(spec.datasets).toEqual({ nn: [], query: [] });
  });

  // #116 review: a row with only one finite coordinate is not drawn, so it doesn't widen an axis
  it("takes the domains from rows with both coordinates finite", () => {
    const spec = scatterSpec([...data, { id: "e", x: 100, y: null }], {
      width: 200,
      height: 200,
    });
    const x = (spec.encoding ?? spec.layer[0].encoding).x.scale.domain;
    expect(x).toEqual([0, 10]);
  });
});

const widgets = [];
afterEach(() => {
  while (widgets.length) widgets.pop().remove();
});
async function build(options = {}) {
  const widget = await BrushableScatterPlot(data, {
    renderer: "svg",
    width: 200,
    height: 200,
    query: true,
    ...options,
  });
  document.body.append(widget);
  widgets.push(widget);
  return widget;
}
function screen(widget, d) {
  const view = widget.view;
  const [ox, oy] = view.origin();
  const rect = widget.querySelector("svg.marks").getBoundingClientRect();
  return [
    rect.left + ox + view.scale("x")(d.x),
    rect.top + oy + view.scale("y")(d.y),
  ];
}

describe("BrushableScatterPlot query marker (#100)", () => {
  it("is hidden until placed, then drawn without a redraw, and hidden again with []", async () => {
    const widget = await build();
    const svgBefore = widget.querySelector("svg.marks");
    expect(widget.view.data("query")).toEqual([]);
    await widget.placeQuery([marker]);
    expect(widget.view.data("query").map((r) => r.kind)).toContain("marker");
    expect(widget.querySelector("svg.marks")).toBe(svgBefore);
    expect(widget.querySelector("svg.marks").textContent).toContain(
      "Your search",
    );
    expect(widget.querySelector("svg.marks").textContent).toContain("★");
    await widget.placeQuery([]);
    expect(widget.view.data("query")).toEqual([]);
  });

  it("doesn't change the scales", async () => {
    const widget = await build();
    const before = [
      widget.view.scale("x").domain(),
      widget.view.scale("y").domain(),
    ];
    await widget.placeQuery([{ ...marker, spread: 50 }]);
    expect([
      widget.view.scale("x").domain(),
      widget.view.scale("y").domain(),
    ]).toEqual(before);
  });

  it("finds the marker near a screen position", async () => {
    const widget = await build();
    await widget.placeQuery([marker]);
    const [cx, cy] = screen(widget, widget.queryMarkers()[0]);
    expect(widget.queryAt(cx + 3, cy - 3)).toBe(0);
    const [ax, ay] = screen(widget, data[3]);
    expect(widget.queryAt(ax, ay)).toBe(-1);
  });

  it("hovering the marker shows its lines and suppresses a paper's neighbour preview", async () => {
    const similar = () => [{ id: "b", similarity: 0.5 }];
    const widget = await build({ neighbours: { similar, k: 1 } });
    await widget.placeQuery([marker]);
    const move = (at) => {
      const event = new (globalThis.PointerEvent ?? MouseEvent)("pointermove", {
        bubbles: true,
        clientX: at[0],
        clientY: at[1],
      });
      if (!("pointerType" in event))
        Object.defineProperty(event, "pointerType", { value: "mouse" });
      widget.dispatchEvent(event);
    };
    move(screen(widget, widget.queryMarkers()[0]));
    await new Promise((r) => setTimeout(r, 40));
    expect(widget.view.signal("queryHover")).toBe(0);
    expect(widget.neighbours.focus).toBeNull();
    // On a paper far from the marker: no marker hover, the paper's preview
    move(screen(widget, data[3]));
    await new Promise((r) => setTimeout(r, 40));
    expect(widget.view.signal("queryHover")).toBe(-1);
    expect(widget.neighbours.focus).toBe("d");
  });

  it("a placeQuery on a map built without `query` does nothing", async () => {
    const widget = await build({ query: false });
    await widget.placeQuery([marker]);
    expect(widget.queryMarkers()).toEqual([]);
  });
});

describe("query marker through a motion (#82)", () => {
  it("compiles and renders the faded marker mid-tween and at the end", async () => {
    const vega = await import("vega");
    const { compile } = await import("vega-lite");
    const { planTransition } =
      await import("../src/widgets/scatterTransition.js");
    const moved = data.map((d) => ({ ...d, x: d.x * 2 }));
    const from = {
      positions: new Map(data.map((d) => [d.id, [d.x, d.y]])),
      rows: new Map(data.map((d) => [d.id, d])),
      xDomain: [0, 10],
      yDomain: [0, 10],
      labels: [],
    };
    const transition = planTransition(moved, from, { duration: 400 });
    const spec = scatterSpec(moved, {
      width: 200,
      height: 200,
      query: true,
      transition,
    });
    const view = new vega.View(vega.parse(compile(spec).spec), {
      renderer: "none",
    });
    await view.runAsync();
    view.change(
      "query",
      view.changeset().insert(queryRows([{ ...marker, faint: true }])),
    );
    view.signal("tm", transition.total / 2);
    await view.runAsync();
    view.signal("tm", transition.total);
    await view.runAsync();
    expect(await view.toSVG()).toContain("Your search");
    view.finalize();
  });
});

describe("similarity topo map behind the map (#182)", () => {
  // A dense patch of papers around (1.5, 1.5) scoring 0.5, in a sparser ring scoring 0.3
  const scores = [
    ...Array.from({ length: 25 }, (_, i) => ({
      x: 1.5 + ((i % 5) - 2) * 0.3,
      y: 1.5 + (Math.floor(i / 5) - 2) * 0.3,
      score: 0.5,
    })),
  ];
  const levels = [0.3, 0.35, 0.4, 0.45, 0.5];
  it("is one path per level inserted before the marks, and the ★ moves to its peak", async () => {
    const widget = await build();
    await widget.placeQuery([{ ...marker, scores, levels }]);
    const marks = widget.querySelector(".marks");
    const layer = widget.querySelector("svg.query-area");
    expect(layer).not.toBeNull();
    // Before the marks, so the points paint over it
    expect(
      layer.compareDocumentPosition(marks) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Outside vega-embed's box, which scrolls and so clipped an area reaching past the plot (#181)
    expect(marks.closest(".vega-embed-wrapper")).not.toBeNull();
    expect(layer.closest(".vega-embed-wrapper")).toBeNull();
    const paths = layer.querySelectorAll("path.query-level");
    expect(paths.length).toBeGreaterThan(1);
    expect(paths.length).toBeLessThanOrEqual(levels.length);
    expect(paths[0].getAttribute("d")).toMatch(/^M.*Z/);
    expect(paths[0].dataset.level).toBe("0.3");
    // Labels on 2–3 levels, as whole percents
    const texts = [...layer.querySelectorAll("text.query-level-label")].map(
      (t) => t.textContent,
    );
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.length).toBeLessThanOrEqual(3);
    expect(texts).toContain("30%");
    // The ★ sits on the peak (1.5, 1.5), not at the placement (2, 3)
    const [m] = widget.queryMarkers();
    expect(Math.hypot(m.x - 1.5, m.y - 1.5)).toBeLessThan(0.5);
    expect(
      widget.view.data("query").find((r) => r.kind === "marker"),
    ).toMatchObject({ x: m.x, y: m.y });
    // The legend's corner sees the lowest isoline
    const sx = widget.view.scale("x");
    const sy = widget.view.scale("y");
    const boxes = widget.queryAreaBoxes(sx, sy);
    expect(boxes).toHaveLength(1);
    expect(boxes[0][0]).toBeLessThan(sx(1.5));
    expect(boxes[0][2]).toBeGreaterThan(sx(1.5));
    // Replaced, then removed with []
    await widget.placeQuery([{ ...marker, scores, levels }]);
    expect(widget.querySelectorAll("svg.query-area path").length).toBe(
      paths.length,
    );
    await widget.placeQuery([]);
    expect(widget.querySelectorAll("svg.query-area path")).toHaveLength(0);
    expect(widget.querySelectorAll("svg.query-area text")).toHaveLength(0);
  });

  it("few similar papers visible: the whole terrain is faded", async () => {
    const widget = await build();
    await widget.placeQuery([{ ...marker, scores, levels, faint: true }]);
    const group = widget.querySelector("svg.query-area g");
    expect(group.hasAttribute("data-faint")).toBe(true);
  });

  it("without terrain, sits on the top match, never in empty space (#172 re-review)", async () => {
    const widget = await build();
    await widget.placeQuery([{ ...marker, scores: [], levels: [] }]);
    expect(widget.querySelectorAll("svg.query-area path")).toHaveLength(0);
    // nearest[0] = Paper A at (0, 0), not the weighted mean (2, 3)
    expect(widget.queryMarkers()[0]).toMatchObject({ x: 0, y: 0 });
  });

  it("moves its name off a topic label it would cross (#172 re-review)", async () => {
    // A topic label right above where the ★ lands (paper a at 0, 0 → bottom-left corner)
    const labels = [{ text: "Topic here", x: 0.6, y: 0.9 }];
    const widget = await build({ labels });
    await widget.placeQuery([{ ...marker, scores: [], levels: [] }]);
    const row = widget.view.data("query").find((r) => r.kind === "marker");
    // Not above the ★ (where the label is): below or beside it
    const sy = widget.view.scale("y");
    expect(sy(row.nameY)).toBeGreaterThanOrEqual(sy(row.y) - 1);
  });

  it("keeps its name on the map next to its edge (#181: only “Yo” showed)", async () => {
    // Paper C at (0, 10): the top-left corner, where above and left leave the map
    const widget = await build();
    await widget.placeQuery([
      { ...marker, scores: [], levels: [], nearest: [marker.nearest[1]] },
    ]);
    const row = widget.view.data("query").find((r) => r.kind === "marker");
    const sx = widget.view.scale("x");
    const sy = widget.view.scale("y");
    expect(sx(row.x)).toBeCloseTo(10);
    expect(sy(row.y)).toBeCloseTo(10);
    // Its box (about 62 × 13 px) inside the plot, which clips it
    expect(sy(row.nameY) - 6.5).toBeGreaterThanOrEqual(0);
    expect(sx(row.nameX) - 31).toBeGreaterThanOrEqual(0);
  });
});
