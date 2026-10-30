// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { BrushableScatterPlot } from "../src/widgets/brushableScatterPlot.js";
import { legendBoxes } from "../src/widgets/paperLabels.js";

// Unlabelled frame points (they take room but get no label), four roomy labelled points, and a
// crowd of nine in a 1-unit square whose middle one has a tiny Voronoi cell
const frame = [
  [0, 0],
  [100, 0],
  [0, 100],
  [100, 100],
].map(([x, y], i) => ({ id: `f${i}`, x, y, score: 0 }));
const crowd = [-0.5, 0, 0.5].flatMap((dx) =>
  [-0.5, 0, 0.5].map((dy) => ({
    id: `m${dx}:${dy}`,
    x: 50 + dx,
    y: 50 + dy,
    shortLabel: dx === 0 && dy === 0 ? "Centre" : "Crowd",
    score: 0.1,
  })),
);
const data = [
  ...frame,
  { id: "a", x: 20, y: 20, shortLabel: "Alpha", score: 0.9, kind: "A" },
  { id: "b", x: 80, y: 20, shortLabel: "Beta", score: 0.2 },
  { id: "c", x: 20, y: 80, shortLabel: "Gamma", score: 0.8 },
  { id: "d", x: 80, y: 80, shortLabel: "Delta", score: 0.3 },
  ...crowd,
];
const roomy = ["Alpha", "Beta", "Delta", "Gamma"];

const make = async (options = {}) => {
  const widget = await BrushableScatterPlot(data, {
    renderer: "svg",
    width: 400,
    height: 400,
    paperLabels: { enabled: true },
    ...options,
  });
  document.body.append(widget);
  return widget;
};
const drawn = (widget) =>
  [...widget.querySelectorAll("svg.paper-labels g.labels > text")]
    .filter((t) => t.getAttribute("display") !== "none")
    .map((t) => t.textContent)
    .sort();

afterEach(() => document.body.replaceChildren());

describe("paper labels overlay (#99)", () => {
  it("draws shortLabels where there is room, in an overlay that never takes the pointer", async () => {
    const widget = await make();
    widget.paperLabels.render();
    const svg = widget.querySelector("svg.paper-labels");
    expect(svg.style.pointerEvents).toBe("none");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    // Same parent as Vega's surface, so it scrolls and sizes with it
    expect(svg.parentElement).toBe(
      widget.querySelector(".marks").parentElement,
    );
    for (const name of roomy) expect(drawn(widget)).toContain(name);
    // No room in the middle of the crowd, and unlabelled points get nothing
    expect(drawn(widget)).not.toContain("Centre");
    expect(drawn(widget)).not.toContain("");
    expect(widget.paperLabels.shown()).toEqual(
      expect.arrayContaining(["a", "b", "c", "d"]),
    );
  });

  it("places labels at the points' pixels (view scales + origin, like pointAt)", async () => {
    const widget = await make();
    widget.paperLabels.render();
    const view = widget.view;
    const [ox, oy] = view.origin();
    const text = [...widget.querySelectorAll("svg.paper-labels text")].find(
      (t) => t.textContent === "Alpha",
    );
    expect(text.getAttribute("transform")).toBe(
      `translate(${ox + view.scale("x")(20)}, ${oy + view.scale("y")(20)})`,
    );
  });

  it("always shows emphasized papers, even in a crowded spot", async () => {
    const widget = await make({
      paperLabels: { enabled: true, emphasis: ["m0:0"] },
    });
    widget.paperLabels.render();
    expect(drawn(widget)).toContain("Centre");
  });

  it("labels only papers drawn in color: above the relevance cut", async () => {
    const widget = await make();
    await widget.view.signal("levelCut", 0.5).runAsync();
    widget.paperLabels.render();
    expect(drawn(widget)).toEqual(["Alpha", "Gamma"]);
  });

  it("turns off and on without redrawing the map", async () => {
    const widget = await make();
    widget.paperLabels.render();
    widget.paperLabels.update({ enabled: false });
    expect(drawn(widget)).toEqual([]);
    widget.paperLabels.update({ enabled: true });
    widget.paperLabels.render();
    for (const name of roomy) expect(drawn(widget)).toContain(name);
  });

  it("never draws over a topic label", async () => {
    const widget = await make({
      labels: [{ text: "A very long topic label", x: 20, y: 20 }],
    });
    widget.paperLabels.render();
    expect(drawn(widget)).not.toContain("Alpha");
    expect(drawn(widget)).toContain("Delta");
  });

  it("stays hidden mid-motion", async () => {
    const before = await make();
    const after = await BrushableScatterPlot(
      data.map((d) => ({ ...d, x: 100 - d.x })),
      {
        renderer: "svg",
        width: 400,
        height: 400,
        paperLabels: { enabled: true },
        from: before,
        animate: { duration: 10000 },
      },
    );
    document.body.append(after);
    after.paperLabels.render();
    expect(drawn(after)).toEqual([]);
    after.stop();
  });

  it("no overlay without the option", async () => {
    const widget = await make({ paperLabels: null });
    expect(widget.paperLabels).toBeUndefined();
    expect(widget.querySelector("svg.paper-labels")).toBeNull();
  });
});

describe("legendBoxes", () => {
  it("finds the legend in the scenegraph, in canvas pixels (top-right corner)", async () => {
    const widget = await make({ color: "kind", paperLabels: null });
    const boxes = legendBoxes(widget.view);
    expect(boxes.length).toBe(1);
    const [x0, y0, x1, y1] = boxes[0];
    expect(x1).toBeGreaterThan(x0);
    expect(y1).toBeGreaterThan(y0);
    expect(x0).toBeGreaterThan(200);
    expect(y0).toBeLessThan(100);
  });

  it("none without a legend", async () => {
    const widget = await make({ paperLabels: null });
    expect(legendBoxes(widget.view)).toEqual([]);
  });
});
