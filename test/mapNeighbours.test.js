// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  BrushableScatterPlot,
  neighbourRows,
  scatterSpec,
} from "../src/widgets/brushableScatterPlot.js";

// Map positions; "similarity" is a made-up table so that c is a missing neighbour of a
const data = [
  { id: "a", x: 0, y: 0 },
  { id: "b", x: 1, y: 0 },
  { id: "x", x: 0, y: 1 },
  { id: "c", x: 10, y: 10 },
  { id: "d", x: 9, y: 10 },
  // Fillers, so c's map rank (10) is beyond the reach max(3k, 10%) = 6 at k = 2
  ...[
    [6, 0],
    [0, 6],
    [6, 1],
    [1, 6],
    [7, 2],
    [2, 7],
  ].map(([x, y], i) => ({ id: `f${i}`, x, y })),
];
const table = {
  a: [
    ["c", 0.9],
    ["b", 0.8],
  ],
  b: [
    ["a", 0.8],
    ["x", 0.3],
  ],
  c: [
    ["d", 0.95],
    ["a", 0.9],
  ],
};
const similar = (id, k) =>
  (table[id] ?? []).slice(0, k).map(([n, s]) => ({ id: n, similarity: s }));

const widgets = [];
async function build(options = {}) {
  const widget = await BrushableScatterPlot(data, {
    renderer: "svg",
    width: 200,
    height: 200,
    neighbours: { similar, k: 2, enabled: true, ...options },
  });
  document.body.append(widget);
  widgets.push(widget);
  return widget;
}
afterEach(() => {
  while (widgets.length) widgets.pop().remove();
});

/** Client coordinates of a data point. */
function screen(widget, d) {
  const view = widget.view;
  const [ox, oy] = view.origin();
  const rect = widget.querySelector("svg").getBoundingClientRect();
  return [
    rect.left + ox + view.scale("x")(d.x),
    rect.top + oy + view.scale("y")(d.y),
  ];
}
const PointerEventClass = globalThis.PointerEvent ?? MouseEvent;
function pointer(el, type, [clientX, clientY], extra = {}) {
  const event = new PointerEventClass(type, {
    bubbles: true,
    clientX,
    clientY,
    ...extra,
  });
  if (!("pointerType" in event) || extra.pointerType)
    Object.defineProperty(event, "pointerType", {
      value: extra.pointerType ?? "mouse",
    });
  el.dispatchEvent(event);
}
const nextFrame = () => new Promise((r) => setTimeout(r, 40));
const kinds = (widget) =>
  widget.view
    .data("nn")
    .map((d) => d.kind)
    .sort();

describe("scatterSpec with neighbours (#102)", () => {
  it("adds the nn dataset, the nnIds param and non-interactive layers", () => {
    const spec = scatterSpec(data, { neighbours: true });
    expect(spec.datasets).toEqual({ nn: [] });
    expect(spec.params.map((p) => p.name)).toContain("nnIds");
    const nnLayers = spec.layer.filter((l) => l.data?.name === "nn");
    expect(nnLayers.map((l) => l.mark.type)).toEqual([
      "rule",
      "point",
      "point",
      "text",
      "text",
    ]);
    expect(nnLayers.every((l) => l.mark.interactive === false)).toBe(true);
    // Missing neighbours are dashed: not color alone
    expect(nnLayers[0].encoding.strokeDash.condition.value).toEqual([4, 3]);
  });

  it("dims points outside the paper and its neighbours", () => {
    const spec = scatterSpec(data, { neighbours: true });
    const test = spec.layer.find((l) => l.params).encoding.color.condition.test;
    expect(JSON.stringify(test)).toContain("indexof(nnIds");
  });

  it("is absent without neighbours", () => {
    const spec = scatterSpec(data, {});
    expect(spec.datasets).toBeUndefined();
    expect(JSON.stringify(spec)).not.toContain("nnIds");
  });
});

describe("neighbourRows", () => {
  it("one row for the paper, each neighbour (labelled) and each false neighbour", () => {
    const at = new Map(data.map((d) => [d.id, [d.x, d.y]]));
    const rows = neighbourRows(
      "a",
      {
        neighbours: [
          { id: "b", similarity: 0.8, missing: false },
          { id: "c", similarity: 0.904, missing: true },
        ],
        falseNeighbours: ["x"],
      },
      (id) => at.get(id),
    );
    expect(rows).toEqual([
      { kind: "focus", fx: 0, fy: 0, nx: 0, ny: 0, label: null },
      { kind: "preserved", fx: 0, fy: 0, nx: 1, ny: 0, label: "80%" },
      { kind: "missing", fx: 0, fy: 0, nx: 10, ny: 10, label: "90%" },
      { kind: "false", fx: 0, fy: 0, nx: 0, ny: 1, label: null },
    ]);
  });
});

describe("BrushableScatterPlot neighbours (#102)", () => {
  it("pins and unpins, classifying missing and false neighbours", async () => {
    const widget = await build();
    const events = [];
    widget.addEventListener("neighbours", (e) => events.push(e.detail));
    await widget.pinNeighbours("a");
    // a's true neighbours: c (far: missing) and b (close); x is close but not similar (false)
    expect(kinds(widget)).toEqual(["false", "focus", "missing", "preserved"]);
    expect(widget.view.signal("nnIds")).toEqual(["a", "c", "b"]);
    expect(widget.neighbours).toMatchObject({
      pinned: "a",
      reach: 6,
      neighbours: [
        { id: "c", missing: true, mapRank: 10 },
        { id: "b", missing: false, mapRank: 1 },
      ],
      falseNeighbours: ["x"],
    });
    expect(events.at(-1)).toMatchObject({ action: "pin", pinned: "a" });
    await widget.unpinNeighbours();
    expect(widget.view.data("nn")).toEqual([]);
    expect(widget.view.signal("nnIds")).toEqual([]);
    expect(events.at(-1)).toMatchObject({ action: "unpin", pinned: null });
  });

  it("never emits input (the selection doesn't change)", async () => {
    const widget = await build();
    let fired = 0;
    widget.addEventListener("input", () => fired++);
    await widget.pinNeighbours("a");
    await nextFrame();
    expect(fired).toBe(0);
  });

  it("hover previews near a point, leaving clears it", async () => {
    const widget = await build();
    pointer(widget, "pointermove", screen(widget, data[1]));
    await nextFrame();
    expect(widget.view.signal("nnIds")).toEqual(["b", "a", "x"]);
    pointer(widget, "pointerleave", [0, 0]);
    await nextFrame();
    expect(widget.view.signal("nnIds")).toEqual([]);
  });

  it("no hover preview when turned off, but a click still pins", async () => {
    const widget = await build({ enabled: false });
    pointer(widget, "pointermove", screen(widget, data[1]));
    await nextFrame();
    expect(widget.view.signal("nnIds")).toEqual([]);
    const at = screen(widget, data[0]);
    pointer(widget, "pointerdown", at);
    pointer(widget, "click", at);
    await nextFrame();
    expect(widget.neighbours.pinned).toBe("a");
  });

  it("a pin outlives hovering elsewhere; a click on empty space unpins", async () => {
    const widget = await build();
    await widget.pinNeighbours("a");
    pointer(widget, "pointermove", screen(widget, data[4]));
    await nextFrame();
    expect(widget.view.signal("nnIds")[0]).toBe("a");
    const [cx, cy] = screen(widget, data[0]);
    const empty = [cx + 60, cy - 60];
    pointer(widget, "pointerdown", empty);
    pointer(widget, "click", empty);
    await nextFrame();
    expect(widget.neighbours.pinned).toBeNull();
  });

  it("a drag (brushing) is not a click", async () => {
    const widget = await build();
    await widget.pinNeighbours("a");
    const [cx, cy] = screen(widget, data[0]);
    pointer(widget, "pointerdown", [cx + 60, cy - 60]);
    pointer(widget, "click", [cx + 90, cy - 90]);
    expect(widget.neighbours.pinned).toBe("a");
  });

  it("k and the toggle change live", async () => {
    const widget = await build();
    await widget.pinNeighbours("c");
    expect(widget.view.signal("nnIds")).toEqual(["c", "d", "a"]);
    await widget.neighbourSettings({ k: 1 });
    expect(widget.view.signal("nnIds")).toEqual(["c", "d"]);
  });

  it("keeps a pin across redraws (the `pinned` option), dropping one that's gone", async () => {
    const widget = await build({ pinned: "c" });
    await widget.neighboursReady;
    expect(widget.neighbours.pinned).toBe("c");
    expect(widget.view.signal("nnIds")).toEqual(["c", "d", "a"]);
    const other = await build({ pinned: "gone" });
    expect(other.neighbours.pinned).toBeNull();
  });

  it("previewNeighbours (keyboard focus on a row) shows and clears", async () => {
    const widget = await build();
    await widget.previewNeighbours("b");
    expect(widget.view.signal("nnIds")[0]).toBe("b");
    await widget.previewNeighbours(null);
    expect(widget.view.signal("nnIds")).toEqual([]);
  });
});

// #112: the empty `nn` dataset must not feed the shared x/y domains (Vega warned
// "Infinite extent for field fx/nx/…" on every render with no neighbours shown)
describe("neighbour layers and the shared scales (#112)", () => {
  const views = [];
  afterEach(() => {
    while (views.length) views.pop().finalize();
  });
  async function render(spec, nn = []) {
    const vega = await import("vega");
    const { compile } = await import("vega-lite");
    const warnings = [];
    const base = vega.logger(vega.Warn);
    const logger = Object.assign(Object.create(base), {
      warn: (...args) => {
        warnings.push(args.join(" "));
        return logger;
      },
    });
    const view = new vega.View(vega.parse(compile(spec).spec), {
      renderer: "none",
      logger,
    });
    views.push(view);
    await view.runAsync();
    if (nn.length) {
      view.change(
        "nn",
        view
          .changeset()
          .remove(() => true)
          .insert(nn),
      );
      await view.runAsync();
    }
    return { view, warnings };
  }
  const position = (key) => {
    const d = data.find((p) => p.id === key);
    return [d.x, d.y];
  };
  const pinnedRows = neighbourRows(
    "a",
    {
      neighbours: [
        { id: "c", similarity: 0.9, missing: true },
        { id: "b", similarity: 0.8, missing: false },
      ],
      falseNeighbours: ["x"],
    },
    position,
  );
  const size = { width: 200, height: 200 };

  it("renders without warnings when no paper is pinned", async () => {
    const { warnings } = await render(
      scatterSpec(data, { ...size, neighbours: true }),
    );
    expect(warnings).toEqual([]);
  });

  it("keeps the points' extent as the domain, with or without a pin", async () => {
    const spec = scatterSpec(data, { ...size, neighbours: true });
    const empty = await render(spec);
    const pinned = await render(spec, pinnedRows);
    const plain = await render(scatterSpec(data, size));
    for (const r of [empty, pinned]) {
      expect(r.view.scale("x").domain()).toEqual(
        plain.view.scale("x").domain(),
      );
      expect(r.view.scale("y").domain()).toEqual(
        plain.view.scale("y").domain(),
      );
    }
    expect(pinned.warnings).toEqual([]);
    // The pinned paper's neighbour labels are drawn
    const svg = await pinned.view.toSVG();
    expect(svg).toContain(">90%<");
    expect(svg).toContain(">80%<");
  });

  it("renders without warnings through a motion (#82 tween)", async () => {
    const { planTransition } =
      await import("../src/widgets/scatterTransition.js");
    const moved = data.map((d) => ({ ...d, x: d.x * 2, y: d.y + 1 }));
    const from = {
      positions: new Map(data.map((d) => [d.id, [d.x, d.y]])),
      rows: new Map(data.map((d) => [d.id, d])),
      xDomain: [0, 10],
      yDomain: [0, 10],
      labels: [],
    };
    const transition = planTransition(moved, from, { duration: 500 });
    expect(transition).not.toBeNull();
    const { view, warnings } = await render(
      scatterSpec(moved, { ...size, neighbours: true, transition }),
    );
    view.signal("tm", transition.total / 2);
    await view.runAsync();
    view.signal("tm", transition.total);
    await view.runAsync();
    expect(warnings).toEqual([]);
    expect(view.scale("x").domain()[1]).toBeGreaterThan(19);
  });
});
