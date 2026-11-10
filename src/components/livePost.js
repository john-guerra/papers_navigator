import { html } from "htl";

/**
 * "Post" (#203 Stage C) for a Live row: a toggle and the slot it fills with `postPanel(paper)`
 * (built on first open, removed on close). `{button, slot}`; without `postPanel`, empty.
 */
export function postToggle(paper, postPanel) {
  if (!postPanel) return { button: "", slot: "" };
  const slot = html`<div class="live-post-slot"></div>`;
  const button = html`<button
    type="button"
    class="btn-text live-post"
    aria-expanded="false"
  >
    Post
  </button>`;
  button.onclick = () => {
    const open = !slot.firstChild;
    slot.replaceChildren(...(open ? [postPanel(paper)] : []));
    button.setAttribute("aria-expanded", String(open));
  };
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
