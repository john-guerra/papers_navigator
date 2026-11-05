import { html } from "htl";

let counter = 0;

/**
 * Toggletip (DESIGN.md → Toggletip): an ⓘ button that shows a short explanation on click or tap,
 * never on hover alone. The button has `aria-expanded` and `aria-controls`; the bubble is written
 * into a polite live region that is always in the page (empty while closed), so screen readers
 * announce it when it opens. Escape (marked handled, so the page's own Escape doesn't also fire),
 * a press outside it, or focus moving elsewhere close it. The bubble is absolutely positioned:
 * the caller's container sets `position: relative` to anchor it.
 *
 * @param {object} options
 * @param {string} options.label - the button's accessible name, e.g. "About the match levels"
 * @param {() => Node | string} options.content - the bubble's content, built on each open
 */
export function toggletip({ label, content }) {
  const id = `toggletip-${++counter}`;
  const button = html`<button
    type="button"
    class="toggletip-button"
    aria-label=${label}
    aria-expanded="false"
    aria-controls=${id}
  >
    <span aria-hidden="true">i</span>
  </button>`;
  const status = html`<span
    id=${id}
    class="toggletip-status"
    role="status"
    aria-live="polite"
  ></span>`;
  const el = html`<span class="toggletip">${button}${status}</span>`;

  const isOpen = () => button.getAttribute("aria-expanded") === "true";
  // A re-render can drop the element while it is open: it then stops listening
  const detached = () => !el.isConnected && (close(), true);
  const onKey = (event) => {
    if (detached() || event.key !== "Escape" || !isOpen()) return;
    event.preventDefault();
    close();
  };
  const onPointer = (event) => {
    if (!detached() && !el.contains(event.target)) close();
  };
  const onFocus = (event) => {
    if (!detached() && !el.contains(event.target)) close();
  };
  const open = () => {
    button.setAttribute("aria-expanded", "true");
    status.replaceChildren(
      html`<span class="toggletip-bubble">${content()}</span>`,
    );
    // Capture phase: runs before the page's own Escape handlers (paper details, pin)
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("focusin", onFocus, true);
  };
  const close = () => {
    button.setAttribute("aria-expanded", "false");
    status.replaceChildren();
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointerdown", onPointer, true);
    document.removeEventListener("focusin", onFocus, true);
  };
  button.onclick = () => (isOpen() ? close() : open());
  return el;
}
