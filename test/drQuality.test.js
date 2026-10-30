import { readFileSync } from "node:fs";
import zadu from "zadu-js";
import { describe, expect, it } from "vitest";
import {
  localTrustworthinessContinuity,
  neighborRanks,
  qualityMetrics,
} from "../src/lib/drMetrics.js";
import {
  QUALITY_METRICS,
  createQualityCache,
  createQualityRunner,
  measureQuality,
  seededRandom,
  steadinessCohesiveness,
} from "../src/lib/drQuality.js";

// 30 points in 4-d: three tight groups; a projection that keeps them and one that mixes them
const groups = Array.from({ length: 30 }, (_, i) => Math.floor(i / 10));
const high = new Float32Array(
  groups.flatMap((g, i) => [g * 10 + (i % 3) * 0.1, g * -4, (i % 2) * 0.2, g]),
);
const kept = new Float64Array(
  groups.flatMap((g, i) => [g * 20 + (i % 5) * 0.3, (i % 2) * 0.4]),
);
const mixed = new Float64Array(
  groups.flatMap((_, i) => [(i * 7) % 30, (i * 11) % 13]),
);
const rows = (flat, d) =>
  Array.from({ length: flat.length / d }, (_, i) =>
    Array.from(flat.subarray(i * d, i * d + d)),
  );

describe("localTrustworthinessContinuity", () => {
  // Hand-checked (see drMetrics.test.js): 4 points, k = 1, the projection swaps p0 ↔ p3.
  // Per-point penalties (scale 2 / (k·(2n − 3k − 1)) = 1/2): T: p0 1, p1 2, p2 0, p3 1;
  // C: p0 1, p1 2, p2 0, p3 1 ⇒ local = 1 − penalty / 2.
  it("splits the penalty per point and averages to the global score", () => {
    const h = neighborRanks([[0], [1], [3], [7]]);
    const l = neighborRanks([[7], [1], [3], [0]]);
    const { trustworthiness: t, continuity: c } =
      localTrustworthinessContinuity(h, l, 1);
    expect(Array.from(t.localScores)).toEqual([0.5, 0, 1, 0.5]);
    expect(Array.from(c.localScores)).toEqual([0.5, 0, 1, 0.5]);
    expect(t.score).toBeCloseTo(0.5, 12);
    expect(c.score).toBeCloseTo(0.5, 12);
  });

  it("matches the global metrics (sklearn definition) on a larger case", () => {
    const h = neighborRanks(high, { dims: 4 });
    const local = localTrustworthinessContinuity(
      h,
      neighborRanks(mixed, { dims: 2 }),
      5,
    );
    const global = qualityMetrics(h, rows(mixed, 2), 5);
    expect(local.trustworthiness.score).toBeCloseTo(global.trustworthiness, 12);
    expect(local.continuity.score).toBeCloseTo(global.continuity, 12);
  });

  it("is self-contained, so its source can run in a worker", () => {
    const rebuilt = new Function(
      `return ${localTrustworthinessContinuity.toString()}`,
    )();
    const h = neighborRanks([[0], [1], [3], [7]]);
    expect(rebuilt(h, h, 1).trustworthiness.score).toBe(1);
  });
});

describe("zadu-js trustworthiness differs from sklearn by one rank", () => {
  // zadu-js 1.0.0 ranks the nearest neighbour 0 (sklearn: 1), so every false neighbour is
  // penalized one rank less and its score is higher. We keep our (sklearn) T&C.
  it("scores higher than ours by exactly norm × (number of false neighbours)", () => {
    const h = neighborRanks(high, { dims: 4 });
    const l = neighborRanks(mixed, { dims: 2 });
    const k = 5;
    const n = 30;
    const ours = localTrustworthinessContinuity(h, l, k).trustworthiness.score;
    const theirs = zadu.trustworthiness(rows(high, 4), rows(mixed, 2), k).score;
    let falseNeighbours = 0;
    for (let i = 0; i < n * n; i++)
      if (l[i] >= 1 && l[i] <= k && h[i] > k) falseNeighbours++;
    expect(theirs - ours).toBeCloseTo(
      (2 / (n * k * (2 * n - 3 * k - 1))) * falseNeighbours,
      12,
    );
  });
});

describe("vendored zadu-js S&C", () => {
  // src/vendor/zadu-js is zadu-js at the pinned commit (package.json devDependency), with
  // one change: hdbscan-ts is imported as a default export (it is CommonJS)
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const upstream = "../node_modules/zadu-js/src/";
  const vendored = "../src/vendor/zadu-js/";

  it("matches upstream except for the hdbscan-ts import", () => {
    for (const file of [
      "core/snn.js",
      "core/randomWalk.js",
      "core/distance.js",
    ])
      expect(read(vendored + file)).toBe(read(upstream + file));
    const file = "metrics/cluster/steadiness_cohesiveness.js";
    const ours = read(vendored + file).split("\n");
    const theirs = read(upstream + file).split("\n");
    const changed = ours.filter((line) => !theirs.includes(line));
    expect(changed).toEqual([
      "// Vendored change (papers navigator): hdbscan-ts is CommonJS; bundlers expose it as a default export",
      "import hdbscanTs from 'hdbscan-ts';",
      "const { HDBSCAN } = hdbscanTs;",
    ]);
    expect(theirs.filter((line) => !ours.includes(line))).toEqual([
      "import { HDBSCAN } from 'hdbscan-ts';",
    ]);
  });

  it("gives the same scores as upstream for the same random numbers", () => {
    const job = { high, dims: 4, low: mixed, k: 4, iterations: 10, seed: 3 };
    const ours = steadinessCohesiveness(job);
    const random = Math.random;
    Math.random = seededRandom(3);
    const theirs = zadu.steadinessCohesiveness(rows(high, 4), rows(mixed, 2), {
      k: 4,
      iteration: 10,
    });
    Math.random = random;
    expect(ours.steadiness.score).toBe(theirs.steadiness.score);
    expect(ours.cohesiveness.score).toBe(theirs.cohesiveness.score);
  });
});

describe("steadinessCohesiveness (zadu-js)", () => {
  const job = { high, dims: 4, k: 4, iterations: 20, seed: 7 };

  it("returns global and per-point scores in [0, 1]", () => {
    const r = steadinessCohesiveness({ ...job, low: mixed });
    for (const m of [r.steadiness, r.cohesiveness]) {
      expect(m.score).toBeGreaterThanOrEqual(0);
      expect(m.score).toBeLessThanOrEqual(1);
      expect(m.localScores).toHaveLength(30);
      for (const v of m.localScores) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it("is deterministic for a seed and restores Math.random", () => {
    const random = Math.random;
    const a = steadinessCohesiveness({ ...job, low: mixed });
    const b = steadinessCohesiveness({ ...job, low: mixed });
    expect(a.steadiness.score).toBe(b.steadiness.score);
    expect(Array.from(a.cohesiveness.localScores)).toEqual(
      Array.from(b.cohesiveness.localScores),
    );
    expect(Math.random).toBe(random);
  });

  it("rates a projection that keeps the groups above one that mixes them", () => {
    const good = steadinessCohesiveness({ ...job, low: kept });
    const bad = steadinessCohesiveness({ ...job, low: mixed });
    expect(good.steadiness.score).toBeGreaterThan(bad.steadiness.score);
    expect(good.cohesiveness.score).toBeGreaterThan(bad.cohesiveness.score);
  });
});

describe("measureQuality", () => {
  it("computes only the requested metric groups and reuses the high-d ranks", () => {
    const state = { high, dims: 4 };
    const tnc = measureQuality(state, {
      points: kept,
      k: 5,
      metrics: ["tnc"],
    });
    expect(Object.keys(tnc).sort()).toEqual(["continuity", "trustworthiness"]);
    const ranks = state.highRanks;
    expect(ranks).toBeInstanceOf(Int32Array);
    const snc = measureQuality(state, {
      points: kept,
      k: 5,
      iterations: 10,
      seed: 1,
      metrics: ["snc"],
    });
    expect(Object.keys(snc).sort()).toEqual(["cohesiveness", "steadiness"]);
    expect(state.highRanks).toBe(ranks);
  });
});

describe("createQualityRunner", () => {
  it("falls back to the main thread without workers", async () => {
    const runner = createQualityRunner({ embeddings: high, dims: 4 });
    const { results, where } = await runner.measure({
      points: kept,
      k: 5,
      iterations: 10,
      seed: 1,
      metrics: ["tnc", "snc"],
    });
    expect(where).toBe("main thread");
    expect(Object.keys(results).sort()).toEqual(
      QUALITY_METRICS.map((m) => m.id).sort(),
    );
    runner.terminate();
  });
});

describe("createQualityCache", () => {
  const result = (v) => ({ score: v, localScores: new Float64Array([v, v]) });

  it("keys T&C by projection and k, S&C also by iterations and seed", () => {
    const cache = createQualityCache();
    const params = { k: 10, iterations: 150, seed: 42 };
    cache.set(
      "umap",
      { trustworthiness: result(0.9), steadiness: result(0.7) },
      params,
    );
    expect(cache.get("umap", "trustworthiness", params).score).toBe(0.9);
    expect(
      cache.get("umap", "trustworthiness", { ...params, iterations: 50 }).score,
    ).toBe(0.9);
    expect(
      cache.get("umap", "steadiness", { ...params, iterations: 50 }),
    ).toBeUndefined();
    expect(
      cache.get("umap", "trustworthiness", { ...params, k: 5 }),
    ).toBeUndefined();
    expect(cache.get("tsne", "trustworthiness", params)).toBeUndefined();
    expect(cache.has("umap", "steadiness", params)).toBe(true);
  });

  it("forgets a projection that was recomputed", () => {
    const cache = createQualityCache();
    const params = { k: 10, iterations: 150, seed: 42 };
    cache.set("UMAP (live)", { continuity: result(0.8) }, params);
    cache.set("UMAP (live) 2", { continuity: result(0.8) }, params);
    cache.forget("UMAP (live)");
    expect(cache.get("UMAP (live)", "continuity", params)).toBeUndefined();
    expect(cache.get("UMAP (live) 2", "continuity", params)).toBeDefined();
  });
});
