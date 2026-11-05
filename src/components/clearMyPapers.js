import { html } from "htl";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
let ids = 0;

/**
 * "Clear My Papers" (#164): a text button that asks first with an inline confirm (DESIGN.md →
 * Inline confirm; no native `confirm()`), then calls `onClear({stopWatches})`; the page clears
 * and shows the Undo toast. Without watches the confirm is "[Clear] [Cancel]"; with watches it
 * offers "Clear papers only" / "Clear papers and stop N watches". Hidden while My Papers is
 * empty. `count` and `watches` are read on every draw: call `update()` after the list changes
 * and an open question follows it. `emptyFocus` gives the element to focus when the list
 * empties while the question has focus.
 */
export function clearMyPapers({
  count,
  watches = () => 0,
  onClear,
  emptyFocus = () => null,
}) {
  const root = html`<span class="clear-my-papers"></span>`;
  const id = `clear-my-papers-${++ids}`;
  let asking = false;

  const showButton = () => {
    asking = false;
    const button = html`<button class="btn-text">Clear My Papers</button>`;
    button.onclick = showConfirm;
    root.replaceChildren(button);
    return button;
  };

  const cancel = () => showButton().focus();

  const choice = (label, kind, onclick) => {
    const button = html`<button
      class=${kind === "cancel" ? "btn-text" : "btn-secondary"}
    >
      ${label}
    </button>`;
    button.dataset.choice = kind;
    button.onclick = onclick;
    return button;
  };
  const clear = (stopWatches) => () => {
    showButton();
    onClear({ stopWatches });
  };

  // Drawn again by update() while open; the focused choice keeps the focus
  const showConfirm = () => {
    const focused = root.contains(document.activeElement)
      ? document.activeElement.dataset?.choice
      : null;
    asking = true;
    const n = count();
    const w = watches();
    const choices = w
      ? [
          choice("Clear papers only", "papers", clear(false)),
          choice(
            `Clear papers and stop ${plural(w, "watch", "watches")}`,
            "watches",
            clear(true),
          ),
        ]
      : [choice("Clear", "papers", clear(false))];
    const no = choice("Cancel", "cancel", cancel);
    const stays = w
      ? "Your notes stay. Watches you keep add papers the program gains later."
      : "Your notes stay.";
    // Named by the question, described by what stays: both heard when focus lands on Cancel
    const group = html`<span
      class="clear-confirm"
      role="group"
      aria-labelledby=${`${id}-q`}
      aria-describedby=${`${id}-d`}
      ><span id=${`${id}-q`}
        >Remove all ${plural(n, "paper", "papers")} from My Papers?</span
      >
      <span id=${`${id}-d`}>${stays}</span> ${choices} ${no}</span
    >`;
    group.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancel();
    });
    root.replaceChildren(group);
    // The safe choice first: an extra Enter doesn't clear (Undo is there if it does)
    (root.querySelector(`[data-choice="${focused}"]`) ?? no).focus();
  };

  root.update = () => {
    const hadFocus = root.contains(document.activeElement);
    root.hidden = !count();
    if (root.hidden) {
      const wasAsking = asking;
      showButton();
      if (wasAsking && hadFocus) emptyFocus()?.focus();
    } else if (asking) showConfirm();
    else if (!root.childElementCount) showButton();
  };
  root.focusButton = () => root.querySelector("button")?.focus();
  root.update();
  return root;
}
