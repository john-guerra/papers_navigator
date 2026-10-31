// Explore's list header (#140): the add bar ("Matching papers n" + "Add N to My Papers") sticks
// under the nav while the list scrolls; once the reader is past the list's top it shows "↑ Top",
// which (like the title) scrolls back to the list's top, not the page's, and moves focus to the
// list heading. The page scrolls (not the list), so everything here is in viewport coordinates.

/** The window's scrollY that puts the list's top (`listTop`, viewport px) right under `offset`. */
export function listTopScroll({ scrollY, listTop, offset }) {
  return Math.max(0, Math.round(scrollY + listTop - offset));
}

/**
 * Follows `list` (its `.add-bar` is the sticky header, re-rendered by the page): toggles
 * `is-scrolled` on the list (CSS shows ↑ Top and the stuck border) and publishes the header's
 * height as `--list-header-height` on `root`, for scroll-padding. `offset()` is where the header
 * sticks (the nav's height). Returns {stop, refresh, scrollToTop}: `refresh` after the add bar
 * re-rendered (a new element to measure).
 */
export function stickyListHeader(
  list,
  {
    offset,
    root = globalThis.document?.documentElement,
    win = globalThis,
    frame = (cb) => requestAnimationFrame(cb),
    ResizeObserver = globalThis.ResizeObserver,
  },
) {
  let pending = false;
  let height;
  const bar = () => list.querySelector(".add-bar");
  const measure = () => {
    const h = Math.round(bar()?.getBoundingClientRect().height ?? 0);
    if (h === height) return;
    height = h;
    root?.style.setProperty("--list-header-height", `${h}px`);
  };
  const update = () => {
    pending = false;
    // 1px of slack: back at the top, sub-pixel layout can leave the list at 55.8 under a 56 nav
    list.classList.toggle(
      "is-scrolled",
      list.getBoundingClientRect().top < offset() - 1,
    );
  };
  const schedule = () => {
    if (pending) return;
    pending = true;
    frame(update);
  };
  const observer = ResizeObserver ? new ResizeObserver(measure) : null;
  const observe = () => {
    observer?.disconnect();
    const el = bar();
    if (el) observer?.observe(el);
  };
  win.addEventListener("scroll", schedule, { passive: true });
  win.addEventListener("resize", schedule);
  update();
  measure();
  observe();
  return {
    stop() {
      win.removeEventListener("scroll", schedule);
      win.removeEventListener("resize", schedule);
      observer?.disconnect();
      root?.style.removeProperty("--list-header-height");
      list.classList.remove("is-scrolled");
    },
    refresh() {
      measure();
      observe();
      update();
    },
    /** Back to the list's top (instantly with reduced motion), focus on its heading. */
    scrollToTop() {
      const reduced = win.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      win.scrollTo({
        top: listTopScroll({
          scrollY: win.scrollY,
          listTop: list.getBoundingClientRect().top,
          offset: offset(),
        }),
        behavior: reduced ? "instant" : "smooth",
      });
      list.querySelector(".add-bar-title")?.focus({ preventScroll: true });
    },
  };
}
