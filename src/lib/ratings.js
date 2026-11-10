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
  store.get = (id) => value[id] ?? 0;
  store.set = (id, n) => {
    if (n !== 0 && !isRating(n)) return;
    if ((value[id] ?? 0) === n) return;
    const next = { ...value };
    if (n) next[id] = n;
    else delete next[id];
    value = next;
    try {
      storage?.setItem(key, JSON.stringify(next));
    } catch (error) {
      console.warn("Could not save ratings on this device", error);
    }
    store.dispatchEvent(new Event("input"));
  };
  store.dispose = () => events?.removeEventListener?.("storage", onStorage);
  return store;
}
