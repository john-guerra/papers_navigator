/**
 * The paper details mini-map (#101): a small map zoomed to one paper's neighbourhood. Pure
 * helpers for what it shows: the zoom (domains in data units) and its accessible summary.
 *
 * Domains are `{x: [x0, x1], y: [y0, y1]}`, centered on the paper, with width / height equal
 * to the chart's aspect ratio, so a data unit is as long on both axes (map distances stay
 * comparable in every direction).
 */
import { mapOrder } from "./neighbours.js";
import { SPEEDS } from "./animationSettings.js";

/** The `k` papers nearest to `id` on the map (`positions`: Map id → [x, y]), nearest first. */
export function mapNeighbourhood(positions, id, k = 15) {
  if (!positions.has(id)) return [];
  return mapOrder(positions, id).slice(0, k);
}

const centered = ([cx, cy], hx, hy) => ({
  x: [cx - hx, cx + hx],
  y: [cy - hy, cy + hy],
});

/**
 * The zoom showing paper `id` at the center and its `k` nearest map neighbours, `padding` (a
 * share of the half span) around the farthest of them; null if the paper isn't on the map.
 * When the neighbours sit on the paper, the span falls back to `minShare` of the whole map's.
 */
export function neighbourhoodDomain(
  positions,
  id,
  { k = 15, padding = 0.2, aspect = 1.5, minShare = 0.02 } = {},
) {
  const center = positions.get(id);
  if (!center) return null;
  let hx = 0;
  let hy = 0;
  for (const other of mapNeighbourhood(positions, id, k)) {
    const [x, y] = positions.get(other);
    hx = Math.max(hx, Math.abs(x - center[0]));
    hy = Math.max(hy, Math.abs(y - center[1]));
  }
  let half = Math.max(hx, hy * aspect) * (1 + padding);
  if (!(half > 0)) {
    const xs = [...positions.values()].map((p) => p[0]);
    half = ((Math.max(...xs) - Math.min(...xs)) * minShare) / 2 || 1;
  }
  return centered(center, half, half / aspect);
}

/** Whether `[x, y]` is inside `domain` (edges included). */
export function isInside(domain, [x, y]) {
  const e = 1e-9;
  return (
    x >= domain.x[0] - e &&
    x <= domain.x[1] + e &&
    y >= domain.y[0] - e &&
    y <= domain.y[1] + e
  );
}

/**
 * `domain` zoomed out around `center` (the paper stays in the middle) just enough to show
 * `point` with `padding`, keeping the aspect ratio; `domain` itself when it already shows it.
 */
export function domainIncluding(
  domain,
  center,
  point,
  { padding = 0.15 } = {},
) {
  if (isInside(domain, point)) return domain;
  const hx0 = (domain.x[1] - domain.x[0]) / 2;
  const hy0 = (domain.y[1] - domain.y[0]) / 2;
  const aspect = hx0 / hy0;
  const hx = Math.max(
    hx0,
    Math.abs(point[0] - center[0]) * (1 + padding),
    Math.abs(point[1] - center[1]) * (1 + padding) * aspect,
  );
  return centered(center, hx, hx / aspect);
}

/** The domain `t` (0–1) of the way from `a` to `b`. */
export function interpolateDomain(a, b, t) {
  const lerp = (u, v) => u + (v - u) * t;
  return {
    x: [lerp(a.x[0], b.x[0]), lerp(a.x[1], b.x[1])],
    y: [lerp(a.y[0], b.y[0]), lerp(a.y[1], b.y[1])],
  };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The mini-map's aria-label: how many of the related papers (`relatedIds`) fall inside the
 * neighbourhood (`domain`) and how many are far on the map (outside it). Papers without a
 * position on the map count as neither.
 */
export function miniMapSummary({ title, relatedIds, positions, domain }) {
  const head = `Map neighbourhood of “${title}”`;
  const placed = relatedIds.map((id) => positions.get(id)).filter(Boolean);
  if (!placed.length || !domain) return head;
  const near = placed.filter((p) => isInside(domain, p)).length;
  return `${head}: ${plural(near, "related paper")} nearby, ${placed.length - near} far on the map`;
}

/**
 * How the mini-map moves, from the map animation settings (#82): a short pan/zoom tween (half a
 * Speed step) and one pulse on the highlighted paper; nothing moves when animation is off
 * (which it is by default under prefers-reduced-motion).
 */
export function miniMapMotion(settings) {
  if (!settings?.enabled) return { tween: 0, pulse: 0 };
  const step = SPEEDS[settings.speed] ?? SPEEDS.normal;
  return { tween: Math.round(step / 2), pulse: 700 };
}
