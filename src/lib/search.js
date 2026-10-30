export const DIMS = 384;

/** Wraps the embeddings buffer; row i corresponds to papers[i]. */
export function toMatrix(buffer, n, dims = DIMS) {
  if (buffer.byteLength !== n * dims * 4) {
    throw new Error(
      `embeddings/papers mismatch: ${buffer.byteLength} bytes for ${n} papers × ${dims} dims`,
    );
  }
  return new Float32Array(buffer);
}

/** Embeddings are L2-normalized, so the dot product is the cosine similarity. */
export function rankBySimilarity(query, matrix, papers, dims = DIMS) {
  return papers
    .map((paper, i) => {
      let score = 0;
      for (let j = 0, offset = i * dims; j < dims; j++)
        score += query[j] * matrix[offset + j];
      return { ...paper, score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Cut points for the Strong / Good / All relevance control (DESIGN.md → Relevance control).
 * Good: 0.30 when at least 5 papers clear it, else the 10th best score (short queries score
 * low). Strong: halfway from Good to the best score.
 */
export function relevanceCuts(scores) {
  const sorted = scores.filter((s) => s != null).sort((a, b) => b - a);
  if (!sorted.length) return { good: 0, strong: 0 };
  const good =
    sorted.filter((s) => s >= 0.3).length >= 5
      ? 0.3
      : sorted[Math.min(9, sorted.length - 1)];
  return { good, strong: good + (sorted[0] - good) / 2 };
}

/** Papers at each relevance level for the given cuts. */
export function relevanceCounts(papers, { good, strong }) {
  return {
    strong: papers.filter((p) => p.score >= strong).length,
    good: papers.filter((p) => p.score >= good).length,
    all: papers.length,
  };
}

/** The `k` papers most similar to paper `id` (cosine on the precomputed embeddings), itself excluded. */
export function relatedPapers(
  id,
  matrix,
  papers,
  { k = 10, dims = DIMS } = {},
) {
  const i = papers.findIndex((p) => p.id === id);
  if (i < 0) return [];
  const vector = matrix.subarray(i * dims, (i + 1) * dims);
  return rankBySimilarity(vector, matrix, papers, dims)
    .filter((p) => p.id !== id)
    .slice(0, k);
}

/**
 * `load` run once, on the first call (e.g. the embeddings on My Papers, only when a panel or
 * recommendations need them); a failed load (offline) is retried on the next call.
 */
export function lazyLoader(load) {
  let promise = null;
  return () =>
    (promise ??= Promise.resolve()
      .then(load)
      .catch((error) => {
        promise = null;
        throw error;
      }));
}
