import { html } from "htl";
import { toggletip } from "../components/toggletip.js";
import { LEVEL_NAMES, cutPercent } from "../lib/relevanceLevels.js";

const LEVELS = [
  ["strong", "the closest matches", "The closest matches to your"],
  ["good", "clearly related", "Clearly related to your"],
  ["weak", "loosely related", "Loosely related to your"],
  ["all", "every paper, closest first", null],
].map(([key, ...rest]) => [key, LEVEL_NAMES[key], ...rest]);

/**
 * “Match to your search: ⓘ Strong n · Good n · Loose n · All n” (DESIGN.md → Relevance control).
 * The visible label names the group (aria-labelledby, so it's announced once; phones show a short
 * “Match” instead, hidden from screen readers, #183); the ⓘ toggletip says what the levels mean
 * (similarity by meaning, not paper quality, #176) and each level has a `title` hint.
 * `subject` is "search", or "research" while My research ranks. `cuts` is a getter for the
 * current `{strong, good, weak}` cuts: the toggletip reads it each time it opens and shows
 * “Strong ≥ 47%”…, rounded like the % next to each paper (#183).
 * Reactive widget: `.value` is "strong" | "good" | "weak" | "all"; emits `input` when the user picks a
 * level, and updates when `.value` is set and `input` is dispatched. Buttons are built once and
 * only their pressed state changes, so keyboard focus stays put.
 */
export function relevanceControl(
  counts,
  { value = "good", subject = "search", cuts = null } = {},
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
    content: () => {
      const current = typeof cuts === "function" ? cuts() : cuts;
      return html`<span class="toggletip-lede"
          >How closely each paper's title and abstract match your ${subject} by
          meaning, not how good the paper is.</span
        >
        ${LEVELS.map(([key, name, meaning]) => {
          const cut =
            current && Number.isFinite(current[key]) ? current[key] : null;
          return html`<span class="toggletip-item"
            ><strong>${name}</strong
            >${cut === null ? "" : ` ≥ ${cutPercent(cut)}`}: ${meaning}</span
          >`;
        })}`;
    },
  });
  const el = html`<div
    class="relevance-field"
    role="group"
    aria-labelledby=${labelId}
  >
    <span class="relevance-label-row"
      ><span id=${labelId} class="relevance-label" aria-hidden="true"
        >Match to your ${subject}:</span
      ><span class="relevance-label-short" aria-hidden="true">Match</span
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
