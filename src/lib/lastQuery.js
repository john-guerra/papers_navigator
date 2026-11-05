import { MAX_QUERY } from "./urlState.js";

/**
 * Explore's last search, kept on this device (#174), so opening the bare URL again shows it
 * instead of the conference's default search: the default is for first visits only. A cleared
 * (empty) search counts as one. Stored as JSON in localStorage, per conference; like the URL
 * fragment, it never leaves the browser.
 */
export const lastQueryKey = (conferenceId) =>
  `papersNavigator:${conferenceId}:lastQuery`;

/** The remembered search ("" for a cleared one), or null: nothing (readable) remembered. */
export function readLastQuery(conferenceId, storage) {
  try {
    const value = JSON.parse(storage?.getItem(lastQueryKey(conferenceId)));
    return typeof value === "string" ? value.slice(0, MAX_QUERY) : null;
  } catch {
    return null;
  }
}

/**
 * Saves the search box's value whenever the person changes it (typing, an example chip, ✕,
 * Clear all), never its start value: someone who never searched keeps getting the current
 * default. `input` is the search widget (its `.value` is the text). Returns a stop function.
 */
export function rememberQuery(
  input,
  conferenceId,
  { storage = globalThis.localStorage } = {},
) {
  const save = () => {
    try {
      storage?.setItem(
        lastQueryKey(conferenceId),
        JSON.stringify(String(input.value ?? "")),
      );
    } catch {
      // Private mode etc.: the search still works, it just isn't remembered
    }
  };
  input.addEventListener("input", save);
  return () => input.removeEventListener("input", save);
}
