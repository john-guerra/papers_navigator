import { html } from "htl";

const papersWord = (n) => `${n} ${n === 1 ? "paper" : "papers"}`;

/**
 * "Clear My Papers" (#164): a text button that asks first with an inline confirm (DESIGN.md →
 * Inline confirm; no native `confirm()`), then calls `onClear` (the page clears and shows
 * the Undo toast). Hidden while My Papers is empty. `count` and `watches` are read when
 * needed, so they reflect the list as it is; call `update()` after the list changes.
 */
export function clearMyPapers({ count, watches = () => 0, onClear }) {
  const root = html`<span class="clear-my-papers"></span>`;
  let asking = false;

  const showButton = () => {
    asking = false;
    const button = html`<button class="btn-text">Clear My Papers</button>`;
    button.onclick = showConfirm;
    root.replaceChildren(button);
    return button;
  };

  const cancel = () => showButton().focus();

  const showConfirm = () => {
    asking = true;
    const n = count();
    const yes = html`<button class="btn-secondary">Yes, clear</button>`;
    const no = html`<button class="btn-text">Cancel</button>`;
    yes.onclick = () => {
      showButton();
      onClear();
    };
    no.onclick = cancel;
    const stays = watches()
      ? "Your watches and notes stay."
      : "Your notes stay.";
    const group = html`<span
      class="clear-confirm"
      role="group"
      aria-label="Clear My Papers"
      >Remove all ${papersWord(n)} from My Papers? ${stays} ${yes} ${no}</span
    >`;
    group.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancel();
    });
    root.replaceChildren(group);
    // The safe choice: an extra Enter doesn't clear (Undo is there if it does)
    no.focus();
  };

  root.update = () => {
    root.hidden = !count();
    if (root.hidden || !asking) showButton();
  };
  root.update();
  return root;
}
