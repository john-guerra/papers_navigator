/**
 * Where the map can be trusted (#84): per-paper reliability (a local quality score from the
 * Advanced panel, #83) for "Color by: Reliability", and a smoothed grid of it for the
 * distortion overlay. Pure; no DOM.
 */

/** Legend title, e.g. "Reliability (trustworthiness, k=10)". */
export function reliabilityLabel(metric, k) {
  return `Reliability (${metric}, k=${k})`;
}

/** `{id: score}` from per-point scores (row i ↔ papers[i]). */
export function scoresById(papers, localScores) {
  return Object.fromEntries(papers.map((p, i) => [p.id, localScores[i]]));
}

/**
 * Color/overlay domain of a projection's scores: [5th percentile, max], so a few outliers
 * don't wash out the ramp (values below are clamped to the "least reliable" end).
 */
export function reliabilityDomain(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return [0, 1];
  const lo = sorted[Math.floor(0.05 * (sorted.length - 1))];
  const hi = sorted[sorted.length - 1];
  return lo < hi ? [lo, hi] : [hi - 1e-6, hi];
}

/**
 * Distortion overlay domain: [5th percentile, lower quartile], so only areas where papers are
 * among the least reliable quarter get shaded (above it: distortion 0), darkest at the worst.
 */
export function overlayDomain(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return [0, 1];
  const lo = sorted[Math.floor(0.05 * (sorted.length - 1))];
  const mid = sorted[Math.floor(0.25 * (sorted.length - 1))];
  return lo < mid ? [lo, mid] : [mid - 1e-6, mid];
}

/**
 * Whether the page must redraw for a new reliability value: only when what the current map
 * shows changed (metric, k, overlay, or the current projection's scores, compared by
 * identity: the panel keeps the same object until they change).
 */
export function reliabilityChanged(prev, next, projection) {
  if (!prev || !next) return prev !== next;
  return (
    prev.metric !== next.metric ||
    prev.k !== next.k ||
    prev.overlay !== next.overlay ||
    prev.scores[projection] !== next.scores[projection]
  );
}

/**
 * Distortion overlay grid: the map (`width` × `height` pixels showing `xDomain` × `yDomain`)
 * cut into `cell`-pixel squares; each cell's `value` is the Gaussian-kernel-weighted average
 * (bandwidth in pixels) of the points' scores (Nadaraya–Watson), and `distortion` is how far
 * below the top of `domain` it lies, 0 (reliable) … 1 (least reliable). Cells far from every
 * point (total kernel weight < `minWeight`) are left out, so empty areas stay blank.
 * `points`: [{x, y, value}] in data units. Cells: {x, x2, y, y2, value, distortion}, data units.
 */
export function reliabilityGrid(
  points,
  {
    width,
    height,
    xDomain,
    yDomain,
    domain = reliabilityDomain(points.map((p) => p.value)),
    cell = 8,
    bandwidth = 20,
    minWeight = 0.5,
  },
) {
  const [x0, x1] = xDomain;
  const [y0, y1] = yDomain;
  const sx = width / (x1 - x0 || 1);
  const sy = height / (y1 - y0 || 1);
  const px = points.map((p) => [(p.x - x0) * sx, (p.y - y0) * sy, p.value]);
  const cols = Math.max(1, Math.round(width / cell));
  const rows = Math.max(1, Math.round(height / cell));
  const cw = width / cols;
  const ch = height / rows;
  const twoH2 = 2 * bandwidth * bandwidth;
  const reach2 = 9 * bandwidth * bandwidth; // ignore points beyond 3 bandwidths
  const [lo, hi] = domain;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const cy = (r + 0.5) * ch;
    for (let c = 0; c < cols; c++) {
      const cx = (c + 0.5) * cw;
      let w = 0;
      let wv = 0;
      for (const [x, y, v] of px) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 > reach2) continue;
        const k = Math.exp(-d2 / twoH2);
        w += k;
        wv += k * v;
      }
      if (w < minWeight) continue;
      const value = wv / w;
      cells.push({
        x: x0 + (c * cw) / sx,
        x2: x0 + ((c + 1) * cw) / sx,
        y: y0 + (r * ch) / sy,
        y2: y0 + ((r + 1) * ch) / sy,
        value,
        distortion: Math.min(1, Math.max(0, (hi - value) / (hi - lo || 1))),
      });
    }
  }
  return cells;
}
