import { describe, expect, it } from "vitest";
import { isSafariBelow26, ortWasmPaths } from "../src/lib/embedder.js";

const urls = {
  asyncify: { mjs: "a.mjs", wasm: "a.wasm" },
  plain: { mjs: "p.mjs", wasm: "p.wasm" },
};
const chrome = {
  vendor: "Google Inc.",
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
};
const safari = (version) => ({
  vendor: "Apple Computer, Inc.",
  userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${version} Mobile/15E148 Safari/604.1`,
});

describe("isSafariBelow26", () => {
  it("matches Transformers.js: Safari < 26 only", () => {
    expect(isSafariBelow26(chrome)).toBe(false);
    expect(isSafariBelow26(safari(18))).toBe(true);
    expect(isSafariBelow26(safari(26))).toBe(false);
    expect(isSafariBelow26({})).toBe(false);
    expect(
      isSafariBelow26({
        ...safari(18),
        userAgent: safari(18).userAgent + " CriOS/141",
      }),
    ).toBe(false);
  });
});

describe("ortWasmPaths (self-hosted ONNX runtime, #21)", () => {
  it("uses the asyncify build, like Transformers.js's default", () => {
    expect(ortWasmPaths(chrome, urls)).toEqual(urls.asyncify);
    expect(ortWasmPaths({ ...safari(18), gpu: {} }, urls)).toEqual(
      urls.asyncify,
    );
  });

  it("uses the plain build on Safari < 26 without WebGPU", () => {
    expect(ortWasmPaths(safari(18), urls)).toEqual(urls.plain);
  });

  it("returns a copy (Transformers.js swaps .mjs for a blob URL in place)", () => {
    expect(ortWasmPaths(chrome, urls)).not.toBe(urls.asyncify);
  });

  it("points at the onnxruntime-web files by default, not a CDN", () => {
    const { mjs, wasm } = ortWasmPaths(chrome);
    expect(mjs).toMatch(
      /onnxruntime-web.*ort-wasm-simd-threaded\.asyncify\.mjs$/,
    );
    expect(wasm).toMatch(
      /onnxruntime-web.*ort-wasm-simd-threaded\.asyncify\.wasm$/,
    );
    expect(wasm).not.toMatch(/jsdelivr/);
  });
});
