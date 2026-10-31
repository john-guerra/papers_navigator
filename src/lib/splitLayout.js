// Phone split screen (#144): the map section sticks under the nav with its controls row (Color by,
// labels) above the map, slid up under the nav while stuck, so the map keeps its full height; the
// list header sticks right under the map. CSS can't measure, so this publishes the two heights it
// needs as custom properties on the root.

/**
 * Publishes `--map-controls-height` (the row slid under the nav) and `--split-map-height` (what
 * stays visible of the stuck map section) for `section`, and keeps them current as either
 * resizes. Returns a function that stops.
 */
export function watchSplitMap(
  section,
  {
    root = globalThis.document?.documentElement,
    ResizeObserver = globalThis.ResizeObserver,
  } = {},
) {
  const controls = () => section.querySelector(".map-stage > .map-controls");
  const update = () => {
    const row = Math.round(controls()?.getBoundingClientRect().height ?? 0);
    const all = Math.round(section.getBoundingClientRect().height);
    root?.style.setProperty("--map-controls-height", `${row}px`);
    root?.style.setProperty(
      "--split-map-height",
      `${Math.max(0, all - row)}px`,
    );
  };
  update();
  const observer = ResizeObserver ? new ResizeObserver(update) : null;
  observer?.observe(section);
  const row = controls();
  if (row) observer?.observe(row);
  return () => {
    observer?.disconnect();
    root?.style.removeProperty("--map-controls-height");
    root?.style.removeProperty("--split-map-height");
  };
}
