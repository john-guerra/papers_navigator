// Must match the pipeline: all-MiniLM-L6-v2, mean pooling, L2-normalized.
const MODEL = "Xenova/all-MiniLM-L6-v2";

let embedder;

/** Lazily loads Transformers.js and the model on first use. */
export function getEmbedder() {
  embedder ??= import("@huggingface/transformers").then(async ({ pipeline }) => {
    const extractor = await pipeline("feature-extraction", MODEL);
    return async (text) => {
      const output = await extractor(text, { pooling: "mean", normalize: true });
      return output.data;
    };
  });
  return embedder;
}
