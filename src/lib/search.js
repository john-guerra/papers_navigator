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
