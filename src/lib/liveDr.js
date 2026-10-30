/**
 * Live dimensionality reduction with DruidJS (issue #28), loaded only from the Advanced
 * panel. Runs in a module Web Worker (the page stays responsive and shows progress) and
 * falls back to the main thread where a module worker can't start.
 */

/**
 * Methods offered, with their parameters (Druid names) and iteration counts. Iterative
 * methods report progress; PCA and MDS are one step.
 */
export const DR_METHODS = [
  {
    id: "UMAP",
    label: "UMAP",
    iterations: 350,
    params: [
      {
        name: "n_neighbors",
        label: "Neighbors",
        value: 15,
        min: 2,
        max: 100,
        step: 1,
      },
      {
        name: "min_dist",
        label: "Min. distance",
        value: 0.1,
        min: 0,
        max: 1,
        step: 0.05,
      },
    ],
  },
  {
    id: "TSNE",
    label: "t-SNE",
    iterations: 500,
    params: [
      {
        name: "perplexity",
        label: "Perplexity",
        value: 30,
        min: 2,
        max: 100,
        step: 1,
      },
      {
        name: "epsilon",
        label: "Learning rate",
        value: 10,
        min: 1,
        max: 100,
        step: 1,
      },
    ],
  },
  {
    id: "PaCMAP",
    label: "PaCMAP",
    iterations: 450,
    params: [
      {
        name: "n_neighbors",
        label: "Neighbors",
        value: 10,
        min: 2,
        max: 100,
        step: 1,
      },
    ],
  },
  { id: "TriMap", label: "TriMap", iterations: 400, params: [] },
  { id: "PCA", label: "PCA", iterations: null, params: [] },
  { id: "MDS", label: "MDS", iterations: null, params: [] },
];

/** Default parameter values of a method, as `{name: value}`. */
export function defaultParams(methodId) {
  const method = DR_METHODS.find((m) => m.id === methodId);
  return Object.fromEntries(
    (method?.params ?? []).map((p) => [p.name, p.value]),
  );
}

/**
 * Runs one Druid method; `druid` is the library module. Self-contained (no outer references)
 * because its source is also shipped into the worker. Returns a Float64Array [x0, y0, x1, …].
 */
export function runDruid(
  druid,
  { method, params, seed, iterations, data, dims },
  onProgress = () => {},
) {
  const n = data.length / dims;
  const X = [];
  for (let i = 0; i < n; i++)
    X.push(Array.from(data.subarray(i * dims, (i + 1) * dims)));
  const dr = new druid[method](X, { ...params, d: 2, seed });
  let Y;
  if (iterations) {
    let step = 0;
    const every = Math.max(1, Math.round(iterations / 50));
    for (const y of dr.generator(iterations)) {
      Y = y;
      step++;
      if (step % every === 0) onProgress(step, iterations);
    }
  } else Y = dr.transform();
  const rows = typeof Y.to2dArray === "function" ? Y.to2dArray() : Y;
  const out = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[2 * i] = rows[i][0];
    out[2 * i + 1] = rows[i][1];
  }
  return out;
}

function workerSource(druidUrl) {
  return `import * as druid from ${JSON.stringify(druidUrl)};
const runDruid = ${runDruid.toString()};
self.onmessage = ({ data: job }) => {
  try {
    const coords = runDruid(druid, job, (step, total) => self.postMessage({ type: "progress", step, total }));
    self.postMessage({ type: "done", coords }, [coords.buffer]);
  } catch (error) {
    self.postMessage({ type: "error", message: String(error?.message ?? error) });
  }
};`;
}

function inWorker(job, onProgress, signal) {
  const druidUrl = new URL(
    import.meta.resolve("@saehrimnir/druidjs"),
    location.href,
  ).href;
  const url = URL.createObjectURL(
    new Blob([workerSource(druidUrl)], { type: "text/javascript" }),
  );
  return new Promise((resolve, reject) => {
    const worker = new Worker(url, { type: "module" });
    const finish = (fn, value) => {
      worker.terminate();
      URL.revokeObjectURL(url);
      fn(value);
    };
    signal?.addEventListener("abort", () =>
      finish(reject, new DOMException("Cancelled", "AbortError")),
    );
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") onProgress(data.step, data.total);
      else if (data.type === "done") finish(resolve, data.coords);
      else finish(reject, new Error(data.message));
    };
    // The worker script itself failed (e.g. no module workers): let the caller fall back
    worker.onerror = (event) => {
      event.preventDefault();
      finish(
        reject,
        Object.assign(new Error(event.message || "Worker failed"), {
          workerFailed: true,
        }),
      );
    };
    worker.postMessage({ ...job, data: job.data.slice() });
  });
}

async function inMainThread(job, onProgress) {
  const druid = await import("@saehrimnir/druidjs");
  // Let the "Computing…" status paint before the main thread is busy
  await new Promise((resolve) => setTimeout(resolve, 30));
  return runDruid(druid, job, onProgress);
}

/**
 * Computes a 2D projection of `data` (flat Float32Array, `dims` per row) with `method`.
 * Resolves to `{coords: Float64Array, ms, where: "worker" | "main thread"}`.
 */
export async function computeProjection(
  { method, params = defaultParams(method), seed = 42, data, dims },
  { onProgress = () => {}, signal } = {},
) {
  const iterations =
    DR_METHODS.find((m) => m.id === method)?.iterations ?? null;
  const job = { method, params, seed, iterations, data, dims };
  const start = performance.now();
  let coords;
  let where = "worker";
  try {
    if (typeof Worker === "undefined")
      throw Object.assign(new Error("No workers"), { workerFailed: true });
    coords = await inWorker(job, onProgress, signal);
  } catch (error) {
    if (!error.workerFailed) throw error;
    where = "main thread";
    coords = await inMainThread(job, onProgress);
  }
  return { coords, ms: Math.round(performance.now() - start), where };
}

/** `{id: [x, y]}` for the papers (row i ↔ papers[i]) from flat coordinates. */
export function toProjection(papers, coords) {
  return Object.fromEntries(
    papers.map((p, i) => [p.id, [coords[2 * i], coords[2 * i + 1]]]),
  );
}
