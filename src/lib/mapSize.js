/**
 * Explore's map size (DESIGN.md → Layout: on desktop "the map is sticky and fills the viewport
 * height; the list scrolls").
 *
 * The width follows the map column; the height is 3/4 of it, between 320px and 620px. On the
 * two-column layout (desktop) the map is sticky, so it must also fit the viewport: pass
 * `viewportHeight` (window.innerHeight) and the map's height leaves room for the nav, the sticky
 * offsets, the chart title and the controls under the map (`reserved`). Stacked layouts pass
 * null: there the map scrolls with the page and only the width counts.
 */
export const MAP_MIN_HEIGHT = 240;
/** Nav (56) + sticky top and bottom gaps (2 × 12) + chart title/padding + controls row, rounded up. */
export const MAP_RESERVED_HEIGHT = 170;

export function mapSize(
  width,
  { viewportHeight = null, reserved = MAP_RESERVED_HEIGHT } = {},
) {
  const w = Math.max(260, width - 20);
  let h = Math.min(620, Math.max(320, width * 0.75));
  if (viewportHeight != null)
    h = Math.max(MAP_MIN_HEIGHT, Math.min(h, viewportHeight - reserved));
  return [w, Math.round(h)];
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
