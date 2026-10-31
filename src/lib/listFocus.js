// Brushing and linking from the list to the map (#136): which paper the reader is looking at.
// While scrolling, the row crossing a reading line (a share of the viewport's height). An explicit
// choice holds instead: a row the pointer actually moves over, a row with keyboard focus, or a
// paper pinned on the map (`hold`); it lasts until the reader scrolls on purpose (wheel, touch,
// scroll keys) or the pointer leaves the list. Scrolls the page makes itself (focus moving to a
// row below the fold, "scroll to this paper") don't release it.

/**
 * The id of the row crossing `lineY` (rows: [{id, top, bottom}] in viewport px, in list order),
 * the next row down when the line falls in a gap, or null above or below the whole list.
 */
export function rowAtLine(rows, lineY) {
  for (const row of rows) {
    if (lineY < row.top) return row === rows[0] ? null : row.id;
    if (lineY < row.bottom) return row.id;
  }
  return null;
}

const SCROLL_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "PageDown",
  "PageUp",
  "Home",
  "End",
  " ",
]);

/**
 * Calls `onFocus(id | null)` when the paper in focus in `list` (rows `[data-paper-id]`) changes.
 * Nothing until the reader scrolls, points or tabs into a row, unless `start` is true (a map
 * redrawn mid-reading picks the focus up again at once). `enabled()` false (e.g. layouts where
 * the map isn't beside the list) reports null and ignores the list.
 * Returns {stop, hold(id), refresh()}: `hold` makes `id` the focus until the next scroll intent
 * (a pinned map point); `refresh` re-reports after the list re-rendered (new row elements).
 */
export function trackListFocus(
  list,
  onFocus,
  {
    line = 0.4,
    enabled = () => true,
    viewportHeight = () => globalThis.innerHeight,
    frame = (cb) => requestAnimationFrame(cb),
    start = false,
  } = {},
) {
  let current;
  let held = null;
  let pending = false;
  let lastPointer = null;
  const report = (id, force = false) => {
    if (id === current && !force) return;
    current = id;
    onFocus(id);
  };
  const rowElement = (id) =>
    list.querySelector(`[data-paper-id="${CSS.escape(id)}"]`);
  const atLine = () =>
    rowAtLine(
      [...list.querySelectorAll("[data-paper-id]")].map((row) => {
        const { top, bottom } = row.getBoundingClientRect();
        return { id: row.dataset.paperId, top, bottom };
      }),
      viewportHeight() * line,
    );
  const update = (force = false) => {
    pending = false;
    if (!enabled()) return report(null, force);
    report(held ?? atLine(), force);
  };
  const schedule = () => {
    if (pending) return;
    pending = true;
    frame(() => update());
  };
  // The reader scrolls on purpose: the reading line takes over again
  // (the pointer's last position stays: content scrolling under it is not a move)
  const release = () => {
    held = null;
  };
  const onKey = (event) => {
    if (
      SCROLL_KEYS.has(event.key) &&
      !event.target.closest?.("input, textarea, select")
    )
      release();
  };
  const rowId = (event) =>
    event.target.closest?.("[data-paper-id]")?.dataset.paperId ?? null;
  // A real move, not the boundary events some browsers send when content scrolls under a
  // pointer that stays put
  const onMove = (event) => {
    if (event.pointerType === "touch" || !enabled()) return;
    const at = `${event.clientX},${event.clientY}`;
    if (at === lastPointer) return;
    lastPointer = at;
    const id = rowId(event);
    if (id == null) return;
    held = id;
    report(id);
  };
  const onFocusIn = (event) => {
    if (!enabled()) return;
    const id = rowId(event);
    if (id == null) return;
    held = id;
    report(id);
  };
  const onFocusOut = (event) => {
    if (list.contains(event.relatedTarget)) return;
    held = null;
    schedule();
  };
  const onLeave = () => {
    held = null;
    lastPointer = null;
    update();
  };
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("wheel", release, { passive: true });
  addEventListener("touchmove", release, { passive: true });
  addEventListener("keydown", onKey);
  list.addEventListener("pointermove", onMove);
  list.addEventListener("pointerleave", onLeave);
  list.addEventListener("focusin", onFocusIn);
  list.addEventListener("focusout", onFocusOut);
  if (start) update();
  return {
    stop() {
      removeEventListener("scroll", schedule);
      removeEventListener("wheel", release);
      removeEventListener("touchmove", release);
      removeEventListener("keydown", onKey);
      list.removeEventListener("pointermove", onMove);
      list.removeEventListener("pointerleave", onLeave);
      list.removeEventListener("focusin", onFocusIn);
      list.removeEventListener("focusout", onFocusOut);
    },
    hold(id) {
      if (!enabled()) return;
      held = id;
      report(id);
    },
    refresh() {
      // A held paper no longer listed gives way to the reading line
      if (held != null && !rowElement(held)) held = null;
      if (current !== undefined) update(true);
    },
  };
}
