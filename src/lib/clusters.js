/**
 * Topic clusters (pipeline/clusters.py writes `cluster` / `clusterLabel` per paper).
 * Pure helpers for the map's topic labels.
 */

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * One label per cluster among `papers` (already positioned by the current projection):
 * `{cluster, text, x, y, count}` at the median of its papers (robust to a stray member far
 * away, e.g. on t-SNE/PCA), largest first. Clusters with fewer than `minCount` papers in
 * view, and noise (null cluster), get no label.
 */
export function clusterLabels(papers, { x = "x", y = "y", minCount = 3 } = {}) {
  const groups = new Map();
  for (const p of papers) {
    if (p.cluster == null || !p.clusterLabel) continue;
    if (!groups.has(p.cluster))
      groups.set(p.cluster, { text: p.clusterLabel, xs: [], ys: [] });
    const group = groups.get(p.cluster);
    group.xs.push(p[x]);
    group.ys.push(p[y]);
  }
  return [...groups]
    .filter(([, g]) => g.xs.length >= minCount)
    .map(([cluster, g]) => ({
      cluster,
      text: g.text,
      x: median(g.xs),
      y: median(g.ys),
      count: g.xs.length,
    }))
    .sort((a, b) => b.count - a.count || a.cluster - b.cluster);
}
