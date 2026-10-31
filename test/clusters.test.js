import { describe, expect, it } from "vitest";
import { clusterLabels } from "../src/lib/clusters.js";
import { applyFilters, filterAccessor } from "../src/lib/filters.js";
import {
  cullLabels,
  fitTopicLabel,
  topicLabelBox,
  wrapLabel,
  scatterSpec,
} from "../src/widgets/brushableScatterPlot.js";

const p = (id, cluster, x, y) => ({
  id,
  cluster,
  clusterLabel: cluster == null ? null : `Topic ${cluster}`,
  x,
  y,
});

describe("clusterLabels", () => {
  it("puts one label per cluster at the median of its papers, largest first", () => {
    const papers = [
      p("a", 1, 0, 0),
      p("b", 1, 2, 2),
      p("c", 1, 100, 1), // stray member: the median ignores it
      p("d", 0, 10, 10),
      p("e", 0, 12, 10),
      p("f", 0, 14, 10),
      p("g", 0, 16, 10),
      p("h", null, 5, 5),
    ];
    expect(clusterLabels(papers)).toEqual([
      { cluster: 0, text: "Topic 0", x: 13, y: 10, count: 4 },
      { cluster: 1, text: "Topic 1", x: 2, y: 1, count: 3 },
    ]);
  });

  it("skips clusters with fewer than minCount papers in view", () => {
    const papers = [p("a", 1, 0, 0), p("b", 1, 1, 1), p("c", 2, 5, 5)];
    expect(
      clusterLabels(papers, { minCount: 2 }).map((d) => d.cluster),
    ).toEqual([1]);
    expect(clusterLabels(papers, { minCount: 3 })).toEqual([]);
  });
});

describe("topics filter", () => {
  it("filters by cluster label; noise papers have no topic", () => {
    const papers = [p("a", 1, 0, 0), p("b", 2, 0, 0), p("c", null, 0, 0)];
    expect(
      applyFilters(papers, { topics: ["Topic 2"] }).map((d) => d.id),
    ).toEqual(["b"]);
    expect(filterAccessor("topics")(papers[2])).toEqual([]);
  });
});

describe("wrapLabel", () => {
  it("breaks topic labels after each comma, then at about 18 characters", () => {
    expect(wrapLabel("Topological, dimensionality reduction")).toEqual([
      "Topological,",
      "dimensionality",
      "reduction",
    ]);
    expect(wrapLabel("Graph, semantic, spatial")).toEqual([
      "Graph,",
      "semantic,",
      "spatial",
    ]);
    expect(wrapLabel("Uncertainty")).toEqual(["Uncertainty"]);
    expect(wrapLabel("Visual analytics for climate data")).toEqual([
      "Visual analytics",
      "for climate data",
    ]);
  });
});

describe("cullLabels", () => {
  const box = {
    width: 200,
    height: 100,
    xDomain: [0, 100],
    yDomain: [0, 100],
    padding: 0,
  };
  it("drops labels overlapping an earlier (larger) one", () => {
    const labels = [
      { text: "Big topic", x: 50, y: 50 },
      { text: "Overlaps", x: 52, y: 51 },
      { text: "Far away", x: 10, y: 90 },
    ];
    expect(cullLabels(labels, box).map((d) => d.text)).toEqual([
      "Big topic",
      "Far away",
    ]);
  });

  it("keeps labels that don't overlap", () => {
    const labels = [
      { text: "A", x: 10, y: 10 },
      { text: "B", x: 90, y: 90 },
    ];
    expect(cullLabels(labels, box)).toHaveLength(2);
  });
});

describe("fitTopicLabel", () => {
  const plot = { width: 300, height: 200 };
  const inside = ([x0, y0, x1, y1], margin = 4) =>
    x0 >= margin &&
    y0 >= margin &&
    x1 <= plot.width - margin &&
    y1 <= plot.height - margin;

  it("leaves a label well inside the plot where it is", () => {
    const fit = fitTopicLabel(150, 100, "Uncertainty", 15, plot);
    expect(fit.dx).toBe(0);
    expect(fit.dy).toBe(0);
    expect(fit.box).toEqual(topicLabelBox(150, 100, "Uncertainty", 15, 0));
  });

  it("shifts a multi-line label inward at the right and bottom edges", () => {
    // "Volume," / "rendering," / "neural": 3 lines
    const fit = fitTopicLabel(295, 195, "Volume, rendering, neural", 15, plot);
    expect(fit.dx).toBeLessThan(0);
    expect(fit.dy).toBeLessThan(0);
    expect(inside(fit.box)).toBe(true);
    // just inside: 4 px from the right and bottom edges
    expect(fit.box[2]).toBeCloseTo(plot.width - 4);
    expect(fit.box[3]).toBeCloseTo(plot.height - 4);
  });

  it("shifts inward at the left and top edges", () => {
    const fit = fitTopicLabel(
      2,
      3,
      "Topological, dimensionality reduction",
      13,
      plot,
    );
    expect(fit.dx).toBeGreaterThan(0);
    expect(fit.dy).toBeGreaterThan(0);
    expect(inside(fit.box)).toBe(true);
    expect(fit.box[0]).toBeCloseTo(4);
    expect(fit.box[1]).toBeCloseTo(4);
  });

  it("centers a label wider than the plot", () => {
    const fit = fitTopicLabel(10, 100, "Extraordinarilylongsingleword", 15, {
      width: 100,
      height: 200,
    });
    expect((fit.box[0] + fit.box[2]) / 2).toBeCloseTo(50);
  });

  it("honours a custom margin", () => {
    const fit = fitTopicLabel(295, 100, "Graphs", 15, { ...plot, margin: 10 });
    expect(fit.box[2]).toBeCloseTo(plot.width - 10);
  });
});

describe("cullLabels inside the plot", () => {
  it("returns each kept label with the pixel shift that keeps it inside", () => {
    const [edge, middle] = cullLabels(
      [
        { text: "Volume, rendering, neural", x: 100, y: 50 },
        { text: "Middle", x: 50, y: 50 },
      ],
      { width: 300, height: 200, xDomain: [0, 100], yDomain: [0, 100] },
    );
    expect(edge.dx).toBeLessThan(0);
    expect(edge.dy).toBe(0);
    expect(middle).toMatchObject({ text: "Middle", dx: 0, dy: 0 });
  });

  it("checks overlaps with the shifted boxes", () => {
    // Clear of the edge label where it was anchored, not where it is drawn (shifted inward)
    const kept = cullLabels(
      [
        { text: "Volume, rendering, neural", x: 100, y: 50 },
        { text: "Graphs", x: 70, y: 50 },
      ],
      { width: 300, height: 200, xDomain: [0, 100], yDomain: [0, 100] },
    );
    expect(kept.map((d) => d.text)).toEqual(["Volume, rendering, neural"]);
  });
});

describe("scatterSpec topic labels", () => {
  const data = [p("a", 0, 0, 0), p("b", 0, 10, 10)];
  it("draws labels as a halo + ink text layer above the points", () => {
    const spec = scatterSpec(data, {
      labels: [{ text: "Topic 0", x: 5, y: 5 }],
      width: 400,
      height: 300,
    });
    const texts = spec.layer.filter((l) => l.mark.type === "text");
    expect(texts).toHaveLength(2);
    const [halo, ink] = texts;
    expect(halo.data.values).toEqual([
      {
        text: "Topic 0",
        lines: ["Topic 0"],
        n: 1,
        x: 5,
        y: 5,
        __dx: 0,
        __dy: 0,
      },
    ]);
    // halo in the page background, ink in on-surface (jsdom: the fallbacks)
    expect(halo.mark.stroke).toBe("#fcf9f3");
    expect(ink.mark.fill).toBe("#241e1a");
    expect(ink.encoding.text.field).toBe("lines");
    // DESIGN.md: Newsreader medium; a block of n lines moves up by (n - 1) half lines
    expect(ink.mark.fontWeight).toBe(500);
    expect(ink.mark.dy.expr).toMatch(/datum.n - 1/);
    // shifted inside the plot near its edges (fitTopicLabel)
    expect(ink.mark.dy.expr).toMatch(/datum.__dy/);
    expect(ink.mark.dx.expr).toBe("datum.__dx");
    // points keep the selections
    expect(spec.layer[0].params.map((d) => d.name)).toEqual(["drag", "click"]);
    expect(spec.params.map((d) => d.name)).toContain("levelCut");
  });

  it("shifts a label at the plot's edge inward", () => {
    const spec = scatterSpec(data, {
      labels: [{ text: "Volume, rendering, neural", x: 10, y: 10 }],
      width: 400,
      height: 300,
    });
    const [halo] = spec.layer.filter((l) => l.mark.type === "text");
    expect(halo.data.values[0].__dx).toBeLessThan(0);
    expect(halo.data.values[0].__dy).toBeGreaterThan(0);
  });

  it("has no text layers without labels", () => {
    const spec = scatterSpec(data, {});
    expect(spec.layer).toBeUndefined();
  });
});
