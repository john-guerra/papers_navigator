/**
 * Projection quality for the Advanced panel (#83), in a module Web Worker (falls back to the
 * main thread where one can't start), loaded only with the panel.
 * - Trustworthiness & Continuity: ours (drMetrics.js, same as sklearn). zadu-js ranks the
 *   nearest neighbour 0 instead of 1, so it penalizes each false/missing neighbour one rank
 *   less and scores slightly higher (+0.001 to +0.002 on IEEE VIS 2026, k = 5 and 10).
 * - Steadiness & Cohesiveness (Jeon et al. 2021): zadu-js (src/vendor/zadu-js: its npm 1.0.0
 *   has no S&C yet, and its CommonJS hdbscan-ts import needs a one-line change in browsers).
 *   They sample random walks; we seed them (zadu-js calls Math.random, which we swap for a
 *   seeded generator during the synchronous call).
 * Every metric has a global `score` and per-point `localScores` (row i ↔ papers[i]).
 */
import { localTrustworthinessContinuity, neighborRanks } from "./drMetrics.js";
import zaduSteadinessCohesiveness from "../vendor/zadu-js/metrics/cluster/steadiness_cohesiveness.js";

export const QUALITY_METRICS = [
  {
    id: "trustworthiness",
    label: "Trustworthiness",
    header: "Trust\u00adworthi\u00adness",
    group: "tnc",
  },
  {
    id: "continuity",
    label: "Continuity",
    header: "Contin\u00aduity",
    group: "tnc",
  },
  {
    id: "steadiness",
    label: "Steadiness",
    header: "Steadi\u00adness",
    group: "snc",
  },
  {
    id: "cohesiveness",
    label: "Cohesiveness",
    header: "Cohesive\u00adness",
    group: "snc",
  },
];

/** A seeded uniform [0, 1) generator (mulberry32). */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Steadiness & Cohesiveness with zadu-js, seeded. `high`: flat embeddings (`dims` per row);
 * `low`: flat [x0, y0, x1, …]. Returns `{steadiness: {score, localScores}, cohesiveness: {…}}`.
 */
export function steadinessCohesiveness({
  high,
  dims,
  low,
  k,
  iterations,
  seed,
}) {
  const n = low.length / 2;
  const X = [];
  const Y = [];
  for (let i = 0; i < n; i++) {
    X.push(Array.from(high.subarray(i * dims, (i + 1) * dims)));
    Y.push([low[2 * i], low[2 * i + 1]]);
  }
  const saved = Math.random;
  Math.random = seededRandom(seed);
  let result;
  try {
    result = zaduSteadinessCohesiveness(X, Y, { k, iteration: iterations });
  } finally {
    Math.random = saved;
  }
  const pick = ({ score, localScores }) => ({
    score,
    localScores: Float64Array.from(localScores),
  });
  return {
    steadiness: pick(result.steadiness),
    cohesiveness: pick(result.cohesiveness),
  };
}

/**
 * The requested metric groups (`metrics`: "tnc" and/or "snc") for one projection (`points`:
 * flat [x0, y0, …]). `state = {high, dims}` keeps the high-dimensional ranks between calls.
 */
export function measureQuality(
  state,
  { points, k, iterations, seed, metrics },
) {
  const out = {};
  if (metrics.includes("tnc")) {
    state.highRanks ??= neighborRanks(state.high, { dims: state.dims });
    const lowRanks = neighborRanks(points, { dims: 2 });
    Object.assign(
      out,
      localTrustworthinessContinuity(state.highRanks, lowRanks, k),
    );
  }
  if (metrics.includes("snc"))
    Object.assign(
      out,
      steadinessCohesiveness({
        high: state.high,
        dims: state.dims,
        low: points,
        k,
        iterations,
        seed,
      }),
    );
  return out;
}

// The worker imports this very module (by its served URL), so it runs the same code
function workerSource(moduleUrl) {
  return `import { measureQuality } from ${JSON.stringify(moduleUrl)};
let state = null;
self.onmessage = ({ data }) => {
  if (data.type === "init") return void (state = { high: data.high, dims: data.dims });
  try {
    self.postMessage({ id: data.id, results: measureQuality(state, data.job) });
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error?.message ?? error) });
  }
};`;
}

/**
 * A quality runner for one set of embeddings (flat Float32Array, `dims` per row):
 * `measure({points, k, iterations, seed, metrics})` resolves to
 * `{results: {metricId: {score, localScores}}, ms, where: "worker" | "main thread"}`.
 * One worker serves every call (it keeps the high-dimensional ranks); `terminate()` ends it.
 */
export function createQualityRunner({ embeddings, dims }) {
  let worker = null;
  let url = null;
  let failed = typeof Worker === "undefined";
  let nextId = 0;
  const pending = new Map();
  const mainState = { high: embeddings, dims };

  const stop = () => {
    worker?.terminate();
    if (url) URL.revokeObjectURL(url);
    worker = url = null;
  };
  const start = () => {
    if (worker) return worker;
    url = URL.createObjectURL(
      new Blob([workerSource(new URL(import.meta.url, location.href).href)], {
        type: "text/javascript",
      }),
    );
    worker = new Worker(url, { type: "module" });
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      if (data.error) job.reject(new Error(data.error));
      else job.resolve(data.results);
    };
    // The worker script itself failed (e.g. no module workers): fall back for good
    worker.onerror = (event) => {
      event.preventDefault();
      failed = true;
      stop();
      for (const job of pending.values())
        job.reject(
          Object.assign(new Error("Worker failed"), { workerFailed: true }),
        );
      pending.clear();
    };
    worker.postMessage({ type: "init", high: embeddings.slice(), dims });
    return worker;
  };

  async function inMainThread(job) {
    // Let the "Computing…" status paint before the main thread is busy
    await new Promise((resolve) => setTimeout(resolve, 30));
    return measureQuality(mainState, job);
  }

  return {
    async measure(job) {
      const t0 = performance.now();
      if (!failed) {
        try {
          const results = await new Promise((resolve, reject) => {
            const id = ++nextId;
            pending.set(id, { resolve, reject });
            start().postMessage({ id, job });
          });
          return {
            results,
            ms: Math.round(performance.now() - t0),
            where: "worker",
          };
        } catch (error) {
          if (!error.workerFailed) throw error;
        }
      }
      const results = await inMainThread(job);
      return {
        results,
        ms: Math.round(performance.now() - t0),
        where: "main thread",
      };
    },
    terminate: stop,
  };
}

/**
 * Results per projection, k and metric (S&C also per iterations and seed, which change
 * them), so per-point scores are computed once: `get(projection, metric, params)` →
 * `{score, localScores}` or undefined.
 */
export function createQualityCache() {
  const entries = new Map();
  const group = (metric) => QUALITY_METRICS.find((m) => m.id === metric)?.group;
  const key = (projection, metric, { k, iterations, seed }) =>
    JSON.stringify(
      group(metric) === "snc"
        ? [projection, metric, k, iterations, seed]
        : [projection, metric, k],
    );
  return {
    get: (projection, metric, params) =>
      entries.get(key(projection, metric, params)),
    has: (projection, metric, params) =>
      entries.has(key(projection, metric, params)),
    set(projection, results, params) {
      for (const [metric, value] of Object.entries(results))
        entries.set(key(projection, metric, params), value);
    },
    forget(projection) {
      for (const k of [...entries.keys()])
        if (JSON.parse(k)[0] === projection) entries.delete(k);
    },
  };
}
