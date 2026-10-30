import { describe, expect, it } from "vitest";
import { clusterLabels } from "../src/lib/clusters.js";
import { applyFilters, filterAccessor } from "../src/lib/filters.js";
import {
  cullLabels,
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
      { text: "Topic 0", lines: ["Topic 0"], n: 1, x: 5, y: 5 },
    ]);
    // halo in the page background, ink in on-surface (jsdom: the fallbacks)
    expect(halo.mark.stroke).toBe("#fcf9f3");
    expect(ink.mark.fill).toBe("#241e1a");
    expect(ink.encoding.text.field).toBe("lines");
    // DESIGN.md: Newsreader medium; a block of n lines moves up by (n - 1) half lines
    expect(ink.mark.fontWeight).toBe(500);
    expect(ink.mark.dy.expr).toMatch(/datum.n - 1/);
    // points keep the selections
    expect(spec.layer[0].params.map((d) => d.name)).toEqual(["drag", "click"]);
    expect(spec.params.map((d) => d.name)).toContain("levelCut");
  });

  it("has no text layers without labels", () => {
    const spec = scatterSpec(data, {});
    expect(spec.layer).toBeUndefined();
  });
});
