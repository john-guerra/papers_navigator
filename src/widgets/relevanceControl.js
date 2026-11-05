import { html } from "htl";
import { toggletip } from "../components/toggletip.js";

const LEVELS = [
  ["strong", "Strong", "the closest matches", "The closest matches to your"],
  ["good", "Good", "clearly related", "Clearly related to your"],
  ["weak", "Weak", "loosely related", "Loosely related to your"],
  ["all", "All", "every paper, closest first", null],
];

/**
 * “Match to your search: ⓘ Strong n · Good n · Weak n · All n” (DESIGN.md → Relevance control).
 * The visible label names the group (aria-labelledby, so it's announced once); the ⓘ toggletip
 * says what the levels mean (similarity by meaning, not paper quality, #176) and each level has a
 * `title` hint. `subject` is "search", or "research" while My research ranks.
 * Reactive widget: `.value` is "strong" | "good" | "weak" | "all"; emits `input` when the user picks a
 * level, and updates when `.value` is set and `input` is dispatched. Buttons are built once and
 * only their pressed state changes, so keyboard focus stays put.
 */
export function relevanceControl(
  counts,
  { value = "good", subject = "search" } = {},
) {
  const buttons = LEVELS.map(([key, name, , hint]) => {
    const button = html`<button
      type="button"
      data-level=${key}
      title=${hint ? `${hint} ${subject}` : "Every paper, closest first"}
    >
      ${name} <span class="count">${counts[key]}</span>
    </button>`;
    button.onclick = () => {
      value = key;
      sync();
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    return button;
  });
  const labelId = `relevance-label-${Math.random().toString(36).slice(2, 9)}`;
  const info = toggletip({
    label: "About the match levels",
    content: () =>
      html`<span class="toggletip-lede"
          >How closely each paper's title and abstract match your ${subject} by
          meaning, not how good the paper is.</span
        >
        ${LEVELS.map(
          ([, name, meaning]) =>
            html`<span class="toggletip-item"
              ><strong>${name}</strong>: ${meaning}</span
            >`,
        )}`,
  });
  const el = html`<div
    class="relevance-field"
    role="group"
    aria-labelledby=${labelId}
  >
    <span class="relevance-label-row"
      ><span id=${labelId} class="relevance-label" aria-hidden="true"
        >Match to your ${subject}:</span
      >${info}</span
    >
    <div class="relevance-control">${buttons}</div>
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
