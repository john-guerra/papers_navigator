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
  it("a halo sized from the spread, lines to the nearest papers, the marker last", () => {
    const rows = queryRows([marker], { pixelsPerUnit: 10 });
    expect(rows.map((r) => r.kind)).toEqual(["halo", "line", "line", "marker"]);
    // Radius 2 units × 10 px = 20 px: symbol area (2r)²
    expect(rows[0]).toMatchObject({ x: 2, y: 3, size: 1600 });
    expect(rows[1]).toMatchObject({ x: 2, y: 3, x2: 0, y2: 0, m: 0 });
    expect(rows[3]).toMatchObject({ label: "★ Your search", m: 0 });
  });

  it("caps the halo, and leaves out one the diamond covers", () => {
    expect(
      queryRows([marker], { pixelsPerUnit: 100, maxRadius: 50 })[0].size,
    ).toBe(10000);
    expect(
      queryRows([marker], { pixelsPerUnit: 2 }).some((r) => r.kind === "halo"),
    ).toBe(false);
  });

  it("numbers markers by index", () => {
    const rows = queryRows([marker, { ...marker, label: "★ My research 2" }]);
    expect(rows.filter((r) => r.kind === "marker").map((r) => r.m)).toEqual([
      0, 1,
    ]);
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
    const rows = queryRows([{ ...marker, faint: true }], { pixelsPerUnit: 10 });
    expect(
      rows.filter((r) => r.kind !== "line").every((r) => r.faint === true),
    ).toBe(true);
    const spec = scatterSpec(data, { width: 200, height: 200, query: true });
    const diamond = spec.layer.find((l) => l.mark.shape === "diamond");
    expect(diamond.encoding.opacity).toEqual({
      condition: { test: "datum.faint", value: 0.4 },
      value: 1,
    });
    expect(diamond.mark.opacity).toBeUndefined();
  });

  it("is drawn at lower opacity", async () => {
    const widget = await build();
    await widget.placeQuery([{ ...marker, faint: true }]);
    const svg = widget.querySelector("svg").innerHTML;
    expect(svg).toMatch(/opacity="0.4"/);
  });
});

describe("scatterSpec with a query layer", () => {
  it("adds the empty `query` dataset, the hover param and its layers on top", () => {
    const spec = scatterSpec(data, { width: 200, height: 200, query: true });
    expect(spec.datasets).toEqual({ query: [] });
    expect(spec.params.map((p) => p.name)).toContain("queryHover");
    const last = spec.layer.at(-1);
    expect(last.data).toEqual({ name: "query" });
    expect(last.mark.type).toBe("text");
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
  const rect = widget.querySelector("svg").getBoundingClientRect();
  return [
    rect.left + ox + view.scale("x")(d.x),
    rect.top + oy + view.scale("y")(d.y),
  ];
}

describe("BrushableScatterPlot query marker (#100)", () => {
  it("is hidden until placed, then drawn without a redraw, and hidden again with []", async () => {
    const widget = await build();
    const svgBefore = widget.querySelector("svg");
    expect(widget.view.data("query")).toEqual([]);
    await widget.placeQuery([marker]);
    expect(widget.view.data("query").map((r) => r.kind)).toContain("marker");
    expect(widget.querySelector("svg")).toBe(svgBefore);
    expect(widget.querySelector("svg").textContent).toContain("★ Your search");
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
    const [cx, cy] = screen(widget, marker);
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
    move(screen(widget, marker));
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
