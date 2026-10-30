import { html } from "htl";

const LEVELS = [
  ["strong", "Strong"],
  ["good", "Good"],
  ["all", "All"],
];

/**
 * Segmented "Strong n · Good n · All n" control (DESIGN.md → Relevance control).
 * Reactive widget: `.value` is "strong" | "good" | "all"; emits `input` when the user picks a
 * level, and re-renders when `.value` is set and `input` is dispatched.
 */
export function relevanceControl(
  counts,
  { value = "good", label = "Relevance" } = {},
) {
  const el = html`<div
    class="relevance-control"
    role="group"
    aria-label=${label}
  ></div>`;
  const render = () =>
    el.replaceChildren(
      ...LEVELS.map(([key, name]) => {
        const button = html`<button
          type="button"
          aria-pressed=${String(key === value)}
        >
          ${name} <span class="count">${counts[key]}</span>
        </button>`;
        button.onclick = () => {
          value = key;
          render();
          el.dispatchEvent(new Event("input", { bubbles: true }));
        };
        return button;
      }),
    );
  Object.defineProperty(el, "value", {
    get: () => value,
    set: (v) => {
      value = v;
    },
  });
  el.addEventListener("input", (event) => {
    if (event.target === el) render();
  });
  render();
  return el;
}
