import { format } from "d3-format";

/** Tooltip rows for datum `d` from Vega-Lite-style entries (field names or {field, title, format}). */
export function tooltipValue(d, entries) {
  const value = {};
  for (const entry of entries) {
    const {
      field,
      title = field,
      format: spec,
    } = typeof entry === "string" ? { field: entry } : entry;
    const v = d[field];
    if (v == null || v === "") continue;
    value[title] = spec && typeof v === "number" ? format(spec)(v) : v;
  }
  return value;
}

/**
 * Shows the map tooltip for the point nearest the pointer (within `pointAt`'s radius) instead of
 * only when the pointer is exactly on a dot: small dots are hard to hit. Uses the view's tooltip
 * handler, so it looks like any Vega tooltip. Quiet while a button is down (brushing) and for
 * touch (taps show the paper in the list instead).
 */
export function attachNearestTooltip(el, { view, pointAt, entries }) {
  let shown = null;
  const show = (event, d) => {
    if (d === shown) return;
    shown = d;
    const handler = view.tooltip();
    handler?.call(
      view,
      handler,
      event,
      d ? { datum: d } : null,
      d ? tooltipValue(d, entries) : null,
    );
  };
  el.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || event.buttons)
      return show(event, null);
    show(event, pointAt(event.clientX, event.clientY));
  });
  el.addEventListener("pointerleave", (event) => show(event, null));
}
