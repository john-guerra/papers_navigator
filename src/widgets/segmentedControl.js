import { html } from "htl";

/**
 * A segmented control (DESIGN.md → Components: one row of buttons, the selected one `primary`),
 * styled like the relevance control. `options` are values or [value, label] pairs.
 * Reactive widget: `.value` is the selected value; emits `input` when the user picks another
 * option, and updates when `.value` is set and `input` is dispatched. Native buttons with
 * `aria-pressed` in a labelled group, so Tab, Enter/Space and screen readers work as usual.
 */
export function segmentedControl(options, { value, label } = {}) {
  const pairs = options.map((o) => (Array.isArray(o) ? o : [o, o]));
  if (value === undefined) value = pairs[0]?.[0];
  const el = html`<div
    class="segmented-control"
    role="group"
    aria-label=${label}
  ></div>`;
  const buttons = pairs.map(([key, text]) => {
    const button = html`<button type="button">${text}</button>`;
    button.onclick = () => {
      if (value === key) return;
      value = key;
      sync();
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    return button;
  });
  el.append(...buttons);
  const sync = () =>
    buttons.forEach((b, i) =>
      b.setAttribute("aria-pressed", String(pairs[i][0] === value)),
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
