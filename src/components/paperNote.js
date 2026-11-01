import { html } from "htl";
import { showToast } from "./toast.js";
import { MAX_NOTE_LENGTH } from "../lib/notes.js";

let uid = 0;

/**
 * "My note" in the paper details (#152): a textarea that autosaves to the notes store
 * (`delay` ms after typing stops, and at once on blur or `el.flush()`), with "Delete note"
 * (Undo toast). An emptied note is no note. It follows the store (another tab) unless the
 * textarea has focus. Writing a note never adds the paper to My Papers.
 *
 * `el.flush()` saves pending typing (call it before removing the panel); `el.dispose()` also
 * stops listening to the store.
 */
export function renderPaperNote(
  paper,
  { notes, toast = showToast, delay = 500 },
) {
  const id = `paper-note-${++uid}`;
  const input = html`<textarea
    id=${id}
    class="paper-note-input"
    rows="3"
    maxlength=${MAX_NOTE_LENGTH}
    placeholder="Questions to ask, why it matters to you…"
  ></textarea>`;
  input.value = notes.get(paper.id);
  const status = html`<span class="paper-note-status"
    >Saved as you type, only on this device.</span
  >`;
  // Screen readers hear the first save and failures, not every pause in typing
  const live = html`<span class="sr-only" aria-live="polite"></span>`;
  const announce = (message) => {
    if (message !== lastAnnounced) live.textContent = lastAnnounced = message;
  };
  let lastAnnounced = "";
  const remove = html`<button type="button" class="btn-text paper-note-delete">
    Delete note
  </button>`;
  const showDelete = () => (remove.hidden = !notes.has(paper.id));
  showDelete();

  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = null;
    const ok = notes.set(paper.id, input.value);
    status.textContent = ok
      ? notes.has(paper.id)
        ? "Saved on this device."
        : "No note."
      : "This browser couldn't save the note (storage full or blocked); it is kept until you leave the page.";
    if (!ok || notes.has(paper.id)) announce(status.textContent);
    showDelete();
  };
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(save, delay);
  });
  input.addEventListener("blur", () => timer && save());
  // Reload, closing the tab or switching apps don't reliably blur the textarea
  const onPageHide = () => timer && save();
  const onVisibility = () =>
    document.visibilityState === "hidden" && onPageHide();
  addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibility);

  remove.onclick = () => {
    clearTimeout(timer);
    timer = null;
    const undo = notes.delete(paper.id);
    input.value = "";
    status.textContent = "No note.";
    showDelete();
    toast("Note deleted", {
      actionLabel: "Undo",
      onAction: () => {
        undo();
        input.value = notes.get(paper.id);
        status.textContent = "Saved on this device.";
        showDelete();
      },
    });
    input.focus();
  };

  // Changed elsewhere (another tab, an import): show it, unless you're typing here
  const onStore = () => {
    if (document.activeElement !== input && !timer)
      input.value = notes.get(paper.id);
    showDelete();
  };
  notes.addEventListener("input", onStore);

  const el = html`<section class="paper-note">
    <h3><label for=${id}>📝 My note</label></h3>
    ${input}
    <p class="paper-note-footer muted">${status} ${remove}${live}</p>
  </section>`;
  el.flush = () => timer && save();
  el.dispose = () => {
    el.flush();
    notes.removeEventListener("input", onStore);
    removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisibility);
  };
  return el;
}
