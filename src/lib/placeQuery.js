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

/** The terrain's isoline spacing (#182): one every 5 points of match. */
export const TERRAIN_STEP = 0.05;

/**
 * The isoline levels of the similarity terrain (#182): every `step` from the Good cut up to the
 * best visible score (searches 0.30, 0.35, …; My research from its own Good cut). [] when
 * nothing reaches Good or without a Good cut.
 */
export function terrainLevels(good, best, step = TERRAIN_STEP) {
  if (!Number.isFinite(good) || !Number.isFinite(best)) return [];
  const levels = [];
  for (let i = 0; ; i++) {
    const v = Math.round((good + i * step) * 1e6) / 1e6;
    if (v > best + 1e-9) return levels;
    levels.push(v);
  }
}

/**
 * The similarity terrain (#182): a topographic map whose height is the match % to the query.
 * The map (`width` × `height` pixels showing `xDomain` × `yDomain`) is cut into `cell`-pixel
 * squares; each holds the Nadaraya–Watson estimate of the score there: the average of the
 * `points` ({x, y, score}, data units) weighted by a Gaussian of their distance (`bandwidth` px).
 * It is an estimate between papers, so it is masked where there are few: the height is scaled
 * by min(1, density / `minWeight`), the density a Gaussian of half the bandwidth summed over the
 * papers (one paper on its own dot counts 1). The mask is continuous, so isolines stay smooth;
 * no terrain shows in empty space, and a lone paper gets at most a small island on its own dot.
 * Isolines at `levels` are traced with marching squares (d3.contours, linear interpolation).
 *
 * Tuned on VIS 2026 (283 main-track papers on a ~715 × 547 px map, Volume rendering, Data
 * literacy, Perception): 30px gives nested, rounded terrain where matches gather (15–20px only
 * circled single dots); a minWeight of 1 keeps the terrain inside the clouds of papers (2 halved
 * it almost everywhere: on this map a 15px kernel sums to ~1 between neighbours). Searches whose
 * Good matches are scattered among weak ones (Perception) get no isoline: the average there is
 * under Good, and the ★ sits on the top match. 2–4 ms per placement.
 *
 * The grid runs `margin` px past the map on every side (#181), so terrain at the map's edge
 * falls off like anywhere else instead of being cut along the grid's edge.
 *
 * Returns null without points, else {levels: [{value, polygons}] (only the levels with an
 * isoline, lowest first; polygons a GeoJSON MultiPolygon's coordinates in data units), peak,
 * valueAt(x, y)}: `peak` {x, y} the highest point, inside the top isoline and kept on the map,
 * where the ★ goes (on a plateau, its densest cell); null when no isoline rises above the first level (the Good cut).
 */
export function similarityTerrain(
  points,
  {
    width,
    height,
    xDomain,
    yDomain,
    levels = [],
    cell = 4,
    bandwidth = 30,
    minWeight = 1,
    margin = 2 * bandwidth,
  },
) {
  if (!points?.length || !(width > 0) || !(height > 0)) return null;
  const [x0, x1] = xDomain;
  const [y0, y1] = yDomain;
  const sx = width / (x1 - x0 || 1);
  const sy = height / (y1 - y0 || 1);
  // Grid pixels: the map's own shifted by `margin` (a whole number of cells, so the cells inside
  // the map are the same as without it)
  const pad = Math.max(0, Math.ceil(margin / cell));
  const cols0 = Math.max(1, Math.round(width / cell));
  const rows0 = Math.max(1, Math.round(height / cell));
  const cw = width / cols0;
  const ch = height / rows0;
  const cols = cols0 + 2 * pad;
  const rows = rows0 + 2 * pad;
  const ox = pad * cw;
  const oy = pad * ch;
  // Each paper splats its kernel on the cells within 3 bandwidths (separable: a row of x weights
  // times a column of y weights), so the cost is papers × (6 bandwidths / cell)², not cells ×
  // papers. The density kernel (half the bandwidth) is the same weight to the 4th power.
  const sum = new Float64Array(cols * rows);
  const weight = new Float64Array(cols * rows);
  const density = new Float64Array(cols * rows);
  const reach = 3 * bandwidth;
  const twoH2 = 2 * bandwidth * bandwidth;
  const wx = new Float64Array(cols);
  for (const p of points) {
    if (!Number.isFinite(p.score)) continue;
    const gx = (p.x - x0) * sx + ox;
    const gy = (p.y - y0) * sy + oy;
    const c0 = Math.max(0, Math.ceil((gx - reach) / cw - 0.5));
    const c1 = Math.min(cols - 1, Math.floor((gx + reach) / cw - 0.5));
    const r0 = Math.max(0, Math.ceil((gy - reach) / ch - 0.5));
    const r1 = Math.min(rows - 1, Math.floor((gy + reach) / ch - 0.5));
    for (let c = c0; c <= c1; c++)
      wx[c] = Math.exp(-(((c + 0.5) * cw - gx) ** 2) / twoH2);
    for (let r = r0; r <= r1; r++) {
      const wy = Math.exp(-(((r + 0.5) * ch - gy) ** 2) / twoH2);
      for (let c = c0, i = r * cols + c0; c <= c1; c++, i++) {
        const w = wy * wx[c];
        weight[i] += w;
        sum[i] += w * p.score;
        const w2 = w * w;
        density[i] += w2 * w2;
      }
    }
  }
  const field = new Float64Array(cols * rows);
  let high = 0;
  for (let i = 0; i < field.length; i++) {
    if (!(weight[i] > 0)) continue;
    field[i] = (sum[i] / weight[i]) * Math.min(1, density[i] / minWeight);
    if (field[i] > high) high = field[i];
  }
  // The summit: papers of about the same score make a plateau, so of the cells within a point of
  // the highest, the densest (where those papers crowd), not the first one found
  let top = -1;
  for (let i = 0; i < field.length; i++)
    if (field[i] >= high - 0.01 && (top < 0 || density[i] > density[top]))
      top = i;
  // Grid coordinates (value i at i + 0.5, d3.contours' convention) → data units
  const toData = ([gx, gy]) => [
    x0 + (gx * cw - ox) / sx,
    y0 + (gy * ch - oy) / sy,
  ];
  const traced = levels.length
    ? contours().size([cols, rows]).thresholds(levels)(field)
    : [];
  const kept = traced
    .filter((c) => c.coordinates.length)
    .map((c) => ({
      value: c.value,
      polygons: c.coordinates.map((polygon) =>
        polygon.map((ring) => ring.map(toData)),
      ),
    }));
  const rises = kept.some((l) => l.value > levels[0]);
  let peak = null;
  if (rises && top >= 0) {
    const [x, y] = toData([(top % cols) + 0.5, Math.floor(top / cols) + 0.5]);
    // On the map, though the highest cell can sit just past its edge (#181)
    const clamp = (v, a, b) =>
      Math.max(Math.min(a, b), Math.min(v, Math.max(a, b)));
    peak = { x: clamp(x, x0, x1), y: clamp(y, y0, y1) };
  }
  return {
    levels: kept,
    peak,
    valueAt(x, y) {
      const c = Math.floor(((x - x0) * sx + ox) / cw);
      const r = Math.floor(((y - y0) * sy + oy) / ch);
      return c >= 0 && c < cols && r >= 0 && r < rows ? field[r * cols + c] : 0;
    },
  };
}

/** Which of `n` levels get a label (#182): all up to 3, else the lowest, a middle one, the top. */
function labelledLevels(n) {
  if (n <= 3) return [...Array(n).keys()];
  return [0, Math.floor((n - 1) / 2), n - 1];
}

/**
 * Where the terrain's level labels ("45%") go (#182): on 2–3 levels only (labelledLevels), each
 * on its own isoline, at a vertex where the line runs closest to horizontal (it reads along the
 * line), whose `width` × `height` px box stays inside `bounds` ([x0, y0, x1, y1]) and crosses
 * none of `obstacles` (topic labels, the ★ and its name) nor a label already placed. A level
 * with no free spot goes unlabelled. `toPx` maps data units to the same pixels as the boxes.
 * Returns [{value, text, x, y (data units), box}].
 */
export function isolineLabels(
  levels,
  { toPx, obstacles = [], bounds = null, height = 11, charWidth = 6.2 } = {},
) {
  const placed = [];
  const taken = [...obstacles];
  const crosses = ([a, b, c, d]) =>
    taken.some(([e, f, g, h]) => a < g && e < c && b < h && f < d);
  for (const index of labelledLevels(levels.length)) {
    const { value, polygons } = levels[index];
    const text = `${Math.round(value * 100)}%`;
    const width = text.length * charWidth + 4;
    let best = null;
    for (const [outer] of polygons) {
      const px = outer.map(toPx);
      const n = px.length - 1; // closed ring: the last point repeats the first
      for (let i = 0; i < n; i++) {
        const [x, y] = px[i];
        const box = [
          x - width / 2,
          y - height / 2,
          x + width / 2,
          y + height / 2,
        ];
        if (
          bounds &&
          (box[0] < bounds[0] ||
            box[1] < bounds[1] ||
            box[2] > bounds[2] ||
            box[3] > bounds[3])
        )
          continue;
        if (crosses(box)) continue;
        // The line's slope around the vertex: flat reads best
        const [ax, ay] = px[(i - 2 + n) % n];
        const [bx, by] = px[(i + 2) % n];
        const slope = Math.abs(by - ay) / (Math.hypot(bx - ax, by - ay) || 1);
        if (!best || slope < best.slope - 1e-6) {
          const [dx, dy] = outer[i];
          best = { slope, label: { value, text, x: dx, y: dy, box } };
        }
      }
    }
    if (best) {
      placed.push(best.label);
      taken.push(best.label.box);
    }
  }
  return placed;
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

/** Every shown paper's similarity to `vector` (#182): [{x, y, score}], for the terrain. */
function shownScores(vector, matrix, positions, dims) {
  const out = [];
  for (let i = 0; i < positions.length; i++) {
    if (!positions[i]) continue;
    let s = 0;
    for (let d = 0, o = i * dims; d < dims; d++) s += vector[d] * matrix[o + d];
    out.push({ x: positions[i][0], y: positions[i][1], score: s });
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
      // #182: the terrain is drawn from every shown paper's score, with an isoline every 0.05
      // from the Good cut up to the best visible score; none without cuts
      const levels = terrainLevels(goodCut, bestShown);
      const scores = levels.length
        ? shownScores(vector, matrix, positions, dims)
        : [];
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
        scores,
        levels,
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

/**
 * Where the query marker's name goes around its ★ at `star` = [x, y] (#172 re-review): the
 * first side whose `width` × `height` box (px) crosses none of `obstacles` ([x0, y0, x1, y1],
 * e.g. topic labels), tried above, below, right, left, then at its corners (below left, above
 * left, below right, above right); when every spot is taken, the least covered one. Returns the box center's offset {dx, dy} from the ★ in px.
 *
 * With `bounds` ([x0, y0, x1, y1], the map's drawing box) the box never leaves the map (#181:
 * next to its right edge only "Yo" showed): each side's box slides inside it, and a side that
 * then lands on the ★ (`starRadius` px around it) is used only when every other side does too.
 */
export function nameSpot(
  [px, py],
  { width, height, obstacles = [], gap = 9, bounds = null, starRadius = 6 },
) {
  const sides = [
    { dx: 0, dy: -13 },
    { dx: 0, dy: 14 },
    { dx: width / 2 + gap, dy: 0 },
    { dx: -(width / 2 + gap), dy: 0 },
    // Then its corners, the box's own corner by the ★ (#181: by the map's edge a side or two
    // are gone, and topic labels often take the rest)
    { dx: -(width / 2 + gap / 2), dy: 14 },
    { dx: -(width / 2 + gap / 2), dy: -13 },
    { dx: width / 2 + gap / 2, dy: 14 },
    { dx: width / 2 + gap / 2, dy: -13 },
  ];
  const slide = (v, size, lo, hi) =>
    Math.max(lo, Math.min(v, Math.max(lo, hi - size)));
  let best = null;
  for (const side of sides) {
    let x0 = px + side.dx - width / 2;
    let y0 = py + side.dy - height / 2;
    let onStar = false;
    if (bounds) {
      x0 = slide(x0, width, bounds[0], bounds[2]);
      y0 = slide(y0, height, bounds[1], bounds[3]);
      onStar =
        x0 < px + starRadius &&
        x0 + width > px - starRadius &&
        y0 < py + starRadius &&
        y0 + height > py - starRadius;
    }
    let covered = 0;
    for (const [a, b, c, d] of obstacles) {
      const w = Math.min(x0 + width, c) - Math.max(x0, a);
      const h = Math.min(y0 + height, d) - Math.max(y0, b);
      if (w > 0 && h > 0) covered += w * h;
    }
    const spot = { dx: x0 + width / 2 - px, dy: y0 + height / 2 - py };
    if (!onStar && covered === 0) return spot;
    if (
      !best ||
      (best.onStar && !onStar) ||
      (best.onStar === onStar && covered < best.covered)
    )
      best = { ...spot, onStar, covered };
  }
  return { dx: best.dx, dy: best.dy };
}
