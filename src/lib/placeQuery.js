import { createBooleanSetting } from "./booleanSetting.js";
import { contours } from "d3";
import { DIMS } from "./search.js";

export const QUERY_MARKER_KEY = "papersNavigator:queryMarker";

/**
 * "★ Your search" on the map, on or off (Map options → Appearance), remembered per device and on
 * by default. Hiding it only stops drawing it: paper labels and the aria-live line still use it.
 */
export function createQueryMarkerSettings({
  storage = globalThis.localStorage,
} = {}) {
  return createBooleanSetting(QUERY_MARKER_KEY, true, storage);
}

/**
 * Where a query (a search, an abstract) lands on the map (#100). UMAP and t-SNE have no
 * transform for new points in the browser, so this is an out-of-sample placement by nearest
 * neighbours, which works for any projection, live or aligned (#82):
 * - the `k` papers most similar to `vector` (cosine: the embeddings are L2-normalized) among
 *   those with a position (`positions[i]` = [x, y] where paper i is drawn, null if not on the map);
 * - their positions averaged with weights exp((s - s_max) / temperature): the most similar
 *   paper counts fully and one 0.05 less similar about a third, so a paper's own embedding lands
 *   next to its own dot and a query lands among its closest matches rather than at the centroid of
 *   ten loosely related papers;
 * - `spread`: the weighted root-mean-square distance of those neighbours from the placement, in
 *   map units. Neighbours scattered over the map (the projection split them) make it large: the
 *   position is approximate, and the map draws it as a halo of that radius.
 *
 * Returns {x, y, spread, neighbours: [{index, similarity}] (most similar first)}, or null when
 * no paper has a position.
 */
export function placeByNeighbours(
  vector,
  matrix,
  positions,
  { k = 10, dims = DIMS, temperature = 0.05 } = {},
) {
  const n = Math.min(positions.length, Math.floor(matrix.length / dims));
  // Top k by insertion into a short sorted list (n is a few hundred papers)
  const top = [];
  for (let i = 0; i < n; i++) {
    if (!positions[i]) continue;
    let s = 0;
    for (let d = 0, o = i * dims; d < dims; d++) s += vector[d] * matrix[o + d];
    if (top.length === k && s <= top[k - 1].similarity) continue;
    let j = top.length < k ? top.length : k - 1;
    while (j > 0 && top[j - 1].similarity < s) {
      if (j < k) top[j] = top[j - 1];
      j--;
    }
    top[j] = { index: i, similarity: s };
  }
  if (!top.length) return null;
  const best = top[0].similarity;
  const weights = top.map((d) => Math.exp((d.similarity - best) / temperature));
  const total = weights.reduce((a, b) => a + b, 0);
  let x = 0;
  let y = 0;
  top.forEach((d, i) => {
    x += weights[i] * positions[d.index][0];
    y += weights[i] * positions[d.index][1];
  });
  x /= total;
  y /= total;
  let squared = 0;
  top.forEach((d, i) => {
    const [px, py] = positions[d.index];
    squared += weights[i] * ((px - x) ** 2 + (py - y) ** 2);
  });
  return { x, y, spread: Math.sqrt(squared / total), neighbours: top };
}

/**
 * Where the matching papers are (#167): the map (`width` × `height` pixels showing `xDomain` ×
 * `yDomain`) cut into `cell`-pixel squares, a Gaussian kernel density (bandwidth in pixels) of
 * the `points` ({x, y, weight}, data units) on them, and the level at which the densest cells
 * hold `mass` of the density. Its outline is traced with marching squares (d3.contours, linear
 * interpolation), so it is smooth: one polygon per group of matches, so matches the projection
 * split show as several areas, and nothing between them.
 *
 * Returns {polygons, peak} or null without points: `polygons` a GeoJSON MultiPolygon's
 * coordinates in data units; `peak` {x, y}, the densest point of the blob holding `top` (the
 * best match, {x, y}; the global peak without it or when it falls outside), where the ★ goes.
 *
 * Measured on VIS 2026 (32 searches, medians) against the neighbours' spread disc it replaces:
 * 69% of the papers inside are Good matches (the disc: 56%), 25% of it is empty (> 20px from
 * any Good match; the disc: 43%), 3.3% of the map (the disc: 8.4%), Good matches inside 34%
 * (the disc: 35%). It contains the Strong matches by construction.
 */
export function matchArea(
  points,
  {
    width,
    height,
    xDomain,
    yDomain,
    cell = 4,
    bandwidth = 22,
    mass = 0.8,
    top = null,
  },
) {
  if (!points?.length || !(width > 0) || !(height > 0)) return null;
  const [x0, x1] = xDomain;
  const [y0, y1] = yDomain;
  const sx = width / (x1 - x0 || 1);
  const sy = height / (y1 - y0 || 1);
  const px = points.map((p) => [(p.x - x0) * sx, (p.y - y0) * sy, p.weight]);
  const cols = Math.max(1, Math.round(width / cell));
  const rows = Math.max(1, Math.round(height / cell));
  const cw = width / cols;
  const ch = height / rows;
  const twoH2 = 2 * bandwidth * bandwidth;
  const reach2 = 9 * bandwidth * bandwidth; // ignore points beyond 3 bandwidths
  const density = new Float64Array(cols * rows);
  let total = 0;
  for (let r = 0; r < rows; r++) {
    const cy = (r + 0.5) * ch;
    for (let c = 0; c < cols; c++) {
      const cx = (c + 0.5) * cw;
      let d = 0;
      for (const [x, y, w] of px) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 <= reach2) d += w * Math.exp(-d2 / twoH2);
      }
      density[r * cols + c] = d;
      total += d;
    }
  }
  if (!(total > 0)) return null;
  // The level: walk the cells from the densest until they hold `mass` of the total
  const sorted = Float64Array.from(density).sort().reverse();
  let held = 0;
  let level = sorted[0];
  for (const d of sorted) {
    if (held >= mass * total) break;
    held += d;
    level = d;
  }
  // Grid coordinates (value i at i + 0.5, d3.contours' convention) → data units
  const toData = ([gx, gy]) => [x0 + (gx * cw) / sx, y0 + (gy * ch) / sy];
  const [contour] = contours().size([cols, rows]).thresholds([level])(density);
  const polygons = contour.coordinates.map((polygon) =>
    polygon.map((ring) => ring.map(toData)),
  );
  return { polygons, peak: toPeak() };

  function cellOf({ x, y }) {
    const c = Math.floor(((x - x0) * sx) / cw);
    const r = Math.floor(((y - y0) * sy) / ch);
    return c >= 0 && c < cols && r >= 0 && r < rows ? r * cols + c : -1;
  }
  function toPeak() {
    const i = peakOf(density, cols, rows, level, top ? cellOf(top) : -1);
    const [x, y] = toData([(i % cols) + 0.5, Math.floor(i / cols) + 0.5]);
    return { x, y };
  }
}

/**
 * The densest cell of the region (cells ≥ `level`, 4-connected) that holds cell `start`, or the
 * densest cell overall when `start` is outside the region.
 */
function peakOf(density, cols, rows, level, start) {
  let best = 0;
  for (let i = 1; i < density.length; i++)
    if (density[i] > density[best]) best = i;
  if (start == null || start < 0 || !(density[start] >= level)) return best;
  const seen = new Uint8Array(density.length);
  const stack = [start];
  seen[start] = 1;
  let peak = start;
  while (stack.length) {
    const i = stack.pop();
    if (density[i] > density[peak]) peak = i;
    const c = i % cols;
    const r = (i - c) / cols;
    for (const j of [
      c > 0 ? i - 1 : -1,
      c < cols - 1 ? i + 1 : -1,
      r > 0 ? i - cols : -1,
      r < rows - 1 ? i + cols : -1,
    ])
      if (j >= 0 && !seen[j] && density[j] >= level) {
        seen[j] = 1;
        stack.push(j);
      }
  }
  return peak;
}

/** How far below the program's best match the best visible one may be before the marker fades. */
export const FAINT_GAP = 0.1;

/** The highest similarity of `vector` to any of the first `n` rows of `matrix`. */
function bestSimilarity(vector, matrix, n, dims) {
  let best = -Infinity;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let d = 0, o = i * dims; d < dims; d++) s += vector[d] * matrix[o + d];
    if (s > best) best = s;
  }
  return best;
}

/** Shown papers whose similarity to `vector` is at least `strong`: {x, y, weight: s - good}. */
function strongMatches(vector, matrix, positions, dims, strong, good) {
  const out = [];
  for (let i = 0; i < positions.length; i++) {
    if (!positions[i]) continue;
    let s = 0;
    for (let d = 0, o = i * dims; d < dims; d++) s += vector[d] * matrix[o + d];
    if (s >= strong)
      out.push({
        x: positions[i][0],
        y: positions[i][1],
        weight: Math.max(s - good, 0.01),
      });
  }
  return out;
}

/**
 * One sentence per marker for screen readers (an aria-live region by the map): where the search
 * or each abstract lands, by its nearest papers. "" without markers.
 */
export function queryAnnouncement(markers, { nearest = 3 } = {}) {
  return markers
    .map((m) => {
      const who = m.label.replace(/^★\s*/, "");
      const titles = m.nearest
        .slice(0, nearest)
        .map((d) => d.title)
        .join("; ");
      const note = m.faint ? ", few similar papers visible" : "";
      return `${who} lands near: ${titles} (approximate${note}).`;
    })
    .join(" ");
}

/**
 * The markers for the map (#100): one for a search, one per abstract in My research (numbered
 * when there are several). `vectors` are the query embeddings (rows of `matrix` ↔ `papers`),
 * `shown` the papers on the map with their drawn coordinates, so the marker sits among the dots
 * on screen (inside their extent: an average of their positions) and follows filters, live and
 * aligned projections. Each marker: {label, text, x, y, spread, faint, nearest: [{id, title, x,
 * y, similarity}]}. Everything stays in the browser.
 *
 * `faint`: few similar papers are visible (heavy filters), so the marker sits among papers that
 * barely match: the best visible similarity is under `weakCut` (the ranking's Weak cut), or more
 * than `gap` below the best over the whole program. The map draws it faded and says so.
 */
export function queryMarkers({
  vectors,
  matrix,
  papers,
  shown,
  query = "",
  research = false,
  k = 10,
  dims = DIMS,
  x = "x",
  y = "y",
  weakCut = -Infinity,
  goodCut = null,
  strongCut = null,
  gap = FAINT_GAP,
}) {
  if (!vectors?.length || !shown?.length) return [];
  const drawn = new Map(shown.map((d) => [d.id, d]));
  const positions = papers.map((p) => {
    const d = drawn.get(p.id);
    return d && Number.isFinite(d[x]) && Number.isFinite(d[y])
      ? [d[x], d[y]]
      : null;
  });
  return vectors
    .map((vector, i) => {
      const place = placeByNeighbours(vector, matrix, positions, { k, dims });
      if (!place) return null;
      const bestShown = place.neighbours[0].similarity;
      const faint =
        bestShown < weakCut ||
        bestShown < bestSimilarity(vector, matrix, papers.length, dims) - gap;
      // #167: the search area is drawn around the Strong matches on the map (each weighted by
      // how far it clears Good), or around its nearest papers without cuts
      const matches =
        strongCut == null
          ? place.neighbours.map(({ index, similarity }) => ({
              x: positions[index][0],
              y: positions[index][1],
              weight: Math.exp(
                (similarity - place.neighbours[0].similarity) / 0.05,
              ),
            }))
          : strongMatches(
              vector,
              matrix,
              positions,
              dims,
              strongCut,
              goodCut ?? 0,
            );
      // One Strong match adds nothing to its own dot: no area, just the ★ (#167 review)
      if (strongCut != null && matches.length < 2) matches.length = 0;
      const label = research
        ? `★ My research${vectors.length > 1 ? ` ${i + 1}` : ""}`
        : "★ Your search";
      const text = research
        ? vectors.length > 1
          ? `abstract ${i + 1}`
          : "your abstract"
        : `“${query.trim()}”`;
      return {
        label,
        text,
        x: place.x,
        y: place.y,
        spread: place.spread,
        faint,
        matches,
        nearest: place.neighbours.map(({ index, similarity }) => ({
          id: papers[index].id,
          title: papers[index].title,
          x: positions[index][0],
          y: positions[index][1],
          similarity,
        })),
      };
    })
    .filter(Boolean);
}

/** queryMarkers' cut options from relevance cuts ({weak, good, strong}); {} without a ranking. */
export function queryCuts(cuts) {
  return cuts
    ? { weakCut: cuts.weak, goodCut: cuts.good, strongCut: cuts.strong }
    : {};
}
