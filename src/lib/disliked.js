import { createKeyedStore } from "./keyedStore.js";

/**
 * "👎 Not for me" (#208): papers you didn't like, on this device only
 * (`papersNavigator:<id>:disliked`, `{paperId: true}`) and in Export / Import. Kept apart from
 * the 1–5 ratings so an older tab, which cleans ratings to 1–5 before writing, can't erase them.
 */
export function cleanDisliked(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([id, on]) => id && on === true),
  );
}

/** `.has(id)`, `.set(id, on)`, `.value`, `.merge(incoming)`, `.dispose()`; emits `input`. */
export function createDislikedStore(
  conferenceId,
  storage = globalThis.localStorage,
  events = globalThis,
) {
  const store = createKeyedStore(
    `papersNavigator:${conferenceId}:disliked`,
    cleanDisliked,
    storage,
    events,
  );
  store.has = (id) => store.get(id) === true;
  store.set = (id, on) => store.put(id, on ? true : undefined);
  return store;
}

/** " · 3 not for me added" for the import message ("" for none). */
export function importedDislikedText(added) {
  return added ? ` · ${added} not for me added` : "";
}
