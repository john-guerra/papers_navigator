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
 *
 * #174: `above` is what sits above the side column at the top of the page beyond what `reserved`
 * counts (Explore's open intro, watchIntroRoom), so the column fits the first screen too.
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
    splitRoom = null,
    above = 0,
  } = {},
) {
  const w = Math.max(260, width - 20);
  // Split screen (#144, #158): the map takes SPLIT_SHARE of what the nav (and tab bar) leave
  if (splitRoom != null) return [w, splitMapHeight(splitRoom, width)];
  let h = Math.min(620, Math.max(320, width * 0.75));
  if (viewportHeight == null) return [w, Math.round(h)];
  reserved += above;
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

/**
 * Explore's intro (#174) is open on a first visit, a few lines above the side column: on the
 * two-column layout `notify` gets its height beyond the summary line (0 when closed, and on
 * stacked layouts, where the map isn't sticky), for mapSize's `above`. Called again only when
 * that changes (toggling it, its text filling in, a resize that rewraps it). Returns a stop
 * function.
 */
export function watchIntroRoom(notify, { details, query, win = globalThis }) {
  const stacked = win.matchMedia?.(query);
  const summary = details?.querySelector("summary");
  let last;
  const update = () => {
    const value =
      !details || !summary || stacked?.matches
        ? 0
        : Math.max(
            0,
            Math.round(
              details.getBoundingClientRect().height -
                summary.getBoundingClientRect().height,
            ),
          );
    if (value === last) return;
    last = value;
    notify(value);
  };
  update();
  const Observer = win.ResizeObserver ?? globalThis.ResizeObserver;
  const observer = Observer && details ? new Observer(update) : null;
  observer?.observe(details);
  stacked?.addEventListener?.("change", update);
  return () => {
    observer?.disconnect();
    stacked?.removeEventListener?.("change", update);
  };
}

/**
 * Split screen (#144 phones, #158 every stacked layout): the map sticks under the nav and takes
 * SPLIT_SHARE of the height the nav, and on phones the bottom tab bar (style.css `.tabbar`, shown
 * below 640px), leave: the "room".
 */
export const SPLIT_NAV = 56;
export const SPLIT_TAB_BAR = 56;
export const SPLIT_SHARE = 0.45;

/** The room the split shares between map and list in a window `viewportHeight` tall. */
export function splitRoom(viewportHeight, { tabBar = false } = {}) {
  return viewportHeight - SPLIT_NAV - (tabBar ? SPLIT_TAB_BAR : 0);
}

/**
 * The split map's height: 45% of the room, at least 220px and at most 420px, or, on a wider
 * window, at most the stacked map's own height (3/4 of its width, 620px at most), so a tablet's
 * map isn't a flat strip while a phone's stays as in #144.
 */
export function splitMapHeight(room, width = 0) {
  const max = Math.max(420, Math.min(620, width * 0.75));
  return Math.round(Math.min(max, Math.max(220, room * SPLIT_SHARE)));
}

/** How long after a turn its resize may still come (iOS sends it after orientationchange). */
export const TURN_RESIZE_MS = 1000;

/**
 * The split screen's room (#144, #158; `splitRoom`), or null where it doesn't split: not a stacked
 * layout (`query`), or shorter than `minHeight`. `tabBarQuery` says when the phone tab bar takes
 * its share. Read when the page becomes a stacked layout, crosses the tab bar's breakpoint or the
 * device turns, never on resize: the browser's toolbar changes innerHeight while scrolling and the
 * on-screen keyboard while typing, and neither may switch the split or redraw the map. The one
 * exception is the first resize within a second of a turn, since iOS Safari turns before it
 * resizes (#146). Devices with a mouse (`resizeQuery`: fine pointer and hover) have neither, but
 * their windows get resized, so there a resize re-decides too, `debounce` ms after the last one
 * (#159 review).
 */
export const SPLIT_RESIZE_QUERY = "(hover: hover) and (pointer: fine)";
export const SPLIT_RESIZE_DEBOUNCE = 200;

export function watchSplitScreen(
  notify,
  {
    query,
    tabBarQuery = null,
    minHeight = 600,
    resizeQuery = SPLIT_RESIZE_QUERY,
    debounce = SPLIT_RESIZE_DEBOUNCE,
    win = globalThis,
    setTimer = (f, ms) => setTimeout(f, ms),
    clearTimer = (id) => clearTimeout(id),
  },
) {
  const stacked = win.matchMedia?.(query);
  const mouse = resizeQuery ? win.matchMedia?.(resizeQuery) : null;
  const tabBar = tabBarQuery ? win.matchMedia?.(tabBarQuery) : null;
  let last;
  const update = () => {
    const height = win.innerHeight;
    const value =
      stacked?.matches && height >= minHeight
        ? splitRoom(height, { tabBar: !!tabBar?.matches })
        : null;
    if (value === last) return;
    last = value;
    notify(value);
  };
  let disarm;
  let settle;
  const onResize = () => {
    if (!mouse?.matches) return;
    clearTimer(settle);
    settle = setTimer(() => {
      settle = undefined;
      update();
    }, debounce);
  };
  const afterTurn = () => {
    clearTimer(disarm);
    win.removeEventListener?.("resize", afterTurn);
    update();
  };
  const onTurn = () => {
    update();
    clearTimer(disarm);
    win.addEventListener?.("resize", afterTurn);
    disarm = setTimer(
      () => win.removeEventListener?.("resize", afterTurn),
      TURN_RESIZE_MS,
    );
  };
  update();
  win.addEventListener?.("resize", onResize);
  stacked?.addEventListener?.("change", update);
  tabBar?.addEventListener?.("change", update);
  win.addEventListener?.("orientationchange", onTurn);
  return () => {
    stacked?.removeEventListener?.("change", update);
    tabBar?.removeEventListener?.("change", update);
    win.removeEventListener?.("orientationchange", onTurn);
    win.removeEventListener?.("resize", afterTurn);
    win.removeEventListener?.("resize", onResize);
    clearTimer(disarm);
    clearTimer(settle);
  };
}
