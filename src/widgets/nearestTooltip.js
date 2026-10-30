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
 * touch (taps show the paper in the list instead). `markerAt(clientX, clientY)` (optional) gives
 * a marker under the pointer as {datum, value}, shown instead of the nearest point.
 */
export function attachNearestTooltip(
  el,
  { view, pointAt, entries, markerAt = null },
) {
  // undefined, not null: a fresh map (after a redraw) can hide a tooltip the old one left open
  let shown;
  const show = (event, d, value = d ? tooltipValue(d, entries) : null) => {
    if (d === shown) return;
    shown = d;
    // Vega passes its scene handler first; vega-tooltip's handler ignores it, so pass the handler
    const handler = view.tooltip();
    handler?.call(view, handler, event, d ? { datum: d } : null, value);
  };
  el.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || event.buttons)
      return show(event, null);
    // A marker drawn on top of the points (e.g. the query, #100) comes first: {datum, value}
    const marker = markerAt?.(event.clientX, event.clientY);
    if (marker) return show(event, marker.datum, marker.value);
    show(event, pointAt(event.clientX, event.clientY));
  });
  el.addEventListener("pointerleave", (event) => show(event, null));
}
