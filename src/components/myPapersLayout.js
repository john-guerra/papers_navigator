import { STACKED_QUERY } from "../lib/breakpoints.js";

/**
 * My Papers' desktop side column (DESIGN.md → Layout, #110). The page's sections are
 * `.mp-<name>` blocks inside `.my-papers-layout`:
 *
 * - desktop (≥ 1024px): the main column (`.mp-main`) has the view (Now / Next · Itinerary and
 *   the Show filter), the schedule and All my papers; the side column (`.mp-side`) has the list
 *   tools (share, export, import), Watching and Recommended papers;
 * - stacked (< 1024px): one column in the order the page always had.
 *
 * The sections move in the DOM (CSS `order` would leave the keyboard and screen-reader order
 * different from what's on screen), only when the layout crosses the breakpoint; focus stays
 * where it was. Returns a function that stops listening.
 */
export const MAIN_SECTIONS = ["view", "schedule", "list"];
export const SIDE_SECTIONS = ["tools", "watching", "recommended"];
export const STACKED_SECTIONS = [
  "view",
  "tools",
  "schedule",
  "watching",
  "recommended",
  "list",
];

export function arrangeMyPapers(
  layout,
  { query = STACKED_QUERY, win = globalThis } = {},
) {
  const main = layout.querySelector(".mp-main");
  const side = layout.querySelector(".mp-side");
  const section = (name) => layout.querySelector(`.mp-${name}`);
  const media = win.matchMedia?.(query);
  const arrange = () => {
    const focused = layout.ownerDocument.activeElement;
    if (!media || media.matches) {
      main.append(...STACKED_SECTIONS.map(section));
    } else {
      main.append(...MAIN_SECTIONS.map(section));
      side.append(...SIDE_SECTIONS.map(section));
    }
    layout.classList.toggle("has-side", side.childElementCount > 0);
    if (
      focused &&
      layout.contains(focused) &&
      focused !== layout.ownerDocument.activeElement
    )
      focused.focus({ preventScroll: true });
  };
  arrange();
  media?.addEventListener("change", arrange);
  return () => media?.removeEventListener("change", arrange);
}
