import { html } from "htl";

/**
 * Removable chips for constraints outside the facet strip (topic query, map region),
 * followed by "Clear all" (DESIGN.md → Chips). Renders an empty container when none.
 */
export function renderChips(chips, { onClearAll } = {}) {
  if (!chips.length) return html`<div class="chips"></div>`;
  return html`<div class="chips">
    ${chips.map(({ label, value, onClear }) => {
      const clear = html`<button aria-label=${`Clear ${label}`}>✕</button>`;
      clear.onclick = onClear;
      return html`<span class="chip"
        ><span class="chip-label">${label}</span>
        <span class="chip-value">${value}</span>${clear}</span
      >`;
    })}
    ${
      onClearAll
        ? Object.assign(
            html`<button class="btn-text chips-clear">Clear all</button>`,
            { onclick: onClearAll },
          )
        : ""
    }
  </div>`;
}
