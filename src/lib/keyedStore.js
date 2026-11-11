import { reportStorageFailure } from "./storageHealth.js";
/**
 * A per-paper store in localStorage (#208): `{paperId: entry}` under `key`, validated by `clean`,
 * reactive (`.value`, `input` events, also from other tabs). Every write re-reads storage first,
 * so a stale tab (e.g. restored from the back/forward cache) never drops newer entries (the #205
 * review lesson). `merge(incoming)` adds entries for papers you don't have (yours win) and returns
 * `{added, undo}`; undo removes only the added entries still unchanged.
 */
export function createKeyedStore(
  key,
  clean,
  storage = globalThis.localStorage,
  events = globalThis,
) {
  const store = new EventTarget();
  const load = () => {
    try {
      return clean(JSON.parse(storage?.getItem(key) ?? "{}"));
    } catch {
      return {};
    }
  };
  let value = load();
  const write = (next) => {
    value = next;
    try {
      storage?.setItem(key, JSON.stringify(next));
    } catch (error) {
      console.warn(`Could not save ${key} on this device`, error);
      reportStorageFailure();
    }
    store.dispatchEvent(new Event("input"));
  };
  const onStorage = (event) => {
    if (event.key !== key) return;
    value = load();
    store.dispatchEvent(new Event("input"));
  };
  events?.addEventListener?.("storage", onStorage);
  Object.defineProperty(store, "value", { get: () => value });
  store.get = (id) => value[id];
  /** Sets one entry (`undefined` removes it); a no-op when unchanged. */
  store.put = (id, entry) => {
    value = load();
    if (JSON.stringify(value[id]) === JSON.stringify(entry)) return;
    const next = { ...value };
    if (entry === undefined) delete next[id];
    else next[id] = entry;
    write(next);
  };
  /** Several entries at once (one write; `undefined` removes one); ids `skip(id, current)` stay. */
  store.putMany = (entries, skip = () => false) => {
    value = load();
    const next = { ...value };
    let changed = false;
    for (const [id, entry] of entries)
      if (!skip(id, next[id])) {
        if (entry === undefined) delete next[id];
        else next[id] = entry;
        changed = true;
      }
    if (changed) write(next);
  };
  store.merge = (incoming) => {
    value = load();
    const adding = Object.entries(clean(incoming)).filter(
      ([id]) => !(id in value),
    );
    if (adding.length) write({ ...value, ...Object.fromEntries(adding) });
    const undo = () => {
      value = load();
      const next = { ...value };
      let changed = false;
      for (const [id, entry] of adding)
        if (JSON.stringify(next[id]) === JSON.stringify(entry))
          (delete next[id], (changed = true));
      if (changed) write(next);
    };
    return { added: adding.length, undo };
  };
  store.dispose = () => events?.removeEventListener?.("storage", onStorage);
  return store;
}
