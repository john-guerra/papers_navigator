import { html } from "htl";
import { getTheme, setTheme } from "../lib/theme.js";

const OPTIONS = [
  ["auto", "Auto"],
  ["light", "Light"],
  ["dark", "Dark"],
];

/** "Appearance: Auto · Light · Dark" segmented control (Auto follows the OS). */
export function themeControl({ storage = globalThis.localStorage } = {}) {
  let value = getTheme(storage);
  const buttons = OPTIONS.map(([key, label]) => {
    const button = html`<button type="button" data-theme-option=${key}>
      ${label}
    </button>`;
    button.onclick = () => {
      value = key;
      setTheme(key, storage);
      sync();
    };
    return button;
  });
  const sync = () =>
    buttons.forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.themeOption === value)),
    );
  sync();
  return html`<div class="theme-control">
    <span class="theme-label">Appearance</span>
    <div class="relevance-control" role="group" aria-label="Appearance">
      ${buttons}
    </div>
  </div>`;
}
