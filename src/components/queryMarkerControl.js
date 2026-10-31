import { html } from "htl";

/**
 * Map options → Appearance: a checkbox for the "★ Your search" marker, bound to a query marker
 * settings store (lib/placeQuery.js). Same look as the toggles in Animation and Advanced.
 */
export function queryMarkerControl(store) {
  const input = html`<input type="checkbox" data-setting="query-marker" />`;
  input.onchange = () => store.set(input.checked);
  const sync = () => (input.checked = store.value);
  sync();
  store.addEventListener("input", sync);
  const el = html`<div class="animation-control query-marker-control">
    <label class="animation-toggle"
      >${input} Show “★ Your search” on the map</label
    >
  </div>`;
  /** Stops following the store (pages call it on invalidation). */
  el.dispose = () => store.removeEventListener("input", sync);
  return el;
}
