import { DIMS } from "./search.js";

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
