// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMiniMap,
  miniMapSize,
  miniMapSpec,
} from "../src/widgets/miniMap.js";
import { renderPaperDetail } from "../src/components/paperDetail.js";

const rows = [
  { id: "f", x: 10, y: 10, title: "Focus", cluster: 1, clusterLabel: "Maps" },
  { id: "n1", x: 11, y: 10, title: "N1", cluster: 1, clusterLabel: "Maps" },
  { id: "n2", x: 10, y: 12, title: "N2", cluster: 1, clusterLabel: "Maps" },
  { id: "n3", x: 9, y: 9, title: "N3", cluster: null },
  { id: "far", x: 40, y: 10, title: "Far", cluster: null },
];
const domain = { x: [7, 13], y: [8, 12] };

describe("miniMapSpec (#101)", () => {
  const views = [];
  afterEach(() => {
    while (views.length) views.pop().finalize();
  });
  async function render(spec) {
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
    return { view, warnings };
  }
  const spec = () =>
    miniMapSpec(rows, {
      focusId: "f",
      relatedIds: ["n1", "far"],
      labels: [{ text: "Maps", x: 10.5, y: 10.5 }],
      domain,
      width: 300,
      height: 200,
    });

  it("compiles and renders without warnings, the zoom set by the xd / yd params", async () => {
    const { view, warnings } = await render(spec());
    expect(warnings).toEqual([]);
    expect(view.scale("x").domain()).toEqual(domain.x);
    expect(view.scale("y").domain()).toEqual(domain.y);
    // the paper at the center of the chart
    expect(view.scale("x")(10)).toBeCloseTo(150);
    expect(view.scale("y")(10)).toBeCloseTo(100);
    await view.signal("xd", [0, 20]).runAsync();
    expect(view.scale("x").domain()).toEqual([0, 20]);
  });
  it("draws the related papers darker than the rest", () => {
    const s = spec();
    const values = s.data.values;
    expect(values.find((d) => d.id === "n1").r).toBe(1);
    expect(values.find((d) => d.id === "n2").r).toBe(0);
    // the paper is on its own layer, related papers above the others
    expect(values.some((d) => d.id === "f")).toBe(false);
    expect(values.at(-1).r).toBe(1);
  });
  it("shows the line and ring only for the highlighted paper", async () => {
    const { view, warnings } = await render(spec());
    const ruleItems = () =>
      view
        .scenegraph()
        .root.items[0].items.filter((g) => g.marktype === "rule")[0]?.items ??
      [];
    expect(ruleItems()).toHaveLength(0);
    await view.signal("hoverId", "far").runAsync();
    expect(ruleItems()).toHaveLength(1);
    expect(warnings).toEqual([]);
  });
});

describe("miniMapSize", () => {
  it("is about 300×200 in the panel and the full width on phones", () => {
    expect(miniMapSize(528)).toEqual({ width: 320, height: 213 });
    expect(miniMapSize(360, { phone: true })).toEqual({
      width: 360,
      height: 240,
    });
  });
});

describe("createMiniMap (#101)", () => {
  it("is null when the paper isn't on the map", () => {
    expect(createMiniMap({ rows, focusId: "zz" })).toBeNull();
  });
  it("labels itself with the neighbourhood summary", () => {
    // 15 papers around the focus: "far" is outside its neighbourhood
    const crowd = Array.from({ length: 15 }, (_, i) => ({
      id: `c${i}`,
      x: 10 + Math.cos(i) * 2,
      y: 10 + Math.sin(i) * 2,
    }));
    const el = createMiniMap({
      rows: [...rows, ...crowd],
      focusId: "f",
      title: "Focus",
      relatedIds: ["n1", "far"],
    });
    expect(el.getAttribute("aria-label")).toBe(
      "Map neighbourhood of “Focus”: 1 related paper nearby, 1 far on the map",
    );
    el.dispose();
  });
});

describe("createMiniMap highlight and click (#101)", () => {
  const crowd = Array.from({ length: 15 }, (_, i) => ({
    id: `c${i}`,
    x: 10 + Math.cos(i) * 2,
    y: 10 + Math.sin(i) * 2,
    title: `C${i}`,
  }));
  const make = (options = {}) => {
    const el = createMiniMap({
      rows: [...rows, ...crowd],
      focusId: "f",
      title: "Focus",
      relatedIds: ["n1", "far"],
      renderer: "none",
      ...options,
    });
    document.body.append(el);
    return el;
  };
  const inside = (view, [x, y]) => {
    const [x0, x1] = view.scale("x").domain();
    const [y0, y1] = view.scale("y").domain();
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  };

  it("zooms out to include a far related paper, and back when the highlight leaves", async () => {
    const el = make({ animation: () => ({ enabled: false }) });
    const view = await el.ready;
    const base = view.scale("x").domain();
    expect(inside(view, [40, 10])).toBe(false);
    el.highlight("far");
    await view.runAsync();
    expect(view.signal("hoverId")).toBe("far");
    expect(inside(view, [40, 10])).toBe(true);
    // the paper stays at the center
    const [x0, x1] = view.scale("x").domain();
    expect((x0 + x1) / 2).toBeCloseTo(10);
    // reduced motion: no pulse
    expect(view.signal("pulse")).toBe(1);
    el.highlight(null);
    await view.runAsync();
    expect(view.signal("hoverId")).toBeNull();
    expect(view.scale("x").domain()).toEqual(base);
    el.dispose();
    el.remove();
  });
  it("tweens the zoom when map animation is on", async () => {
    const el = make({ animation: () => ({ enabled: true, speed: "fast" }) });
    const view = await el.ready;
    el.highlight("far");
    await view.runAsync();
    // first frame: not there yet
    expect(inside(view, [40, 10])).toBe(false);
    await new Promise((r) => setTimeout(r, 800));
    await view.runAsync();
    expect(inside(view, [40, 10])).toBe(true);
    expect(view.signal("pulse")).toBe(1);
    el.dispose();
    el.remove();
  });
  it("opens the paper nearest a click, never the focus itself", async () => {
    const onOpen = vi.fn();
    const el = make({ onOpen, animation: () => ({ enabled: false }) });
    const view = await el.ready;
    const plot = el.querySelector(".mini-map-plot");
    const at = (x, y) =>
      plot.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          clientX: view.scale("x")(x) + 3,
          clientY: view.scale("y")(y) - 2,
        }),
      );
    at(11, 10);
    expect(onOpen).toHaveBeenCalledWith("n1");
    onOpen.mockClear();
    at(10, 10);
    expect(onOpen).not.toHaveBeenCalled();
    el.dispose();
    el.remove();
  });
});

describe("renderPaperDetail with a mini-map (#101)", () => {
  const paper = { id: "f", title: "Focus", authors: [] };
  const related = [
    { id: "n1", title: "N1", score: 0.8 },
    { id: "far", title: "Far", score: 0.7 },
  ];
  const fakeMini = () => {
    const el = document.createElement("div");
    el.className = "fake-mini";
    el.highlight = vi.fn();
    el.dispose = vi.fn();
    return el;
  };
  const render = (options = {}) =>
    renderPaperDetail(paper, {
      tz: "US/Eastern",
      related,
      inMyPapers: () => false,
      onToggle: () => {},
      onOpen: () => {},
      onClose: () => {},
      ...options,
    });

  it("puts the mini-map above the related papers, with the link to map reliability", () => {
    let mini;
    const el = render({ miniMap: () => ((mini = fakeMini()), mini) });
    const section = el.querySelector(".related-section");
    expect(section.querySelector(".fake-mini")).toBe(mini);
    expect(
      section
        .querySelector(".fake-mini")
        .compareDocumentPosition(section.querySelector(".related-papers")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(section.querySelector(".mini-map-note a").getAttribute("href")).toBe(
      "about.html#map-reliability",
    );
  });
  it("hover and keyboard focus on a related paper drive the highlight; leaving resets", () => {
    let mini;
    const el = render({ miniMap: () => ((mini = fakeMini()), mini) });
    document.body.append(el);
    const rowsEls = el.querySelectorAll(".related-paper");
    rowsEls[1].dispatchEvent(new Event("pointerenter"));
    expect(mini.highlight).toHaveBeenLastCalledWith("far");
    rowsEls[1].dispatchEvent(new Event("pointerleave"));
    expect(mini.highlight).toHaveBeenLastCalledWith(null);
    rowsEls[0].querySelector(".related-open").focus();
    expect(mini.highlight).toHaveBeenLastCalledWith("n1");
    // focus moving within the row (to its toggle) keeps it
    rowsEls[0].querySelector(".follow-toggle").focus();
    expect(mini.highlight).toHaveBeenLastCalledWith("n1");
    rowsEls[0].querySelector(".follow-toggle").blur();
    expect(mini.highlight).toHaveBeenLastCalledWith(null);
    // from the page (My Papers' recommended rows)
    el.highlight("n1");
    expect(mini.highlight).toHaveBeenLastCalledWith("n1");
    el.dispose();
    expect(mini.dispose).toHaveBeenCalled();
    el.remove();
  });
  it("waits for related papers that load later, and skips the mini-map once closed", async () => {
    const factory = vi.fn(fakeMini);
    let resolve;
    const el = render({
      related: new Promise((r) => (resolve = r)),
      miniMap: factory,
    });
    el.dispose();
    resolve(related);
    await Promise.resolve();
    await Promise.resolve();
    expect(factory).not.toHaveBeenCalled();
  });
});
