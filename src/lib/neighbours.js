/**
 * Nearest neighbours (#102): a paper's k most similar papers in the embedding (cosine; the rows
 * are L2-normalized, so a dot product), compared with its k nearest on the map. A true neighbour
 * that is far on the map is a **missing neighbour**; a paper close on the map that isn't a true
 * neighbour is a **false neighbour**. Both are what a 2D projection distorts.
 */
import { DIMS } from "./search.js";

/**
 * The `k` rows most similar to row `i` (itself excluded), most similar first, as
 * {index, similarity}. `include(j)` limits the candidates (e.g. the papers on the map).
 */
export function topK(
  matrix,
  i,
  k,
  { dims = DIMS, n = matrix.length / dims, include = null } = {},
) {
  const rows = [];
  const offset = i * dims;
  for (let j = 0; j < n; j++) {
    if (j === i || (include && !include(j))) continue;
    let s = 0;
    for (let d = 0, o = j * dims; d < dims; d++)
      s += matrix[offset + d] * matrix[o + d];
    rows.push({ index: j, similarity: s });
  }
  return rows.sort((a, b) => b.similarity - a.similarity).slice(0, k);
}

/**
 * Neighbours by paper id. Each paper's full ranking (every other paper, most similar first) is
 * computed the first time it is asked for and cached (488 papers: ~0.2M multiply-adds, under a
 * millisecond), so restricting to the papers on the map (filters) needs no recomputation.
 */
export function createNeighbourIndex(matrix, ids, { dims = DIMS } = {}) {
  const position = new Map(ids.map((id, i) => [id, i]));
  const rows = new Map();
  const ranking = (i) => {
    let row = rows.get(i);
    if (!row) {
      row = topK(matrix, i, ids.length, { dims, n: ids.length });
      rows.set(i, row);
    }
    return row;
  };
  return {
    /** The `k` papers most similar to `id`, as {id, similarity}; only ids in `within` if given. */
    nearest(id, k, within = null) {
      const i = position.get(id);
      if (i == null) return [];
      const out = [];
      for (const { index, similarity } of ranking(i)) {
        if (within && !within.has(ids[index])) continue;
        out.push({ id: ids[index], similarity });
        if (out.length === k) break;
      }
      return out;
    },
    /** How many rankings have been computed (for tests). */
    computed: () => rows.size,
  };
}

/** The other ids in `positions` (Map id → [x, y]) by distance on the map to `id`, nearest first. */
export function mapOrder(positions, id) {
  const [fx, fy] = positions.get(id);
  const rows = [];
  for (const [other, [x, y]] of positions)
    if (other !== id) rows.push([other, (x - fx) ** 2 + (y - fy) ** 2]);
  return rows.sort((a, b) => a[1] - b[1]).map((d) => d[0]);
}

/**
 * How far down the map ranking a true neighbour may sit and still count as close on the map:
 * max(3k, 10% of the `n` papers on the map). The strict "within the k nearest" leaves most
 * neighbours dashed (UMAP ~64% at k=10), which hides the real tears; this scales with filters.
 */
export const missingReach = (k, n) => Math.max(3 * k, Math.ceil(0.1 * n));

/**
 * Splits `focus`'s first `k` true neighbours on the map (`similar`: {id, similarity}, most similar
 * first; those not in `positions` are skipped) into preserved ones (map rank within `reach`,
 * default missingReach) and missing ones, with each one's rank by map distance (1 = nearest);
 * `falseNeighbours` are the k nearest on the map that aren't true neighbours.
 */
export function classifyNeighbours(
  focus,
  similar,
  positions,
  k,
  { reach = missingReach(k, positions.size) } = {},
) {
  const order = mapOrder(positions, focus);
  const rank = new Map(order.map((id, i) => [id, i + 1]));
  const neighbours = similar
    .filter((d) => rank.has(d.id))
    .slice(0, k)
    .map(({ id, similarity }) => ({
      id,
      similarity,
      mapRank: rank.get(id),
      missing: rank.get(id) > reach,
    }));
  const trueIds = new Set(neighbours.map((d) => d.id));
  return {
    reach,
    neighbours,
    falseNeighbours: order.slice(0, k).filter((id) => !trueIds.has(id)),
  };
}

/**
 * The average share of each paper's k true neighbours that are missing on the map (0 = the map
 * keeps every neighbourhood). `similar(id)` gives the true neighbours among `positions`.
 */
export function missingShare(similar, positions, k, options) {
  let total = 0;
  for (const id of positions.keys()) {
    const { neighbours } = classifyNeighbours(
      id,
      similar(id),
      positions,
      k,
      options,
    );
    total += neighbours.length
      ? neighbours.filter((d) => d.missing).length / neighbours.length
      : 0;
  }
  return positions.size ? total / positions.size : 0;
}

/**
 * Esc closes the topmost layer only: an open paper details panel, then the Options drawer (which
 * calls preventDefault on the Esc it used), then the neighbour pin.
 */
export const shouldUnpinOnEscape = (event, { detailOpen }) =>
  event.key === "Escape" && !event.defaultPrevented && !detailOpen;

/** Options → Advanced (#102): show neighbours on hover, and how many; remembered per device. */
export const NEIGHBOURS_KEY = "papersNavigator:neighbours";
export const NEIGHBOUR_COUNTS = [10, 15];
const CHOICES = { enabled: [true, false], k: NEIGHBOUR_COUNTS };
const DEFAULTS = { enabled: true, k: 10 };

const valid = (choices) =>
  Object.fromEntries(
    Object.entries(choices ?? {}).filter(([key, value]) =>
      CHOICES[key]?.includes(value),
    ),
  );

/** A reactive store like the animation settings: `.value`, `set(patch)`, emits `input`. */
export function createNeighbourSettings({
  storage = globalThis.localStorage,
} = {}) {
  const store = new EventTarget();
  let choices = {};
  try {
    const parsed = JSON.parse(storage?.getItem(NEIGHBOURS_KEY) ?? "null");
    if (parsed && typeof parsed === "object") choices = valid(parsed);
  } catch {
    // Unreadable: defaults
  }
  store.value = { ...DEFAULTS, ...choices };
  store.set = (patch) => {
    choices = { ...choices, ...valid(patch) };
    try {
      storage?.setItem(NEIGHBOURS_KEY, JSON.stringify(choices));
    } catch {
      // Private mode etc.: the choice still applies for this page view
    }
    store.value = { ...DEFAULTS, ...choices };
    store.dispatchEvent(new Event("input"));
  };
  return store;
}
