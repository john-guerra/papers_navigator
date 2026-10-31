/**
 * DESIGN.md → Layout breakpoints: phone < 640px, tablet 640–1023px, desktop ≥ 1024px.
 *
 * CSS can't import these (no custom media in browsers yet), so style.css, authors.css and the
 * widgets' inline styles write the same two queries literally; test/breakpoints.test.js fails
 * when any stylesheet uses another width. The `.98` keeps 640px and 1024px out of the smaller
 * class with the `max-width` syntax every browser supports (range syntax needs Safari 16.4).
 */
export const PHONE_MAX = 639.98;
export const TABLET_MAX = 1023.98;

/** Phones (< 640px): one column, "Filters (n)" sheet, map behind "Select region". */
export const PHONE_QUERY = `(max-width: ${PHONE_MAX}px)`;
/** Phones and tablets (< 1024px): Explore stacks controls, map and list. */
export const STACKED_QUERY = `(max-width: ${TABLET_MAX}px)`;
/** Desktop (≥ 1024px): Explore's two columns with the sticky map. */
export const TWO_COLUMN_QUERY = `not all and ${STACKED_QUERY}`;
/**
 * Phones at least this tall split the screen (#144): the map sticks in the top half, the list
 * scrolls in the bottom half. Decided in JS (lib/mapSize.js watchPhoneSplit), not with a
 * min-height media query: an on-screen keyboard or toolbar would flip a query while typing or
 * scrolling. Shorter (landscape) phones keep the stacked layout.
 */
export const SPLIT_MIN_HEIGHT = 600;
/** Touch screens, whatever their width: hit targets grow to 44px (DESIGN.md → Accessibility). */
export const COARSE_QUERY = "(pointer: coarse)";

/** Whether `query` matches now (false where matchMedia doesn't exist, e.g. tests). */
export function matches(query, win = globalThis) {
  return win.matchMedia?.(query).matches ?? false;
}
