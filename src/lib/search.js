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

/** Initial similarity range for the histogram: from 0.3 (or the lowest score) to the best one. */
export function defaultScoreRange(scores) {
  if (!scores.length) return [0, 1];
  const lo = Math.min(...scores);
  const hi = Math.max(...scores);
  // Weak matches only (all below 0.3): show them all rather than an empty list
  return [hi < 0.3 ? lo : Math.max(0.3, lo), hi];
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
