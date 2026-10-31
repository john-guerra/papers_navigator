// Short paper labels on the map (#99): which labels to draw, kept free of the DOM so tests can
// check the rules. smart-labels (widgets/paperLabels.js) decides from Voronoi cells which papers
// have room; this module decides, in priority order, which of those labels survive overlaps with
// the topic labels, the query marker, the legend and each other.

import { createBooleanSetting } from "./booleanSetting.js";

export const PAPER_LABELS_KEY = "papersNavigator:paperLabels";

/**
 * "Paper labels" on or off, remembered per device: an EventTarget with `.value` (boolean) and
 * `.set(on)` that emits `input` (the reactive widget contract). Without a stored choice it is on
 * at desktop and tablet widths and off on phones (`phone`), where 488 labels can't fit.
 */
export function createPaperLabelSettings({
  storage = globalThis.localStorage,
  phone = false,
} = {}) {
  return createBooleanSetting(PAPER_LABELS_KEY, !phone, storage);
}

/**
 * Maps data units to overlay pixels exactly like the widget's pointAt: the view's x/y scales plus
 * its origin (the plot's offset inside the Vega canvas, where the overlay starts).
 */
export function pixelMapper({ sx, sy, origin = [0, 0] }) {
  const [ox, oy] = origin;
  return ([x, y]) => [ox + sx(x), oy + sy(y)];
}

/** Rough text width when nothing can measure it (tests): 0.55em per character. */
export const estimateWidth = (text, fontSize) =>
  String(text ?? "").length * fontSize * 0.55;

/**
 * The box [x0, y0, x1, y1] of a text drawn at (x, y) with SVG `anchor` ("start" | "middle" |
 * "end") and `baseline` ("middle" | "top" | "bottom"), grown by `margin` px on every side.
 */
export function textBox({
  x,
  y,
  width,
  height,
  anchor = "middle",
  baseline = "middle",
  margin = 0,
}) {
  const x0 =
    anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
  const y0 =
    baseline === "top"
      ? y
      : baseline === "bottom"
        ? y - height
        : y - height / 2;
  return [x0 - margin, y0 - margin, x0 + width + margin, y0 + height + margin];
}

const overlaps = (a, b) =>
  a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const inside = (box, [x0, y0, x1, y1]) =>
  box[0] >= x0 && box[1] >= y0 && box[2] <= x1 && box[3] <= y1;

/**
 * The labels to draw, greedily in priority order: `labels` are {key, box, rank, always, force,
 * alternatives} (lower rank first; `always` labels (pinned, top matches) come before the rest
 * whatever their rank); `obstacles` (topic labels, the query marker, the legend) are boxes already
 * on the map. A label is dropped when it overlaps an obstacle or a kept label, or leaves `bounds`
 * (the plot). A `force` label (the pinned paper) is never dropped: it takes the first of its
 * `box` and `alternatives` (nudged boxes, drawn with a leader line) that is free, else its `box`.
 * At most `max` labels that aren't `always` are kept (DESIGN.md: text density).
 * Returns a Map from each kept key to the index of its box (0: `box`, i: `alternatives[i - 1]`).
 */
export function chooseLabels(
  labels,
  { obstacles = [], bounds = null, max = Infinity } = {},
) {
  const ordered = [...labels].sort(
    (a, b) =>
      Number(Boolean(b.force)) - Number(Boolean(a.force)) ||
      Number(Boolean(b.always)) - Number(Boolean(a.always)) ||
      a.rank - b.rank,
  );
  const taken = [...obstacles];
  const kept = new Map();
  const free = (box) =>
    (!bounds || inside(box, bounds)) && !taken.some((t) => overlaps(box, t));
  let optional = 0;
  for (const label of ordered) {
    if (!label.always && !label.force && optional >= max) continue;
    const boxes = [
      label.box,
      ...(label.force ? (label.alternatives ?? []) : []),
    ];
    let index = boxes.findIndex(free);
    if (index < 0 && label.force) index = 0;
    if (index < 0) continue;
    taken.push(boxes[index]);
    kept.set(label.key, index);
    if (!label.always && !label.force) optional++;
  }
  return kept;
}

/**
 * Which papers may carry a label, as a predicate on a row: none while labels are off; else the
 * papers drawn in color (DESIGN.md: dimmed points recede, so their labels would add clutter):
 * inside the region selection (`brush`, {x: [lo, hi], y: [lo, hi]} in data units), at or above the
 * relevance cut (`levelCut` on `score`), among the keyword matches while the map highlights
 * them (`matchIds`, #125) and, with a pinned paper, only it and its neighbours (`focusIds`).
 */
export function labelFilter({
  enabled = true,
  brush = null,
  levelCut = null,
  focusIds = null,
  matchIds = null,
  x = "x",
  y = "y",
  id = "id",
} = {}) {
  if (!enabled) return () => false;
  const focus = focusIds?.length ? new Set(focusIds) : null;
  const matched = matchIds ? new Set(matchIds) : null;
  return (d) =>
    (!brush ||
      (d[x] >= brush.x[0] &&
        d[x] <= brush.x[1] &&
        d[y] >= brush.y[0] &&
        d[y] <= brush.y[1])) &&
    (levelCut == null || d.score >= levelCut) &&
    (!matched || matched.has(d[id])) &&
    (!focus || focus.has(d[id]));
}

/**
 * The papers whose labels always show (when they fit) on top of the ones smart-labels finds room
 * for: the strongest matches of the search (rows with `score` at or above `strongCut`, at most
 * `top`, best first) and the papers nearest each query marker. Returns ids.
 */
export function emphasisIds(
  rows,
  { strongCut = null, top = 8, markers = [], id = "id" } = {},
) {
  const ids = [];
  const add = (key) => key != null && !ids.includes(key) && ids.push(key);
  for (const m of markers) add(m.nearest?.[0]?.id);
  if (strongCut != null)
    rows
      .filter((d) => Number.isFinite(d.score) && d.score >= strongCut)
      .sort((a, b) => b.score - a.score)
      .slice(0, top)
      .forEach((d) => add(d[id]));
  return ids;
}

/**
 * At most how many space-based labels a plot of width × height px gets: one per 14,000 px² (about
 * 30 on the 735 × 567 desktop map, 8 on a 360 × 330 phone map), so labels stay a sprinkle, not a
 * carpet.
 */
export const labelBudget = (width, height) =>
  Math.max(0, Math.floor((width * height) / 14000));
