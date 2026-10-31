import { html } from "htl";

const papersWord = (n) => (n === 1 ? "paper" : "papers");

/**
 * "Matching papers n · Add N to My Papers · k already there" (DESIGN.md → Add bar).
 * `disabledHint` turns bulk add off with a reason (e.g. nothing narrows the list, so one click
 * would add the whole program).
 *
 * #142: the bar is Explore's sticky list header. "↑ Top" (shown by CSS once the list has
 * scrolled) and the title call `onTop`; the title is the focus target afterwards (tabindex -1).
 * Phones show the short "n papers" label. The notes sit after the bar, outside it, so the header
 * stays one line; the wrapper is `display: contents`, so the bar sticks within the whole list.
 */
export function renderAddBar(
  { total, fresh, already },
  { onAdd, disabledHint, onTop } = {},
) {
  const allIn = total > 0 && fresh.length === 0;
  const button = html`<button
    class="btn-primary add-bar-button"
    disabled=${fresh.length === 0 || Boolean(disabledHint)}
  >
    ${allIn ? `✓ All ${total} in My Papers` : `Add ${fresh.length} to My Papers`}
  </button>`;
  button.onclick = () => onAdd(fresh);
  const title = html`<h2 class="add-bar-title" tabindex="-1">
    <span class="add-bar-long"
      >Matching papers <span class="count">${total}</span></span
    ><span class="add-bar-short">${total} ${papersWord(total)}</span>
  </h2>`;
  const top = html`<button
    type="button"
    class="btn-text add-bar-top"
    aria-label="Back to the top of the list"
  >
    <span aria-hidden="true">↑</span> Top
  </button>`;
  top.onclick = () => onTop?.();
  // The title scrolls back only while the header is stuck: before that, the list's top is already
  // in view and a tap would jump the page (on phones, past the map) (#143 review)
  title.onclick = () => title.closest(".is-scrolled") && onTop?.();
  const notes = [
    already && !allIn ? `${already} already there` : null,
    disabledHint && !allIn ? disabledHint : null,
    total === 0 ? `No ${papersWord(0)} match. Try clearing a filter.` : null,
  ].filter(Boolean);
  return html`<div class="add-bar-group">
    <div class="add-bar">${title}${button}${top}</div>
    ${
      notes.length
        ? html`<p class="add-bar-notes">
            ${notes.map((note) => html`<span class="add-bar-note">${note}</span>`)}
          </p>`
        : ""
    }
  </div>`;
}
