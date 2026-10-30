import { html } from "htl";

const MOTIONS = [
  ["all", "All at once"],
  ["topic", "By topic"],
];
const SPEED_LABELS = [
  ["slow", "Slow"],
  ["normal", "Normal"],
  ["fast", "Fast"],
];

/**
 * The "Animation" group of the Options drawer (#82), bound to an animation settings store
 * (src/lib/animationSettings.js): three switches and two segmented controls. Motion, Speed and
 * "Animate filter changes" are disabled while "Animate the map" is off; Motion shows only when
 * the conference has topics to stage by.
 */
export function animationControl(store, { hasTopics = true } = {}) {
  const toggle = (key, label) => {
    const input = html`<input type="checkbox" data-setting=${key} />`;
    input.onchange = () => store.set({ [key]: input.checked });
    return {
      key,
      input,
      el: html`<label class="animation-toggle">${input} ${label}</label>`,
    };
  };
  const segmented = (key, label, options) => {
    const buttons = options.map(([value, text]) => {
      const button = Object.assign(document.createElement("button"), {
        type: "button",
        textContent: text,
      });
      button.dataset.value = value;
      button.onclick = () => store.set({ [key]: value });
      return button;
    });
    const el = html`<div class="animation-choice">
      <span class="animation-label" id=${`animation-${key}`}>${label}</span>
      <div
        class="relevance-control"
        role="group"
        aria-labelledby=${`animation-${key}`}
      >
        ${buttons}
      </div>
    </div>`;
    return { key, buttons, el };
  };
  const enabled = toggle("enabled", "Animate the map");
  const align = toggle("align", "Align projections");
  const filters = toggle("filters", "Animate filter changes");
  const motion = segmented("motion", "Motion", MOTIONS);
  const speed = segmented("speed", "Speed", SPEED_LABELS);

  const sync = () => {
    const value = store.value;
    for (const t of [enabled, align, filters]) t.input.checked = value[t.key];
    for (const s of [motion, speed])
      for (const b of s.buttons) {
        b.setAttribute(
          "aria-pressed",
          String(b.dataset.value === value[s.key]),
        );
        b.disabled = !value.enabled;
      }
    filters.input.disabled = !value.enabled;
  };
  sync();
  store.addEventListener("input", sync);

  return html`<div class="animation-control">
    ${enabled.el}${align.el}${filters.el}${hasTopics ? motion.el : ""}${speed.el}
  </div>`;
}
