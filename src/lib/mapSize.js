/**
 * Explore's map size (DESIGN.md → Layout: on desktop the side column, or at least the map, is
 * sticky and fits the viewport height; the list scrolls).
 *
 * The width follows the map column; the height is 3/4 of it, between 320px and 620px. On the
 * two-column layout (desktop) the map is sticky, so it must also fit the viewport: pass
 * `viewportHeight` (window.innerHeight) and the map's height leaves room for the nav, the sticky
 * offsets, the chart title and the controls under the map (`reserved`). Stacked layouts pass
 * null: there the map scrolls with the page and only the width counts.
 *
 * #140: with `controlsHeight` (search, facets, chips, relevance above the map) the whole side
 * column can stay in view: the map gives up height so the controls fit above it, down to
 * MAP_FIT_MIN_HEIGHT (or its own width-based height, if smaller). The third value says whether
 * that worked; if not, the map alone is sticky and the controls scroll away, as before.
 */
export const MAP_MIN_HEIGHT = 240;
/** Nav (56) + sticky top and bottom gaps (2 × 12) + chart title/padding + controls row, rounded up. */
export const MAP_RESERVED_HEIGHT = 170;
/** The smallest map worth keeping the controls in view for (#140). */
export const MAP_FIT_MIN_HEIGHT = 480;
/** The gap between the controls and the map in the side column (--spacing-sm). */
export const SIDE_GAP = 8;

export function mapSize(
  width,
  {
    viewportHeight = null,
    reserved = MAP_RESERVED_HEIGHT,
    controlsHeight = null,
    fitMin = MAP_FIT_MIN_HEIGHT,
  } = {},
) {
  const w = Math.max(260, width - 20);
  let h = Math.min(620, Math.max(320, width * 0.75));
  if (viewportHeight == null) return [w, Math.round(h)];
  if (controlsHeight != null) {
    const room = viewportHeight - reserved - SIDE_GAP - controlsHeight;
    if (room >= Math.min(h, fitMin))
      return [w, Math.round(Math.min(h, room)), true];
  }
  h = Math.max(MAP_MIN_HEIGHT, Math.min(h, viewportHeight - reserved));
  return controlsHeight == null
    ? [w, Math.round(h)]
    : [w, Math.round(h), false];
}

/** Panels that open for a moment inside the controls; opening one must not redraw the map. */
export const TRANSIENT_PANELS = ".my-research-panel, .topic-watch-panel";

/**
 * The controls' height without their open transient panels (in-flow, each on its own line of a
 * flex row, so the row gap above it goes too). Facet popovers are absolutely positioned and
 * never count.
 */
export function controlsHeight(el, { exclude = TRANSIENT_PANELS } = {}) {
  let height = el.getBoundingClientRect().height;
  for (const panel of el.querySelectorAll(exclude)) {
    if (panel.hidden) continue;
    const h = panel.getBoundingClientRect().height;
    if (!h) continue;
    // The flex row's gap: skip wrappers without a box (My research, Watch are display: contents)
    let row = panel.parentElement;
    while (row !== el && getComputedStyle(row).display === "contents")
      row = row.parentElement;
    const style = getComputedStyle(panel);
    const gap =
      (parseFloat(getComputedStyle(row).rowGap) || 0) +
      (parseFloat(style.marginTop) || 0) +
      (parseFloat(style.marginBottom) || 0);
    height -= h + gap;
  }
  return Math.round(height);
}

/**
 * The space the sticky side column has to fit: {viewportHeight, controlsHeight}, or null where
 * nothing is sticky (stacked layouts, < 1024px). Calls `notify` only when that changes: the
 * viewport's height at all (on phones the toolbar changes innerHeight while scrolling, which must
 * not redraw the map; stacked, it's null anyway), the controls' by at least `threshold` px.
 * `measure()` reads the controls' height; the ResizeObserver watches `controls`.
 */
export function watchStickySpace(
  notify,
  {
    query,
    controls = null,
    measure = () => controlsHeight(controls),
    threshold = 8,
    win = globalThis,
    ResizeObserver = globalThis.ResizeObserver,
  },
) {
  const stacked = win.matchMedia?.(query);
  let last;
  const update = () => {
    if (!stacked || stacked.matches) {
      if (last === null) return;
      last = null;
      return notify(null);
    }
    const viewportHeight = win.innerHeight;
    const height = measure();
    if (
      last &&
      last.viewportHeight === viewportHeight &&
      Math.abs(last.controlsHeight - height) < threshold
    )
      return;
    last = { viewportHeight, controlsHeight: height };
    notify(last);
  };
  update();
  win.addEventListener?.("resize", update);
  const observer = ResizeObserver ? new ResizeObserver(update) : null;
  if (controls) observer?.observe(controls);
  return () => {
    win.removeEventListener?.("resize", update);
    observer?.disconnect();
  };
}
