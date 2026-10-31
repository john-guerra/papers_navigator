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
 * #142: with `controlsHeight` (search, facets, chips, relevance above the map) the whole side
 * column can stay in view: the map gives up height so the controls fit above it, down to
 * MAP_FIT_MIN_HEIGHT (or its own width-based height, if smaller). The third value says whether
 * that worked; if not, the map alone is sticky and the controls scroll away, as before.
 */
export const MAP_MIN_HEIGHT = 240;
/** Nav (56) + sticky top and bottom gaps (2 × 12) + chart title/padding + controls row, rounded up. */
export const MAP_RESERVED_HEIGHT = 170;
/** The smallest map worth keeping the controls in view for (#142). */
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
    splitHeight = null,
  } = {},
) {
  const w = Math.max(260, width - 20);
  // Phone split screen (#144): the map takes SPLIT_SHARE of what the nav and tab bar leave
  if (splitHeight != null) return [w, splitMapHeight(splitHeight)];
  let h = Math.min(620, Math.max(320, width * 0.75));
  if (viewportHeight == null) return [w, Math.round(h)];
  if (controlsHeight != null) {
    const room =
      viewportHeight - reserved - SIDE_GAP - controlsHeight - CONTROLS_SLACK;
    if (room >= Math.min(h, fitMin))
      return [w, Math.round(Math.min(h, room)), true];
  }
  h = Math.max(MAP_MIN_HEIGHT, Math.min(h, viewportHeight - reserved));
  return controlsHeight == null
    ? [w, Math.round(h)]
    : [w, Math.round(h), false];
}

/**
 * What comes and goes inside the controls without a map redraw (#143 review): open panels (My
 * research, Watch), the chips row (a region chip appears on the first brush event, mid-drag) and
 * the model status line. They are left out of the measure; CONTROLS_SLACK keeps room for a chips
 * or status line, and a taller moment (a panel open) just runs past the viewport's bottom.
 */
export const TRANSIENT_PANELS =
  ".my-research-panel, .topic-watch-panel, .chips, .search-status";
/** Room kept under the measured controls for one chips or status line. */
export const CONTROLS_SLACK = 48;

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
 * The viewport height the sticky map has to fit, or null where the map isn't sticky (stacked
 * layouts, < 1024px). Calls `notify` only when that value changes: on phones the browser's
 * toolbar changes innerHeight while scrolling, which must not redraw the map.
 */
export function watchStickyViewport(notify, { query, win = globalThis }) {
  const stacked = win.matchMedia?.(query);
  let last;
  const update = () => {
    const value = !stacked || stacked.matches ? null : win.innerHeight;
    if (value === last) return;
    last = value;
    notify(value);
  };
  update();
  win.addEventListener?.("resize", update);
  return () => win.removeEventListener?.("resize", update);
}

/** Phone split screen (#144): the nav and the tab bar, then the map's share of the rest. */
export const SPLIT_CHROME = 112;
export const SPLIT_SHARE = 0.45;

/** The split map's height for a phone `viewportHeight` tall: 45% of the rest, 220–420px. */
export function splitMapHeight(viewportHeight) {
  return Math.round(
    Math.min(420, Math.max(220, (viewportHeight - SPLIT_CHROME) * SPLIT_SHARE)),
  );
}

/**
 * The phone's height for the split screen (#144), or null where it doesn't split. Read when the
 * split starts or the phone turns, never on resize: the browser's toolbar changes innerHeight
 * while scrolling and the on-screen keyboard while typing, and neither may redraw the map.
 */
export function watchPhoneSplit(notify, { query, win = globalThis }) {
  const split = win.matchMedia?.(query);
  let last;
  const update = () => {
    const value = split?.matches ? win.innerHeight : null;
    if (value === last) return;
    last = value;
    notify(value);
  };
  update();
  split?.addEventListener?.("change", update);
  win.addEventListener?.("orientationchange", update);
  return () => {
    split?.removeEventListener?.("change", update);
    win.removeEventListener?.("orientationchange", update);
  };
}
