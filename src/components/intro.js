/**
 * Explore's intro (`<details class="lede" open>`, #174) opens on a first visit; closing it, and
 * opening it again, is remembered on this device (INTRO_KEY: "closed" or "open").
 *
 * The state lives on `root` (<html>) as `data-intro="open|closed"`: the head script
 * (observablehq.config.js) writes it from storage before the page draws, and style.css folds the
 * statically open intro by it, so a closed intro doesn't flash open while the page's cells run
 * (#162's pattern), until this syncs the element's `open` to it (class `intro-ready`: from then
 * on the element folds itself) and keeps the attribute and storage current. Returns a function
 * that stops listening.
 */
export const INTRO_KEY = "papersNavigator:intro";

export function rememberIntro(
  details,
  {
    storage = globalThis.localStorage,
    root = details.ownerDocument.documentElement,
  } = {},
) {
  let stored = null;
  try {
    stored = storage?.getItem(INTRO_KEY);
  } catch {
    // Private mode etc.: open, as on a first visit
  }
  let state = stored === "closed" ? "closed" : "open";
  details.open = state === "open";
  root.dataset.intro = state;
  details.classList.add("intro-ready");
  const onToggle = () => {
    // Setting `open` above fires a toggle too: nothing changed, nothing to write
    if (state === (details.open ? "open" : "closed")) return;
    state = details.open ? "open" : "closed";
    root.dataset.intro = state;
    try {
      storage?.setItem(INTRO_KEY, state);
    } catch {
      // still toggles for this page view
    }
  };
  details.addEventListener("toggle", onToggle);
  return () => details.removeEventListener("toggle", onToggle);
}
