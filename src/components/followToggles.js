import { html } from "htl";

/**
 * "Add to My Papers" / "In My Papers" toggles that refresh in place: `toggle(p)` makes one,
 * `update()` re-reads `inMyPapers` for all of them. Lets a list or panel stay put (scroll,
 * focus, "Show more" expansion) when only My Papers changes, instead of re-rendering.
 */
export function followToggles({ inMyPapers, onToggle }) {
  const toggles = [];
  const sync = ({ button, label, paper }) => {
    const on = inMyPapers(paper.id);
    button.setAttribute("aria-pressed", String(on));
    button.title = on ? "In My Papers — remove" : "Add to My Papers";
    label.textContent = on ? "In My Papers" : "Add to My Papers";
  };
  const toggle = (paper) => {
    const label = html`<span></span>`;
    const button = html`<button class="follow-toggle">
      <span class="ring" aria-hidden="true"></span>${label}
    </button>`;
    button.onclick = () => onToggle(paper);
    const entry = { button, label, paper };
    sync(entry);
    toggles.push(entry);
    return button;
  };
  const update = () => toggles.forEach(sync);
  return { toggle, update };
}
