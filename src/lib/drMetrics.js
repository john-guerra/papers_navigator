/**
 * Projection quality metrics (ZADU-style, issue #28): trustworthiness and continuity
 * (Venna & Kaski 2001), with Euclidean distances. Pure; no dependencies.
 *
 * Both compare k-nearest-neighbour sets in the original (high-dimensional) space and in the
 * projection, given each point's neighbour ranks in both spaces:
 *   T(k) = 1 − 2 / (n·k·(2n − 3k − 1)) · Σ_i Σ_{j ∈ U_k(i)} (r_high(i, j) − k)
 * where U_k(i) are i's k nearest neighbours in the projection that are not among its k nearest
 * in the original space (false neighbours). Continuity C(k) swaps the roles (missing
 * neighbours, penalized by their rank in the projection). 1 = every neighbourhood preserved.
 * Same definition as sklearn.manifold.trustworthiness and ZADU.
 */

/**
 * Neighbour ranks of every point: an n×n Int32Array where [i·n + j] is j's rank among i's
 * neighbours (1 = nearest; i itself is 0). Ties are broken by index.
 * `points` is an array of coordinate arrays, or a flat Float32Array with `dims` per row.
 */
export function neighborRanks(points, { dims } = {}) {
  const flat = dims != null;
  const n = flat ? points.length / dims : points.length;
  const d = flat ? dims : (points[0]?.length ?? 0);
  const row = (i) => (flat ? points.subarray(i * d, i * d + d) : points[i]);
  const dist = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    const a = row(i);
    for (let j = i + 1; j < n; j++) {
      const b = row(j);
      let s = 0;
      for (let t = 0; t < d; t++) {
        const diff = a[t] - b[t];
        s += diff * diff;
      }
      dist[i * n + j] = dist[j * n + i] = s;
    }
  }
  const ranks = new Int32Array(n * n);
  const order = new Int32Array(n - 1 > 0 ? n - 1 : 0);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = 0; j < n; j++) if (j !== i) order[m++] = j;
    const base = i * n;
    order.sort((a, b) => dist[base + a] - dist[base + b] || a - b);
    for (let r = 0; r < order.length; r++) ranks[base + order[r]] = r + 1;
  }
  return ranks;
}

function sizeOf(ranks) {
  return Math.round(Math.sqrt(ranks.length));
}

/** Σ over points of the penalty of `found` neighbours missing in `reference` (ranks from it). */
function penalty(reference, found, k) {
  const n = sizeOf(reference);
  if (!(Number.isInteger(k) && k >= 1 && k < n / 2))
    throw new RangeError(
      `k must be an integer in [1, n/2) (n = ${n}), got ${k}`,
    );
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const base = i * n;
    for (let j = 0; j < n; j++) {
      const rf = found[base + j];
      if (rf >= 1 && rf <= k) {
        const rr = reference[base + j];
        if (rr > k) sum += rr - k;
      }
    }
  }
  return 1 - (2 / (n * k * (2 * n - 3 * k - 1))) * sum;
}

/** Trustworthiness: are the projection's neighbours real neighbours? */
export function trustworthiness(highRanks, lowRanks, k) {
  return penalty(highRanks, lowRanks, k);
}

/** Continuity: are the real neighbours still neighbours in the projection? */
export function continuity(highRanks, lowRanks, k) {
  return penalty(lowRanks, highRanks, k);
}

/**
 * Both metrics for a projection (`points`: [x, y] per row, same order as the embeddings)
 * against precomputed `highRanks` (neighborRanks of the embeddings, reusable across
 * projections and k).
 */
export function qualityMetrics(highRanks, points, k) {
  const lowRanks = neighborRanks(points);
  return {
    trustworthiness: trustworthiness(highRanks, lowRanks, k),
    continuity: continuity(highRanks, lowRanks, k),
  };
}

/**
 * Per-point trustworthiness and continuity (#83), for showing where the map can be trusted:
 * point i's share of the penalty, normalized like the global score so that
 *   local_i = 1 − 2 / (k·(2n − 3k − 1)) · Σ_{j ∈ U_k(i)} (r_high(i, j) − k)
 * and the global score is the mean of the local ones (ZADU's localScores definition, with
 * sklearn's 1-based ranks). Self-contained, because its source also runs in the worker.
 * Returns `{trustworthiness: {score, localScores}, continuity: {score, localScores}}`.
 */
export function localTrustworthinessContinuity(highRanks, lowRanks, k) {
  const n = Math.round(Math.sqrt(highRanks.length));
  if (!(Number.isInteger(k) && k >= 1 && k < n / 2))
    throw new RangeError(
      `k must be an integer in [1, n/2) (n = ${n}), got ${k}`,
    );
  const scale = 2 / (k * (2 * n - 3 * k - 1));
  const measure = (reference, found) => {
    const localScores = new Float64Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const base = i * n;
      let sum = 0;
      for (let j = 0; j < n; j++) {
        const rf = found[base + j];
        if (rf >= 1 && rf <= k) {
          const rr = reference[base + j];
          if (rr > k) sum += rr - k;
        }
      }
      localScores[i] = 1 - scale * sum;
      total += localScores[i];
    }
    return { score: total / n, localScores };
  };
  return {
    trustworthiness: measure(highRanks, lowRanks),
    continuity: measure(lowRanks, highRanks),
  };
}
