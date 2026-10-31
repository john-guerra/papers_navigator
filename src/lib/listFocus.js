// Brushing and linking from the list to the map (#136): which paper the reader is looking at.
// While scrolling, the row crossing a reading line (a share of the viewport's height); a row
// under the pointer or with keyboard focus wins until the pointer leaves the list.

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

/**
 * Calls `onFocus(id | null)` when the paper in focus in `list` (rows `[data-paper-id]`) changes.
 * Nothing until the reader scrolls, hovers or tabs into a row. `enabled()` false (e.g. layouts
 * where the map isn't beside the list) reports null and ignores the list. Returns a function
 * that stops tracking.
 */
export function trackListFocus(
  list,
  onFocus,
  {
    line = 0.4,
    enabled = () => true,
    viewportHeight = () => globalThis.innerHeight,
    frame = (cb) => requestAnimationFrame(cb),
  } = {},
) {
  let current;
  let pointed = null;
  let pending = false;
  const report = (id) => {
    if (id === current) return;
    current = id;
    onFocus(id);
  };
  const atLine = () =>
    rowAtLine(
      [...list.querySelectorAll("[data-paper-id]")].map((row) => {
        const { top, bottom } = row.getBoundingClientRect();
        return { id: row.dataset.paperId, top, bottom };
      }),
      viewportHeight() * line,
    );
  const update = () => {
    pending = false;
    if (!enabled()) return report(null);
    report(pointed ?? atLine());
  };
  const onScroll = () => {
    if (pending) return;
    pending = true;
    frame(update);
  };
  const rowId = (event) =>
    event.target.closest?.("[data-paper-id]")?.dataset.paperId ?? null;
  const onPoint = (event) => {
    if (event.pointerType === "touch" || !enabled()) return;
    const id = rowId(event);
    if (id == null) return;
    pointed = id;
    report(id);
  };
  const onFocusIn = (event) => {
    if (!enabled()) return;
    const id = rowId(event);
    if (id != null) report(id);
  };
  const onLeave = () => {
    pointed = null;
    update();
  };
  addEventListener("scroll", onScroll, { passive: true });
  list.addEventListener("pointerover", onPoint);
  list.addEventListener("pointerleave", onLeave);
  list.addEventListener("focusin", onFocusIn);
  return () => {
    removeEventListener("scroll", onScroll);
    list.removeEventListener("pointerover", onPoint);
    list.removeEventListener("pointerleave", onLeave);
    list.removeEventListener("focusin", onFocusIn);
  };
}
