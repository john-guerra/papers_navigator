import { html } from "htl";
import { MAX_ABSTRACTS, splitAbstracts } from "../lib/myResearch.js";

const abstractsWord = (n) => `${n} ${n === 1 ? "abstract" : "abstracts"}`;

/**
 * "My research" in Explore (#27, US11.4): a secondary button under the search that opens an
 * inline panel (no dialog) to paste one or more abstracts and rank the program against them.
 * `text` = the saved abstracts, `active` = ranking by them now, `ready` = the model is loaded,
 * `open` = panel open (kept by the page across re-renders through `onToggle`).
 * `savedTopics()` = research topics saved from abstracts (`[{id, name}]`, read on click so the
 * panel doesn't re-render when rules change). `onRank(text)`, `onForget({topics})` with the ids
 * of the research topics to stop watching too ([] = abstracts only).
 */
export function myResearch(
  {
    text = "",
    active = false,
    ready = true,
    open: startOpen = false,
    savedTopics = () => [],
  },
  { onRank, onForget, onToggle },
) {
  const toggle = html`<button
    type="button"
    class="btn-secondary my-research-open"
    aria-expanded="false"
    aria-controls="my-research-panel"
  >
    My research
  </button>`;
  const textarea = html`<textarea
    id="my-research-text"
    rows="7"
    spellcheck="false"
    placeholder="Paste an abstract. For several projects, leave a blank line between abstracts."
  ></textarea>`;
  textarea.value = text;
  const count = html`<span
    class="my-research-count muted"
    aria-live="polite"
  ></span>`;
  const rank = html`<button
    type="button"
    class="btn-primary my-research-rank"
  ></button>`;
  const forget = html`<button type="button" class="btn-text my-research-forget">
    Delete from this device
  </button>`;
  const cancel = html`<button type="button" class="btn-text">Cancel</button>`;
  const panel = html`<div
    id="my-research-panel"
    class="my-research-panel"
    hidden
  >
    <label for="my-research-text" class="my-research-label"
      >Rank the program against your own abstracts (up to ${MAX_ABSTRACTS},
      separated by a blank line). Each paper is scored by its closest
      abstract.</label
    >
    ${textarea}
    <p class="my-research-privacy muted">
      Stays on this device: saved in this browser only, never sent anywhere or
      put in share links.
    </p>
    <div class="my-research-actions">${rank}${count}${forget}${cancel}</div>
  </div>`;

  const sync = () => {
    const n = splitAbstracts(textarea.value).length;
    count.textContent = n ? abstractsWord(n) : "";
    rank.disabled = !n || !ready;
    rank.textContent = ready
      ? "Rank the program"
      : "Loading the language model…";
    forget.hidden = !text;
  };
  const setOpen = (on) => {
    panel.hidden = !on;
    toggle.setAttribute("aria-expanded", String(on));
    if (on) {
      sync();
      textarea.focus();
    }
    onToggle?.(on);
  };
  textarea.oninput = sync;
  toggle.onclick = () => setOpen(panel.hidden);
  cancel.onclick = () => {
    textarea.value = text;
    setOpen(false);
    toggle.focus();
  };
  rank.onclick = () => {
    if (!splitAbstracts(textarea.value).length) return;
    onRank(textarea.value);
    setOpen(false);
  };
  const actions = panel.querySelector(".my-research-actions");
  const forgetNow = (topics) => {
    confirmBox?.remove();
    confirmBox = null;
    actions.hidden = false;
    textarea.value = "";
    onForget({ topics });
    sync();
  };
  // Saved research topics keep their own copy of the abstracts: say so, and offer to delete
  // them too (inline confirm, DESIGN.md; the page's toast carries Undo)
  let confirmBox = null;
  forget.onclick = () => {
    const topics = savedTopics();
    if (!topics.length) return forgetNow([]);
    const names = topics.map((t) => `“${t.name}”`).join(", ");
    const only = html`<button
      type="button"
      class="btn-secondary my-research-forget-only"
    >
      Delete abstracts only
    </button>`;
    const all = html`<button
      type="button"
      class="btn-secondary my-research-forget-all"
    >
      Also stop watching ${topics.length === 1 ? "it" : "them"}
    </button>`;
    const back = html`<button
      type="button"
      class="btn-text my-research-forget-cancel"
    >
      Cancel
    </button>`;
    only.onclick = () => forgetNow([]);
    all.onclick = () => forgetNow(topics.map((t) => t.id));
    back.onclick = () => {
      confirmBox.remove();
      confirmBox = null;
      actions.hidden = false;
      forget.focus();
    };
    confirmBox = html`<div class="my-research-confirm" role="group">
      <p>
        Your research ${topics.length === 1 ? "topic" : "topics"} ${names}
        ${topics.length === 1 ? "keeps its" : "keep their"} own copy of the
        abstracts on this device.
      </p>
      <div class="my-research-actions">${only}${all}${back}</div>
    </div>`;
    actions.hidden = true;
    actions.after(confirmBox);
    only.focus();
  };
  if (active) toggle.classList.add("is-active");
  sync();
  panel.hidden = !startOpen;
  toggle.setAttribute("aria-expanded", String(startOpen));
  return html`<div class="my-research">${toggle}${panel}</div>`;
}
