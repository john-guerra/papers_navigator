import { html } from "htl";
import { MAX_NOTE_LENGTH } from "../lib/notes.js";

/**
 * Quick note (#203, Live page): a one-line field that grows as you type, writing the paper's
 * note (the same "📝 My note" as in the details) `delay` ms after typing stops and at once on
 * blur. It follows the store (another tab, the details panel) unless it has focus.
 * `el.flush()` saves pending typing; `el.dispose()` also stops following the store.
 */
export function quickNote(paper, { notes, delay = 500 } = {}) {
  const input = html`<textarea
    class="quick-note"
    rows="1"
    maxlength=${MAX_NOTE_LENGTH}
    placeholder="Quick note…"
    aria-label=${`Quick note on ${paper.title ?? "this paper"}`}
  ></textarea>`;
  const grow = () => {
    input.style.height = "auto";
    if (input.scrollHeight) input.style.height = `${input.scrollHeight}px`;
  };
  input.value = notes.get(paper.id);
  // Fit an existing (multi-line) note once the field is in the page
  (globalThis.requestAnimationFrame ?? ((f) => setTimeout(f)))(grow);
  let timer = null;
  let statusTimer = null;
  // "Saved" on screen after every save; for screen readers only once per visit to the field
  // (autosave runs every pause in typing, and repeating it would talk over the user)
  const status = html`<span
    class="quick-note-status muted"
    aria-hidden="true"
  ></span>`;
  const live = html`<span
    class="quick-note-live sr-only"
    aria-live="polite"
  ></span>`;
  let announced = false;
  const save = () => {
    clearTimeout(timer);
    timer = null;
    if (input.value.trim() !== notes.get(paper.id)) {
      const saved = notes.set(paper.id, input.value);
      // A quiet "Saved" (Stage E); failures go to the page's storage banner
      if (saved !== false) {
        status.textContent = "Saved";
        if (!announced) live.textContent = "Saved";
        announced = true;
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => {
          status.textContent = "";
          live.textContent = "";
        }, 2000);
      }
    }
  };
  input.addEventListener("input", () => {
    grow();
    clearTimeout(timer);
    timer = setTimeout(save, delay);
  });
  input.addEventListener("blur", () => {
    save();
    announced = false;
  });
  input.addEventListener("focus", () => (announced = false));
  const follow = () => {
    if (document.activeElement === input || timer) return;
    input.value = notes.get(paper.id);
    grow();
  };
  notes.addEventListener("input", follow);
  const el = html`<div class="quick-note-field">${input}${status}${live}</div>`;
  el.flush = () => timer && save();
  el.dispose = () => {
    el.flush();
    notes.removeEventListener("input", follow);
  };
  return el;
}
