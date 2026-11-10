import { reportStorageFailure } from "./storageHealth.js";
/**
 * Paper ratings (#203, the Live page): 1–5 stars on any paper, to remember which ones you liked.
 *
 * Privacy: like notes, ratings live only in this browser's localStorage, per conference
 * (`papersNavigator:<id>:ratings`, `{paperId: 1..5}`). They never go in a URL, a share link or
 * a request.
 */

const isRating = (n) => Number.isInteger(n) && n >= 1 && n <= 5;

/** Validated ratings from storage: `{paperId: 1..5}`, anything else dropped. */
export function cleanRatings(ratings) {
  if (!ratings || typeof ratings !== "object" || Array.isArray(ratings))
    return {};
  const out = {};
  for (const [id, n] of Object.entries(ratings))
    if (id && isRating(n)) out[id] = n;
  return out;
}

/** Imported ratings for papers you haven't rated (yours win): `{ratings, added}`. */
export function mergeRatings(current, incoming) {
  const ratings = { ...current };
  let added = 0;
  for (const [id, n] of Object.entries(cleanRatings(incoming)))
    if (!(id in ratings)) ((ratings[id] = n), added++);
  return { ratings, added };
}

/** " · 3 ratings added" for the import message ("" for none). */
export function importedRatingsText(added) {
  return added ? ` · ${added} ${added === 1 ? "rating" : "ratings"} added` : "";
}

/**
 * Ratings, persisted per conference. Reactive store: `.value` is `{paperId: n}` and it emits
 * `input` on every change (also another tab's). `get(id)` is 0 when unrated; `set(id, 0)` clears
 * it; values outside 1–5 are ignored. `dispose()` stops following other tabs.
 */
export function createRatingsStore(
  conferenceId,
  storage = globalThis.localStorage,
  events = globalThis,
) {
  const key = `papersNavigator:${conferenceId}:ratings`;
  const store = new EventTarget();
  const load = () => {
    try {
      return cleanRatings(JSON.parse(storage?.getItem(key) ?? "{}"));
    } catch {
      return {};
    }
  };
  let value = load();
  const onStorage = (event) => {
    if (event.key !== key) return;
    value = load();
    store.dispatchEvent(new Event("input"));
  };
  events?.addEventListener?.("storage", onStorage);
  Object.defineProperty(store, "value", { get: () => value });
  const write = (next) => {
    value = next;
    try {
      storage?.setItem(key, JSON.stringify(next));
    } catch (error) {
      console.warn("Could not save ratings on this device", error);
      reportStorageFailure();
    }
    store.dispatchEvent(new Event("input"));
  };
  store.get = (id) => value[id] ?? 0;
  store.set = (id, n) => {
    if (n !== 0 && !isRating(n)) return;
    // Re-read first: a tab restored from the back/forward cache may have missed other tabs'
    // ratings, and writing its old copy would drop them (#203 Stage B review)
    value = load();
    if ((value[id] ?? 0) === n) return;
    const next = { ...value };
    if (n) next[id] = n;
    else delete next[id];
    write(next);
  };
  // Imported ratings (Export / Import JSON); undo removes the ones it added, unless changed since
  store.merge = (incoming) => {
    value = load();
    const { ratings, added } = mergeRatings(value, incoming);
    const addedIds = Object.keys(ratings).filter((id) => !(id in value));
    if (added) write(ratings);
    const undo = () => {
      const next = { ...value };
      let changed = false;
      for (const id of addedIds)
        if (next[id] === ratings[id]) (delete next[id], (changed = true));
      if (changed) write(next);
    };
    return { added, undo };
  };
  store.dispose = () => events?.removeEventListener?.("storage", onStorage);
  return store;
}
