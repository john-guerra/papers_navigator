import { html } from "htl";
import { neighborRanks, qualityMetrics } from "../lib/drMetrics.js";
import { DR_METHODS, computeProjection, toProjection } from "../lib/liveDr.js";
import {
  clusterLabelsByKeyword,
  hdbscan,
  kmeans,
} from "../lib/liveClusters.js";

// Loaded with the panel (dynamic import), so Explore's first paint doesn't carry it
const STYLE = `
.advanced-dr-panel [hidden] { display: none !important; }
.advanced-dr-panel section { margin: var(--spacing-md, 12px) 0 var(--spacing-lg, 16px); }
.advanced-dr-panel h4 { margin: 0 0 var(--spacing-xs, 4px); font: var(--typography-label-md); }
.advanced-dr-panel .advanced-note { margin: 0 0 var(--spacing-sm, 8px); color: var(--color-on-surface-muted); font: var(--typography-body-sm); }
.advanced-dr-panel .advanced-fields { display: flex; flex-wrap: wrap; gap: var(--spacing-sm, 8px) var(--spacing-md, 12px); margin-bottom: var(--spacing-sm, 8px); }
.advanced-dr-panel label { display: flex; flex-direction: column; gap: 2px; color: var(--color-on-surface-muted); font: var(--typography-meta); }
.advanced-dr-panel input[type="number"] { width: 6.5em; }
.advanced-dr-panel input, .advanced-dr-panel select { min-height: 32px; font: var(--typography-body-sm); color: var(--color-on-surface); }
.advanced-dr-panel .advanced-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-sm, 8px); }
.advanced-dr-panel progress { width: 100%; accent-color: var(--color-primary); }
.advanced-dr-panel [role="status"] { margin: var(--spacing-xs, 4px) 0 0; font: var(--typography-body-sm); }
.advanced-dr-panel table { width: 100%; border-collapse: collapse; font: var(--typography-body-sm); font-variant-numeric: tabular-nums; }
.advanced-dr-panel th, .advanced-dr-panel td { padding: 4px 6px; border-bottom: 1px solid var(--color-outline); text-align: right; }
.advanced-dr-panel th:first-child, .advanced-dr-panel td:first-child { text-align: left; }
.advanced-dr-panel tr.is-current td:first-child { font-weight: 600; }
@media (max-width: 576px) {
  .advanced-dr-panel input, .advanced-dr-panel select, .advanced-dr-panel button { min-height: var(--spacing-touch, 44px); }
}
`;

const fmt = (v) => (v == null ? "…" : v.toFixed(3));

function numberField({ label, value, min, max, step }) {
  const input = html`<input
    type="number"
    value=${value}
    min=${min}
    max=${max}
    step=${step}
  />`;
  return { input, label: html`<label>${label}${input}</label>` };
}

/** Distinct labels: a repeated name gets the cluster number ("Maps (3)"). */
function distinct(labels) {
  const seen = new Map();
  labels.forEach((l) => seen.set(l, (seen.get(l) ?? 0) + 1));
  return labels.map((l, i) => (seen.get(l) > 1 ? `${l} (${i + 1})` : l));
}

/**
 * The Advanced panel's live tools (issue #28, US2.4), a reactive widget:
 * `.value = {projections, clusters}` where `projections` = `{name: {id: [x, y]}}` computed here
 * (one per method, newest last) and `clusters` = `{byId: {id: label | null}, on, count, noise}`
 * or null; it emits `input` when either changes.
 * - `projections`: the precomputed ones (`{method: {id: [x, y]}}`), listed in the quality table;
 * - `embeddings`: Float32Array, row i ↔ papers[i], `dims` per row;
 * - `currentProjection()`: name of the projection on the map (re-clustering uses it);
 * - `format(name)`: how projection names read elsewhere on the page.
 */
export function advancedPanel({
  papers,
  embeddings,
  dims,
  projections,
  currentProjection = () => Object.keys(projections)[0],
  format = (name) => name,
  clusterDefaults = {},
  seed = 42,
}) {
  const live = {};
  let liveSnapshot = {};
  let clusters = null;
  const all = () => ({ ...projections, ...live });

  const style = document.createElement("style");
  style.textContent = STYLE;
  const root = html`<div class="advanced-dr-panel">${style}</div>`;
  const emit = () => root.dispatchEvent(new Event("input", { bubbles: true }));
  Object.defineProperty(root, "value", {
    // Same objects until they change, so the page can compare by identity
    get: () => ({ projections: liveSnapshot, clusters }),
  });

  // --- Compute a projection (Druid) -------------------------------------------------------
  const methodSelect = html`<select>
    ${DR_METHODS.map((m) => html`<option value=${m.id}>${m.label}</option>`)}
  </select>`;
  const paramsBox = html`<span class="advanced-fields"></span>`;
  const seedField = numberField({
    label: "Seed",
    value: seed,
    min: 0,
    step: 1,
  });
  let paramInputs = [];
  const renderParams = () => {
    const method = DR_METHODS.find((m) => m.id === methodSelect.value);
    const fields = method.params.map((p) => ({
      name: p.name,
      ...numberField(p),
    }));
    paramInputs = fields;
    paramsBox.replaceChildren(...fields.map((f) => f.label), seedField.label);
  };
  methodSelect.onchange = renderParams;
  renderParams();
  const computeButton = html`<button type="button" class="btn-primary">
    Compute
  </button>`;
  const cancelButton = html`<button type="button" class="btn-text" hidden>
    Cancel
  </button>`;
  const progress = html`<progress max="1" value="0" hidden></progress>`;
  const computeStatus = html`<p role="status" aria-live="polite"></p>`;
  let controller = null;
  cancelButton.onclick = () => controller?.abort();
  computeButton.onclick = async () => {
    const method = DR_METHODS.find((m) => m.id === methodSelect.value);
    const params = Object.fromEntries(
      paramInputs.map((f) => [f.name, Number(f.input.value)]),
    );
    controller = new AbortController();
    computeButton.disabled = true;
    cancelButton.hidden = !method.iterations;
    progress.hidden = false;
    progress.removeAttribute("value");
    computeStatus.textContent = `Computing ${method.label} on ${papers.length} papers…`;
    try {
      const result = await computeProjection(
        {
          method: method.id,
          params,
          seed: Number(seedField.input.value),
          data: embeddings,
          dims,
        },
        {
          signal: controller.signal,
          onFallback: () => (cancelButton.hidden = true),
          onProgress: (step, total) => {
            progress.value = step / total;
            computeStatus.textContent = `Computing ${method.label}… iteration ${step} of ${total}`;
          },
        },
      );
      const name = `${method.label} (live)`;
      delete live[name]; // newest last
      live[name] = toProjection(papers, result.coords);
      liveSnapshot = { ...live };
      for (const key of results.keys())
        if (key.startsWith(`${name}|`)) results.delete(key);
      computeStatus.textContent = `${name} computed in ${(result.ms / 1000).toFixed(1)} s (${result.where}) and shown on the map.`;
      emit();
      refreshMetrics();
    } catch (error) {
      computeStatus.textContent =
        error.name === "AbortError"
          ? "Cancelled."
          : `Couldn't compute ${method.label}: ${error.message}`;
    } finally {
      computeButton.disabled = false;
      cancelButton.hidden = true;
      progress.hidden = true;
    }
  };

  // --- Re-cluster the current projection -------------------------------------------------
  const algorithmSelect = html`<select>
    <option value="hdbscan">HDBSCAN</option>
    <option value="kmeans">k-means</option>
  </select>`;
  const minSize = numberField({
    label: "Min. cluster size",
    value: clusterDefaults.minClusterSize ?? 12,
    min: 2,
    step: 1,
  });
  const minSamples = numberField({
    label: "Min. samples",
    value: clusterDefaults.minSamples ?? 3,
    min: 1,
    step: 1,
  });
  const kField = numberField({
    label: "Clusters (k)",
    value: 8,
    min: 2,
    max: 40,
    step: 1,
  });
  const clusterParams = html`<span class="advanced-fields"></span>`;
  const renderClusterParams = () =>
    clusterParams.replaceChildren(
      ...(algorithmSelect.value === "hdbscan"
        ? [minSize.label, minSamples.label]
        : [kField.label]),
    );
  algorithmSelect.onchange = renderClusterParams;
  renderClusterParams();
  const clusterButton = html`<button type="button" class="btn-secondary">
    Cluster
  </button>`;
  const clusterStatus = html`<p role="status" aria-live="polite"></p>`;
  clusterButton.onclick = () => {
    const on = currentProjection();
    const projection = all()[on];
    if (!projection) return;
    const points = papers.map((p) => projection[p.id] ?? [0, 0]);
    const labels =
      algorithmSelect.value === "hdbscan"
        ? hdbscan(points, {
            minClusterSize: Number(minSize.input.value),
            minSamples: Number(minSamples.input.value),
          })
        : kmeans(points, Number(kField.input.value), { seed });
    const names = distinct(clusterLabelsByKeyword(papers, labels));
    const byId = Object.fromEntries(
      papers.map((p, i) => [p.id, labels[i] < 0 ? null : names[labels[i]]]),
    );
    const noise = labels.filter((l) => l < 0).length;
    clusters = { byId, on, count: names.length, noise };
    clusterStatus.textContent = `${names.length} clusters on ${format(on)}${noise ? ` · ${noise} papers in none` : ""}. The map is colored by Cluster (live): the 3 largest get a color, the rest are Other.`;
    emit();
  };

  // --- Quality metrics --------------------------------------------------------------------
  const kMetric = numberField({
    label: "Neighbors (k)",
    value: 10,
    min: 1,
    max: 100,
    step: 1,
  });
  const tbody = html`<tbody></tbody>`;
  const metricsStatus = html`<p class="advanced-note" aria-live="polite"></p>`;
  let highRanks = null;
  const results = new Map(); // `${name}|${k}` → {trustworthiness, continuity}
  let pending = 0;
  const renderTable = () => {
    const k = Number(kMetric.input.value);
    const current = currentProjection();
    tbody.replaceChildren(
      ...Object.keys(all()).map((name) => {
        const m = results.get(`${name}|${k}`);
        return html`<tr class=${name === current ? "is-current" : ""}>
          <td>${format(name)}</td>
          <td>${fmt(m?.trustworthiness)}</td>
          <td>${fmt(m?.continuity)}</td>
        </tr>`;
      }),
    );
  };
  async function refreshMetrics() {
    const run = ++pending;
    const k = Number(kMetric.input.value);
    const max = Math.floor((papers.length - 1) / 2);
    if (!(Number.isInteger(k) && k >= 1 && k <= max)) {
      metricsStatus.textContent = `k must be a whole number from 1 to ${max}.`;
      return;
    }
    renderTable();
    metricsStatus.textContent = "Computing…";
    await new Promise((resolve) => setTimeout(resolve, 30)); // let "Computing…" paint
    const start = performance.now();
    highRanks ??= neighborRanks(embeddings, { dims });
    for (const [name, projection] of Object.entries(all())) {
      if (run !== pending) return;
      if (results.has(`${name}|${k}`)) continue;
      results.set(
        `${name}|${k}`,
        qualityMetrics(
          highRanks,
          papers.map((p) => projection[p.id] ?? [0, 0]),
          k,
        ),
      );
      renderTable();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    metricsStatus.textContent = `Computed in ${Math.round(performance.now() - start)} ms against the ${dims}-dimensional embeddings (Euclidean).`;
  }
  kMetric.input.addEventListener("change", refreshMetrics);

  root.append(
    html`<section>
        <h4>Compute a projection</h4>
        <p class="advanced-note">
          DruidJS runs in your browser on the ${dims}-dimensional embeddings;
          the result joins the Projection list and replaces the map (the map
          selection resets).
        </p>
        <div class="advanced-fields"><label>Method${methodSelect}</label></div>
        ${paramsBox}
        <div class="advanced-actions">${computeButton}${cancelButton}</div>
        ${progress}${computeStatus}
        <p class="advanced-note">
          Projections by
          <a
            href="https://github.com/saehm/druidjs"
            target="_blank"
            rel="noopener"
            >DruidJS</a
          >
          (René Cutura, LGPL-3.0-or-later;
          <a
            href="https://www.gnu.org/licenses/lgpl-3.0.html"
            target="_blank"
            rel="noopener"
            >license</a
          >).
        </p>
      </section>
      <section>
        <h4>Re-cluster the map</h4>
        <p class="advanced-note">
          Groups the papers on the projection shown on the map; adds “Cluster
          (live)” to Color by. Names are each cluster's most distinctive author
          keywords.
        </p>
        <div class="advanced-fields">
          <label>Algorithm${algorithmSelect}</label>
        </div>
        ${clusterParams}
        <div class="advanced-actions">${clusterButton}</div>
        ${clusterStatus}
      </section>
      <section>
        <h4>Projection quality</h4>
        <p class="advanced-note">
          Trustworthiness: are a paper's k nearest neighbors on the map also
          near in the embeddings? Continuity: do its true neighbors stay near on
          the map? 1 = perfect.
        </p>
        <div class="advanced-fields">${kMetric.label}</div>
        <table>
          <thead>
            <tr>
              <th>Projection</th>
              <th>Trustworthiness</th>
              <th>Continuity</th>
            </tr>
          </thead>
          ${tbody}
        </table>
        ${metricsStatus}
      </section>`,
  );

  root.refreshCurrent = renderTable; // the page calls this when the map's projection changes
  refreshMetrics();
  return root;
}
