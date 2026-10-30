// Must match the pipeline: all-MiniLM-L6-v2, mean pooling, L2-normalized.
const MODEL = "Xenova/all-MiniLM-L6-v2";

// Self-hosted ONNX runtime (#21) instead of Transformers.js's default, cdn.jsdelivr.net.
// Framework copies each file named by import.meta.resolve into
// dist/_node/onnxruntime-web@<version>/, so it always matches the bundled runtime.
// Two builds, like Transformers.js's own default: asyncify, or the plain build for
// Safari < 26 without WebGPU.
const ORT_WASM = {
  asyncify: {
    mjs: import.meta
      .resolve("onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs"),
    wasm: import.meta
      .resolve("onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm"),
  },
  plain: {
    mjs: import.meta.resolve("onnxruntime-web/ort-wasm-simd-threaded.mjs"),
    wasm: import.meta.resolve("onnxruntime-web/ort-wasm-simd-threaded.wasm"),
  },
};

/** Same test as Transformers.js's `isSafariBelow26` (its choice of the plain build). */
export function isSafariBelow26({ userAgent = "", vendor = "" } = {}) {
  const isSafari =
    vendor.includes("Apple") &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|mercury|brave/i.test(userAgent) &&
    !userAgent.includes("Chrome") &&
    !userAgent.includes("Android");
  const version = isSafari && userAgent.match(/Version\/(\d+)/);
  return version ? Number(version[1]) < 26 : false;
}

/** `{mjs, wasm}` URLs of the ONNX runtime build for this browser. */
export function ortWasmPaths(
  nav = globalThis.navigator ?? {},
  urls = ORT_WASM,
) {
  const build =
    isSafariBelow26(nav) && !("gpu" in nav) ? urls.plain : urls.asyncify;
  // A copy: Transformers.js replaces .mjs with a blob URL in place.
  return { ...build };
}

let embedder;

/** Lazily loads Transformers.js and the model on first use. */
export function getEmbedder() {
  // A failed load (offline, blocked CDN) is forgotten, so the next call tries again
  embedder ??= import("@huggingface/transformers").then(
    async ({ env, pipeline }) => {
      env.backends.onnx.wasm.wasmPaths = ortWasmPaths();
      const extractor = await pipeline("feature-extraction", MODEL);
      return async (text) => {
        const output = await extractor(text, {
          pooling: "mean",
          normalize: true,
        });
        return output.data;
      };
    },
  );
  embedder.catch(() => {
    embedder = undefined;
  });
  return embedder;
}
