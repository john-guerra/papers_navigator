import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { buildId, stampVersion } from "../scripts/buildSw.js";

// src/sw.js is a classic script (no exports): run it in a sandbox and read its helpers.
const source = readFileSync(new URL("../src/sw.js", import.meta.url), "utf8");
const sandbox = { URL, Request };
vm.runInNewContext(source, sandbox);
const {
  strategyFor,
  pageKey,
  assetRefs,
  cacheName,
  isStaleCache,
  freshRequest,
} = sandbox;

const scope = "https://johnguerra.co/viz/papersNavigator/ieeevis2026/";
const at = (path) => new URL(path, scope).href;

describe("strategyFor", () => {
  it("uses network-first for pages", () => {
    expect(strategyFor(at("./"), scope)).toBe("network-first");
    expect(strategyFor(at("./index.html"), scope)).toBe("network-first");
    expect(
      strategyFor(at("./my-papers.html?now=2026-11-10T15:14:00Z"), scope),
    ).toBe("network-first");
  });

  it("uses cache-first for Framework's hashed assets", () => {
    for (const path of [
      "./_file/data/papers.943aaa37.json",
      "./_import/lib/rules.3e2d316f.js",
      "./_import/style.4eec3e5d.css",
      "./_node/htl@0.3.1/index.0caf36e7.js",
      "./_npm/d3-array@3.2.4/b8e751b6.js",
      "./_observablehq/client.6dc3f8d1.js",
      "./_observablehq/stdlib/inputs.f7bf0e12.css",
    ])
      expect(strategyFor(at(path), scope), path).toBe("cache-first");
  });

  it("doesn't cache-first unhashed assets (npm run dev serves them)", () => {
    expect(strategyFor(at("./_observablehq/client.js"), scope)).toBe(
      "network-first",
    );
    expect(strategyFor(at("./_import/lib/rules.js?sha=abc"), scope)).toBe(
      "network-first",
    );
    expect(strategyFor(at("./_file"), scope)).toBe("network-first");
  });

  it("leaves other origins alone (Transformers.js model and WASM, fonts)", () => {
    expect(
      strategyFor(
        "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx",
        scope,
      ),
    ).toBe("none");
    expect(
      strategyFor(
        "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort-wasm-simd-threaded.jsep.6f2a1b3c.wasm",
        scope,
      ),
    ).toBe("none");
    expect(
      strategyFor("https://fonts.googleapis.com/css2?family=Newsreader", scope),
    ).toBe("none");
  });

  it("leaves paths outside the scope and non-GET requests alone", () => {
    expect(
      strategyFor(
        "https://johnguerra.co/viz/papersNavigator/chi2026/index.html",
        scope,
      ),
    ).toBe("none");
    expect(strategyFor("https://johnguerra.co/", scope)).toBe("none");
    expect(strategyFor(at("./my-papers.html"), scope, "POST")).toBe("none");
  });
});

describe("pageKey", () => {
  it("drops the query and hash and treats / as index.html", () => {
    expect(pageKey(at("./?q=maps#x"))).toBe(at("./index.html"));
    expect(pageKey(at("./index.html"))).toBe(at("./index.html"));
    expect(pageKey(at("./my-papers.html?now=2026-11-10T15:14:00Z#p=1"))).toBe(
      at("./my-papers.html"),
    );
  });
});

describe("assetRefs", () => {
  it("finds the hashed preloads, stylesheets and FileAttachments of a built page", () => {
    const html = `
<link rel="stylesheet" type="text/css" href="./_import/style.4eec3e5d.css">
<link rel="modulepreload" href="./_observablehq/client.6dc3f8d1.js">
<link rel="modulepreload" href="./_import/lib/rules.3e2d316f.js">
<a href="./my-papers.html">My Papers</a>
<link rel="preconnect" href="https://fonts.gstatic.com">
<script type="module">
registerFile("./data/papers.json", {"name":"./data/papers.json","mimeType":"application/json","path":"./_file/data/papers.943aaa37.json","lastModified":1}, import.meta.url);
</script>`;
    expect(assetRefs(html, at("./my-papers.html"), scope)).toEqual([
      at("./_import/style.4eec3e5d.css"),
      at("./_observablehq/client.6dc3f8d1.js"),
      at("./_import/lib/rules.3e2d316f.js"),
      at("./_file/data/papers.943aaa37.json"),
    ]);
  });
});

describe("caches", () => {
  it("keeps one versioned cache per conference and only cleans its own old ones", () => {
    const other = "https://johnguerra.co/viz/papersNavigator/chi2026/";
    expect(cacheName(scope)).not.toBe(cacheName(other));
    expect(isStaleCache(cacheName(scope), scope)).toBe(false);
    expect(isStaleCache(`papersNavigator-v0:${scope}`, scope)).toBe(true);
    expect(isStaleCache(`papersNavigator-v0:${other}`, scope)).toBe(false);
    expect(isStaleCache("some-other-app", scope)).toBe(false);
  });
});

describe("freshRequest", () => {
  it("revalidates with the server instead of using the HTTP cache", () => {
    const original = new Request(at("./my-papers.html?now=x"), {
      redirect: "manual",
    });
    const fresh = freshRequest(original);
    expect(fresh.cache).toBe("no-cache");
    expect(fresh.url).toBe(original.url);
    expect(fresh.method).toBe("GET");
    expect(fresh.redirect).toBe("manual");
  });
});

describe("build id (scripts/buildSw.js)", () => {
  it("stamps the build id into VERSION, so each deploy gets a new cache", () => {
    const stamped = stampVersion(source, "abc123");
    expect(stamped).toContain('const VERSION = "v1-abc123";');
    const built = { URL, Request };
    vm.runInNewContext(stamped, built);
    expect(built.cacheName(scope)).toBe(`papersNavigator-v1-abc123:${scope}`);
    expect(built.isStaleCache(cacheName(scope), scope)).toBe(true);
  });

  it("fails loudly if sw.js has no VERSION line", () => {
    expect(() => stampVersion("const X = 1;", "abc")).toThrow(/VERSION/);
  });

  it("hashes the built pages: stable, order-independent, changes with content", () => {
    const a = { name: "index.html", content: "<p>a</p>" };
    const b = { name: "my-papers.html", content: "<p>b</p>" };
    expect(buildId([a, b])).toMatch(/^[0-9a-f]{12}$/);
    expect(buildId([a, b])).toBe(buildId([b, a]));
    expect(buildId([a, { ...b, content: "<p>c</p>" }])).not.toBe(
      buildId([a, b]),
    );
  });
});
