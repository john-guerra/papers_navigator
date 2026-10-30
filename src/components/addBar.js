import { html } from "htl";

const papersWord = (n) => (n === 1 ? "paper" : "papers");

/**
 * "Matching papers n · Add N to My Papers · k already there" (DESIGN.md → Add bar).
 * `disabledHint` turns bulk add off with a reason (e.g. nothing narrows the list, so one click
 * would add the whole program).
 */
export function renderAddBar(
  { total, fresh, already },
  { onAdd, disabledHint } = {},
) {
  const allIn = total > 0 && fresh.length === 0;
  const button = html`<button
    class="btn-primary add-bar-button"
    disabled=${fresh.length === 0 || Boolean(disabledHint)}
  >
    ${allIn ? `✓ All ${total} in My Papers` : `Add ${fresh.length} to My Papers`}
  </button>`;
  button.onclick = () => onAdd(fresh);
  return html`<div class="add-bar">
    <h2 class="add-bar-title">
      Matching papers <span class="count">${total}</span>
    </h2>
    ${button}
    ${already && !allIn ? html`<span class="add-bar-note">${already} already there</span>` : ""}
    ${disabledHint && !allIn ? html`<span class="add-bar-note">${disabledHint}</span>` : ""}
    ${total === 0 ? html`<span class="add-bar-note">No ${papersWord(0)} match. Try clearing a filter.</span>` : ""}
  </div>`;
}
