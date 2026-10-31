// Phone split screen (#144): the map section sticks under the nav and the list scrolls below.
// Until it sticks the map's controls row (Color by, labels) stays under the map, so the map starts
// high; once stuck (`map-stuck` on the layout) the row moves above the map and the section shifts
// up by its height with a transform, so the row hides under the nav, the map doesn't move and the
// list doesn't jump. CSS can't measure, so the heights it needs are custom properties on the root.

/**
 * Publishes `--map-controls-height` (the row) and `--split-map-height` (the stuck map without it)
 * for `section`, and toggles `map-stuck` on `layout` as the page scrolls: stuck once the section's
 * place in the flow (right after the element before it, plus the grid's row gap) reaches the nav
 * (`nav()`, px). Returns a function that stops.
 */
export function watchSplitMap(
  section,
  {
    layout = section.parentElement,
    nav = () => 0,
    root = globalThis.document?.documentElement,
    win = globalThis,
    frame = (cb) => requestAnimationFrame(cb),
    ResizeObserver = globalThis.ResizeObserver,
  } = {},
) {
  const controls = () => section.querySelector(".map-stage > .map-controls");
  let row = 0;
  const measure = () => {
    // The row's margins move with it
    const el = controls();
    const style = el ? win.getComputedStyle?.(el) : null;
    const margins =
      (parseFloat(style?.marginTop) || 0) +
      (parseFloat(style?.marginBottom) || 0);
    row = Math.round((el?.getBoundingClientRect().height ?? 0) + margins);
    const all = Math.round(section.getBoundingClientRect().height);
    root?.style.setProperty("--map-controls-height", `${row}px`);
    root?.style.setProperty(
      "--split-map-height",
      `${Math.max(0, all - row)}px`,
    );
  };
  let pending = false;
  const update = () => {
    pending = false;
    const before = section.previousElementSibling;
    const gap = parseFloat(win.getComputedStyle?.(layout).rowGap) || 0;
    const flowTop = before
      ? before.getBoundingClientRect().bottom + gap
      : Infinity;
    layout.classList.toggle("map-stuck", flowTop <= nav() + 0.5);
  };
  const schedule = () => {
    if (pending) return;
    pending = true;
    frame(update);
  };
  measure();
  update();
  win.addEventListener("scroll", schedule, { passive: true });
  const observer = ResizeObserver ? new ResizeObserver(measure) : null;
  observer?.observe(section);
  const el = controls();
  if (el) observer?.observe(el);
  return () => {
    win.removeEventListener("scroll", schedule);
    observer?.disconnect();
    layout.classList.remove("map-stuck");
    root?.style.removeProperty("--map-controls-height");
    root?.style.removeProperty("--split-map-height");
  };
}
