import { html } from "htl";

/**
 * "Post" (#203 Stage C) for a Live row: a toggle and the slot it fills with `postPanel(paper)`
 * on open (`open`: start open) and empties on close (`onClose(paper)`). `{button, slot}`;
 * without `postPanel`, empty.
 */
export function postToggle(paper, postPanel, { open = false, onClose } = {}) {
  if (!postPanel) return { button: "", slot: "" };
  const slot = html`<div class="live-post-slot"></div>`;
  const button = html`<button
    type="button"
    class="btn-text live-post"
    aria-expanded="false"
  >
    Post
  </button>`;
  const show = (on) => {
    slot.replaceChildren(...(on ? [postPanel(paper)] : []));
    button.setAttribute("aria-expanded", String(on));
  };
  button.onclick = () => {
    const on = !slot.firstChild;
    show(on);
    if (!on) onClose?.(paper);
  };
  // A panel kept across a list redraw (the page caches it) starts open
  if (open) show(true);
  return { button, slot };
}

/** "💬 Discussion": the @papers.ieeevis.org post about a paper, on Bluesky. */
export function discussionLink(url) {
  return html`<a
    class="live-discussion"
    href=${url}
    target="_blank"
    rel="noopener"
    >💬 Discussion</a
  >`;
}
