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
      for (let j = 0, offset = i * dims; j < dims; j++) score += query[j] * matrix[offset + j];
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
