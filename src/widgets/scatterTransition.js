/**
 * Plans the scatterplot's animated transition from what was on screen (a snapshot of the
 * previous chart) to new data (#82). Pure: the chart tweens one signal (`tm`, elapsed ms) and
 * Vega computes each point's position from the fields planned here.
 */

/** Cubic ease-in-out on [0, 1]; `easeExpr(p)` is the same curve as a Vega expression. */
export const ease = (p) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
export const easeExpr = (p) =>
  `(${p} < 0.5 ? 4 * ${p} * ${p} * ${p} : 1 - pow(-2 * ${p} + 2, 3) / 2)`;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const extent = (values) => [Math.min(...values), Math.max(...values)];
const finite = (domain) => Boolean(domain?.every(Number.isFinite));

/**
 * Stage start times: one stage per group (largest first, the null group last) when `stageOf`
 * is given, else a single stage. Each stage lasts `duration` ms and the next one starts
 * `stagger` ms later; the whole motion lasts at most 3 × duration however many groups.
 */
export function stagePlan(data, { duration, stageOf = null }) {
  if (!stageOf) return { startOf: () => 0, total: duration, stages: 1 };
  const counts = new Map();
  for (const d of data) {
    const key = stageOf(d) ?? null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const order = [...counts]
    .sort(
      ([a, na], [b, nb]) =>
        (a == null) - (b == null) || nb - na || String(a).localeCompare(b),
    )
    .map(([key]) => key);
  const k = order.length;
  const stagger = k > 1 ? Math.min(duration / 2, (2 * duration) / (k - 1)) : 0;
  const index = new Map(order.map((key, i) => [key, i]));
  return {
    startOf: (key) => (index.get(key ?? null) ?? 0) * stagger,
    total: duration + (k - 1) * stagger,
    stages: k,
  };
}

/**
 * The transition from `from` ({positions: Map id → [x, y], rows: Map id → datum, xDomain,
 * yDomain, labels}) to `data`, or null when nothing moves, enters or leaves. Points present in
 * both move from their old to their new position; entering points fade in at their new
 * position; leaving points (`exits`, old datums) fade out where they were.
 */
export function planTransition(
  data,
  from,
  { x = "x", y = "y", id = "id", duration = 700, stageOf = null } = {},
) {
  if (!from?.positions || !data.length) return null;
  const xDomain = extent(data.map((d) => d[x]));
  const yDomain = extent(data.map((d) => d[y]));
  const ids = new Set(data.map((d) => d[id]));
  const exits = [...from.positions.keys()]
    .filter((key) => !ids.has(key) && from.rows?.has(key))
    .map((key) => from.rows.get(key));
  const moved = data.some((d) => {
    const xy = from.positions.get(d[id]);
    return !xy || xy[0] !== d[x] || xy[1] !== d[y];
  });
  const sameDomain = (a, b) => a && a[0] === b[0] && a[1] === b[1];
  if (
    !moved &&
    !exits.length &&
    sameDomain(from.xDomain, xDomain) &&
    sameDomain(from.yDomain, yDomain)
  )
    return null;

  const stages = stagePlan(data, { duration, stageOf });
  const motion = new Map();
  for (const d of data) {
    const xy = from.positions.get(d[id]);
    motion.set(d[id], {
      x0: xy ? xy[0] : d[x],
      y0: xy ? xy[1] : d[y],
      x1: d[x],
      y1: d[y],
      start: stages.startOf(stageOf?.(d)),
      enter: xy ? 0 : 1,
      exit: 0,
    });
  }
  for (const d of exits) {
    const [px, py] = from.positions.get(d[id]);
    motion.set(d[id], {
      x0: px,
      y0: py,
      x1: px,
      y1: py,
      start: 0,
      enter: 0,
      exit: 1,
    });
  }
  return {
    motion,
    exits,
    duration,
    total: stages.total,
    stageStart: stages.startOf,
    xDomain: [finite(from.xDomain) ? from.xDomain : xDomain, xDomain],
    yDomain: [finite(from.yDomain) ? from.yDomain : yDomain, yDomain],
    fromLabels: from.labels ?? [],
  };
}

/** Where a planned point is drawn `tm` ms into the transition (mirrors the chart's formula). */
export function positionAt(m, tm, duration) {
  const e = ease(clamp01((tm - m.start) / duration));
  return [m.x0 + (m.x1 - m.x0) * e, m.y0 + (m.y1 - m.y0) * e];
}

/** The scale domain `tm` ms into the transition (eased over the whole motion). */
export function domainAt([d0, d1], tm, total) {
  const g = ease(clamp01(tm / total));
  return [d0[0] + (d1[0] - d0[0]) * g, d0[1] + (d1[1] - d0[1]) * g];
}
