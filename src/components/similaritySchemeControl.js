import { html } from "htl";
import {
  SIMILARITY_SCHEME_GROUPS,
  similarityGradient,
} from "../lib/similarityScheme.js";

/**
 * Map options → Appearance: "Similarity colors", a select of the similarity schemes (one optgroup
 * per family) with a preview bar of the chosen one, bound to a similarity scheme store
 * (lib/similarityScheme.js).
 */
export function similaritySchemeControl(store) {
  const select = html`<select data-setting="similarity-scheme">
    ${SIMILARITY_SCHEME_GROUPS.map(
      (g) =>
        html`<optgroup label=${g.label}>
          ${g.schemes.map((s) => html`<option value=${s.name}>${s.label}</option>`)}
        </optgroup>`,
    )}
  </select>`;
  const preview = html`<span
    class="similarity-scheme-preview"
    aria-hidden="true"
  ></span>`;
  select.onchange = () => store.set(select.value);
  const sync = () => {
    select.value = store.value;
    preview.style.background = similarityGradient(store.value);
  };
  sync();
  store.addEventListener("input", sync);
  // The preview sits under the select, as wide as it
  const el = html`<div class="similarity-scheme-control">
    <label
      >Similarity colors
      <span class="similarity-scheme-field">${select}${preview}</span></label
    >
  </div>`;
  /** Stops following the store (pages call it on invalidation). */
  el.dispose = () => store.removeEventListener("input", sync);
  return el;
}
