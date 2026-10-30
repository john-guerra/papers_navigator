import { html } from "htl";

const LEVELS = [
  ["strong", "Strong"],
  ["good", "Good"],
  ["weak", "Weak"],
  ["all", "All"],
];

/**
 * Segmented "Strong n · Good n · Weak n · All n" control (DESIGN.md → Relevance control).
 * Reactive widget: `.value` is "strong" | "good" | "weak" | "all"; emits `input` when the user picks a
 * level, and updates when `.value` is set and `input` is dispatched. Buttons are built once and
 * only their pressed state changes, so keyboard focus stays put.
 */
export function relevanceControl(
  counts,
  { value = "good", label = "Relevance" } = {},
) {
  const buttons = LEVELS.map(([key, name]) => {
    const button = html`<button type="button" data-level=${key}>
      ${name} <span class="count">${counts[key]}</span>
    </button>`;
    button.onclick = () => {
      value = key;
      sync();
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    return button;
  });
  const el = html`<div
    class="relevance-control"
    role="group"
    aria-label=${label}
  >
    ${buttons}
  </div>`;
  const sync = () =>
    buttons.forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.level === value)),
    );
  Object.defineProperty(el, "value", {
    get: () => value,
    set: (v) => {
      value = v;
    },
  });
  el.addEventListener("input", (event) => {
    if (event.target === el) sync();
  });
  sync();
  return el;
}
