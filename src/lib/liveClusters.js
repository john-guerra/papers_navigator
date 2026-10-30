/**
 * Live re-clustering of a 2D projection in the browser (issue #28). Pure; no dependencies.
 * Labels are integers per point, renumbered so cluster 0 is the largest (ties: first seen),
 * -1 = noise — the same convention as pipeline/clusters.py.
 */

const sq = (a, b) => {
  let s = 0;
  for (let t = 0; t < a.length; t++) s += (a[t] - b[t]) ** 2;
  return s;
};

/** Deterministic PRNG in [0, 1) (mulberry32). */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Renumber labels: largest cluster 0, ties by first appearance; negatives stay -1. */
function renumber(raw) {
  const counts = new Map();
  const first = new Map();
  raw.forEach((label, i) => {
    if (label < 0) return;
    counts.set(label, (counts.get(label) ?? 0) + 1);
    if (!first.has(label)) first.set(label, i);
  });
  const order = [...counts.keys()].sort(
    (a, b) => counts.get(b) - counts.get(a) || first.get(a) - first.get(b),
  );
  const remap = new Map(order.map((label, i) => [label, i]));
  return raw.map((label) => (label < 0 ? -1 : remap.get(label)));
}

/** k-means (k-means++ seeding, Lloyd iterations), deterministic for a `seed`. */
export function kmeans(points, k, { seed = 42, maxIter = 100 } = {}) {
  const n = points.length;
  k = Math.max(1, Math.min(k, n));
  if (!n) return [];
  const rand = random(seed);
  const centers = [points[Math.floor(rand() * n)].slice()];
  const best = points.map((p) => sq(p, centers[0]));
  while (centers.length < k) {
    const total = best.reduce((a, b) => a + b, 0);
    let target = rand() * total;
    let pick = n - 1;
    for (let i = 0; i < n; i++) {
      target -= best[i];
      if (target < 0) {
        pick = i;
        break;
      }
    }
    centers.push(points[pick].slice());
    for (let i = 0; i < n; i++)
      best[i] = Math.min(best[i], sq(points[i], centers.at(-1)));
  }
  const labels = new Array(n).fill(-1);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let c = 0;
      for (let j = 1; j < k; j++)
        if (sq(points[i], centers[j]) < sq(points[i], centers[c])) c = j;
      if (labels[i] !== c) {
        labels[i] = c;
        changed = true;
      }
    }
    if (!changed) break;
    for (let j = 0; j < k; j++) {
      const members = points.filter((_, i) => labels[i] === j);
      if (!members.length) continue;
      centers[j] = centers[j].map(
        (_, t) => members.reduce((s, p) => s + p[t], 0) / members.length,
      );
    }
  }
  return renumber(labels);
}

/**
 * HDBSCAN (Campello et al. 2013) with excess-of-mass cluster selection, as in
 * sklearn.cluster.HDBSCAN's defaults (Euclidean, no single cluster, epsilon 0). O(n²): fine for
 * the few hundred papers of a conference. `minSamples` counts the point itself, like sklearn.
 */
export function hdbscan(
  points,
  { minClusterSize = 12, minSamples = minClusterSize } = {},
) {
  const n = points.length;
  if (n < Math.max(minClusterSize, minSamples + 1))
    return new Array(n).fill(-1);
  const dist = (i, j) => Math.sqrt(sq(points[i], points[j]));

  // Core distance: distance to the minSamples-th nearest point, the point itself included
  const core = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ds = [];
    for (let j = 0; j < n; j++) ds.push(dist(i, j));
    ds.sort((a, b) => a - b);
    core[i] = ds[Math.min(minSamples, n) - 1];
  }
  const reach = (i, j) => Math.max(core[i], core[j], dist(i, j));

  // Minimum spanning tree of the mutual reachability graph (Prim, dense)
  const inTree = new Uint8Array(n);
  const best = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const edges = [];
  let current = 0;
  for (let step = 0; step < n - 1; step++) {
    inTree[current] = 1;
    let next = -1;
    for (let j = 0; j < n; j++) {
      if (inTree[j]) continue;
      const d = reach(current, j);
      if (d < best[j]) {
        best[j] = d;
        from[j] = current;
      }
      if (next < 0 || best[j] < best[next]) next = j;
    }
    edges.push([from[next], next, best[next]]);
    current = next;
  }
  edges.sort((a, b) => a[2] - b[2]);

  // Single-linkage tree: node n + s merges two components at edges[s] (union-find)
  const parent = new Int32Array(2 * n - 1).fill(-1);
  const size = new Int32Array(2 * n - 1).fill(1);
  const children = [];
  const height = new Float64Array(2 * n - 1);
  const uf = Int32Array.from({ length: 2 * n - 1 }, (_, i) => i);
  const findRoot = (x) => {
    while (uf[x] !== x) x = uf[x] = uf[uf[x]];
    return x;
  };
  edges.forEach(([a, b, d], s) => {
    const node = n + s;
    const ra = findRoot(a);
    const rb = findRoot(b);
    children[node] = [ra, rb];
    size[node] = size[ra] + size[rb];
    height[node] = d;
    parent[ra] = parent[rb] = node;
    uf[ra] = uf[rb] = node;
  });
  const root = 2 * n - 2;

  // Condensed tree: clusters (ids from 0) with their birth λ, points falling out (λ), children
  const lambda = (d) => (d > 0 ? 1 / d : Infinity);
  const clusters = [{ birth: 0, parent: -1, children: [], fallen: [] }];
  const leaves = (node, out = []) => {
    const stack = [node];
    while (stack.length) {
      const x = stack.pop();
      if (x < n) out.push(x);
      else stack.push(...children[x]);
    }
    return out;
  };
  const stack = [[root, 0]];
  while (stack.length) {
    const [node, c] = stack.pop();
    if (node < n) {
      clusters[c].fallen.push([node, lambda(0)]);
      continue;
    }
    const l = lambda(height[node]);
    const [a, b] = children[node];
    const bigA = size[a] >= minClusterSize;
    const bigB = size[b] >= minClusterSize;
    if (bigA && bigB) {
      for (const child of [a, b]) {
        const id = clusters.length;
        clusters.push({
          birth: l,
          parent: c,
          children: [],
          fallen: [],
          size: size[child],
        });
        clusters[c].children.push(id);
        stack.push([child, id]);
      }
    } else {
      for (const [child, big] of [
        [a, bigA],
        [b, bigB],
      ]) {
        if (big) stack.push([child, c]);
        else for (const p of leaves(child)) clusters[c].fallen.push([p, l]);
      }
    }
  }

  // Stability: Σ (λ_p − λ_birth) over points, children clusters count size × (λ_split − λ_birth)
  const stability = clusters.map((cl) => {
    let s = 0;
    for (const [, l] of cl.fallen)
      s += Math.min(l, Number.MAX_VALUE) - cl.birth;
    for (const id of cl.children)
      s += clusters[id].size * (clusters[id].birth - cl.birth);
    return s;
  });

  // Excess of mass, leaves up (children always have larger ids); the root is never selected
  const selected = new Uint8Array(clusters.length);
  for (let id = clusters.length - 1; id >= 1; id--) {
    const sub = clusters[id].children.reduce((s, c) => s + stability[c], 0);
    if (clusters[id].children.length && sub > stability[id])
      stability[id] = sub;
    else {
      selected[id] = 1;
      const descendants = [...clusters[id].children];
      while (descendants.length) {
        const d = descendants.pop();
        selected[d] = 0;
        descendants.push(...clusters[d].children);
      }
    }
  }

  // Each point: the selected cluster it belongs to (itself or an ancestor), else noise
  const labels = new Array(n).fill(-1);
  clusters.forEach((cl, id) => {
    let owner = id;
    while (owner > 0 && !selected[owner]) owner = clusters[owner].parent;
    if (owner > 0) for (const [p] of cl.fallen) labels[p] = owner;
  });
  return renumber(labels);
}

const display = (term) =>
  /[A-Z]/.test(term.slice(1)) ? term : term.toLowerCase();

/**
 * A short name per cluster (index = cluster id): its most distinctive author keywords
 * (count in the cluster × log(1 + clusters / clusters using it), a cheap class-based TF-IDF),
 * each in its most common spelling. "Cluster n" when a cluster has no keywords.
 */
export function clusterLabelsByKeyword(papers, labels, { top = 2 } = {}) {
  const k = Math.max(-1, ...labels) + 1;
  const counts = Array.from({ length: k }, () => new Map());
  const spellings = new Map();
  papers.forEach((p, i) => {
    const c = labels[i];
    if (c < 0) return;
    for (const raw of new Set(p.keywords ?? [])) {
      const key = raw.trim().toLowerCase();
      if (!key) continue;
      counts[c].set(key, (counts[c].get(key) ?? 0) + 1);
      const forms = spellings.get(key) ?? new Map();
      forms.set(raw.trim(), (forms.get(raw.trim()) ?? 0) + 1);
      spellings.set(key, forms);
    }
  });
  const usedBy = new Map();
  for (const m of counts)
    for (const key of m.keys()) usedBy.set(key, (usedBy.get(key) ?? 0) + 1);
  return counts.map((m, c) => {
    const terms = [...m]
      .map(([key, count]) => [key, count * Math.log(1 + k / usedBy.get(key))])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, top)
      .map(([key]) =>
        display([...spellings.get(key)].sort((a, b) => b[1] - a[1])[0][0]),
      );
    if (!terms.length) return `Cluster ${c + 1}`;
    const label = terms.join(", ");
    return label[0].toUpperCase() + label.slice(1);
  });
}
