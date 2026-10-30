// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { advancedPanel } from "../src/components/advancedPanel.js";

// 24 papers in two keyword groups, 4-d embeddings, one precomputed projection
const papers = Array.from({ length: 24 }, (_, i) => ({
  id: `p${i}`,
  keywords: i < 12 ? ["Uncertainty"] : ["LLM agents"],
}));
const embeddings = new Float32Array(
  papers.flatMap((_, i) => [i < 12 ? 0 : 10, i % 3, i % 5, 1]),
);
const grid = Object.fromEntries(
  papers.map((p, i) => [
    p.id,
    [(i < 12 ? 0 : 50) + (i % 4), Math.floor(i / 4) % 3],
  ]),
);

const make = () =>
  advancedPanel({
    papers,
    embeddings,
    dims: 4,
    projections: { umap: grid },
    currentProjection: () => "umap",
    format: (d) => d.toUpperCase(),
    clusterDefaults: { minClusterSize: 5, minSamples: 2 },
  });

describe("advancedPanel", () => {
  it("lists the precomputed projections with their quality metrics", async () => {
    const panel = make();
    document.body.append(panel);
    expect(panel.value).toEqual({
      projections: {},
      clusters: null,
      reliability: null,
    });
    await vi.waitFor(() =>
      expect(panel.querySelector("tbody td:nth-child(2)").textContent).not.toBe(
        "…",
      ),
    );
    const cells = [...panel.querySelectorAll("tbody td")].map(
      (td) => td.textContent,
    );
    expect(cells[0]).toBe("UMAP");
    expect(Number(cells[1])).toBeGreaterThan(0);
    expect(Number(cells[1])).toBeLessThanOrEqual(1);
    panel.remove();
  });

  it("re-clusters the map's projection and emits input with named clusters", () => {
    const panel = make();
    document.body.append(panel);
    const onInput = vi.fn();
    panel.addEventListener("input", onInput);
    [...panel.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Cluster")
      .click();
    expect(onInput).toHaveBeenCalledTimes(1);
    const { clusters } = panel.value;
    expect(clusters.on).toBe("umap");
    expect(clusters.count).toBe(2);
    expect(new Set(Object.values(clusters.byId))).toEqual(
      new Set(["Uncertainty", "LLM agents"]),
    );
    expect(panel.textContent).toContain("2 clusters on UMAP");
    panel.remove();
  });

  it("switches cluster parameters with the algorithm", () => {
    const panel = make();
    const select = [...panel.querySelectorAll("select")].find((s) =>
      s.querySelector('option[value="kmeans"]'),
    );
    expect(panel.textContent).toContain("Min. cluster size");
    select.value = "kmeans";
    select.dispatchEvent(new Event("change"));
    expect(panel.textContent).toContain("Clusters (k)");
    expect(panel.textContent).not.toContain("Min. cluster size");
  });
});

describe("advancedPanel value identity", () => {
  it("returns the same projections object until a projection is computed", () => {
    const panel = make();
    document.body.append(panel);
    const before = panel.value.projections;
    expect(panel.value.projections).toBe(before);
    [...panel.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Cluster")
      .click();
    expect(panel.value.projections).toBe(before);
    panel.remove();
  });

  it("credits DruidJS and its license", () => {
    const link = make().querySelector('a[href*="druidjs"]');
    expect(link).not.toBeNull();
    expect(link.closest("p").textContent).toContain("LGPL-3.0");
  });
});

describe("advancedPanel quality (#83)", () => {
  it("adds steadiness and cohesiveness and exposes per-point scores", async () => {
    const panel = make();
    document.body.append(panel);
    const onQuality = vi.fn();
    panel.addEventListener("quality", onQuality);
    expect(
      [...panel.querySelectorAll("thead th")].map(
        (th) => th.title || th.textContent,
      ),
    ).toEqual([
      "Projection",
      "Trustworthiness",
      "Continuity",
      "Steadiness",
      "Cohesiveness",
    ]);
    await vi.waitFor(() =>
      expect(
        [...panel.querySelectorAll("tbody td")].map((td) => td.textContent),
      ).not.toContain("…"),
    );
    expect(onQuality).toHaveBeenCalled();
    for (const metric of [
      "trustworthiness",
      "continuity",
      "steadiness",
      "cohesiveness",
    ]) {
      const local = panel.localScores("umap", metric);
      expect(local.k).toBe(10);
      expect(local.localScores).toHaveLength(papers.length);
    }
    expect(panel.localScores("tsne")).toBeUndefined();
    expect(panel.textContent).toContain("seed 42");
    panel.remove();
  });

  it("credits zadu-js and its license", () => {
    const link = make().querySelector('a[href*="zadu-js"]');
    expect(link.closest("p").textContent).toContain("MIT");
  });
});

describe("advancedPanel reliability (#84)", () => {
  const ready = async (panel) =>
    vi.waitFor(() =>
      expect(panel.value.reliability?.scores.umap).toBeDefined(),
    );

  it("hands per-paper scores to the page once measured, trustworthiness first", async () => {
    const panel = make();
    document.body.append(panel);
    await ready(panel);
    const { reliability } = panel.value;
    expect(reliability).toMatchObject({
      metric: "trustworthiness",
      k: 10,
      label: "Reliability (trustworthiness, k=10)",
      overlay: false,
    });
    expect(Object.keys(reliability.scores.umap)).toEqual(
      papers.map((p) => p.id),
    );
    expect(reliability.scores.umap.p0).toBe(
      panel.localScores("umap").localScores[0],
    );
    panel.remove();
  });

  it("switches metric and overlay, keeping score objects that didn't change", async () => {
    const panel = make();
    document.body.append(panel);
    await ready(panel);
    const before = panel.value.reliability;
    const onInput = vi.fn();
    panel.addEventListener("input", onInput);
    const select = [...panel.querySelectorAll("select")].find((s) =>
      s.querySelector('option[value="cohesiveness"]'),
    );
    select.value = "cohesiveness";
    select.dispatchEvent(new Event("change"));
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(panel.value.reliability.label).toBe(
      "Reliability (cohesiveness, k=10)",
    );
    expect(panel.value.reliability.scores.umap).not.toBe(before.scores.umap);
    const cohesive = panel.value.reliability.scores.umap;
    const toggle = panel.querySelector('input[type="checkbox"]');
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    expect(panel.value.reliability.overlay).toBe(true);
    expect(panel.value.reliability.scores.umap).toBe(cohesive);
    expect(onInput).toHaveBeenCalledTimes(2);
    panel.remove();
  });
});
