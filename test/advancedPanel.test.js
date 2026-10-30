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
    expect(panel.value).toEqual({ projections: {}, clusters: null });
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
