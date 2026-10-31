/**
 * A ✕ inside Explore's search field that empties it (#128), in place of a "Search" chip under
 * the facets: same action, no extra row. Shown only while the field has text; `onClear` does
 * the clearing (so the page's own setQuery runs), then the field keeps focus.
 * `button.sync()` re-checks the field after a programmatic change.
 */
export function addSearchClear(form, onClear) {
  const input = form.querySelector("input");
  const button = Object.assign(document.createElement("button"), {
    type: "button",
    className: "search-clear",
    textContent: "✕",
  });
  button.setAttribute("aria-label", "Clear search");
  button.sync = () => (button.hidden = !input.value);
  button.onclick = () => {
    onClear();
    button.sync();
    input.focus();
  };
  form.addEventListener("input", button.sync);
  form.classList.add("has-search-clear");
  form.append(button);
  button.sync();
  return button;
}
