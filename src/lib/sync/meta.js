import { reportStorageFailure } from "../storageHealth.js";
import { bump, stableHash } from "./clock.js";
import { identity } from "./entries.js";
import { isPlainObject, isVector } from "./validate.js";

/** Format of `h`: 2 = `identity(key, value)`; before (no `hv`), the hash of the whole value. */
const HV = 2;

/**
 * What a reconcile recorded but couldn't save (storage full), per storage and key:
 * `{raw, doc}`, where `raw` is what storage held then. Shared by every meta object of the page
 * (tracking's and the import's), and used only while storage still holds `raw` (another tab
 * that saved meanwhile wins), so the next edit gets a newer version than one already exported.
 */
const unsaved = new WeakMap();

function unsavedOf(storage, key) {
  if (
    !storage ||
    (typeof storage !== "object" && typeof storage !== "function")
  )
    return null;
  let m = unsaved.get(storage);
  if (!m) unsaved.set(storage, (m = new Map()));
  return {
    get: () => m.get(key),
    set: (v) => m.set(key, v),
    clear: () => m.delete(key),
  };
}

/** Only object records with a valid version vector (a damaged one would stop tracking). */
function cleanEntries(entries) {
  const out = {};
  if (!isPlainObject(entries)) return out;
  for (const [k, rec] of Object.entries(entries))
    if (isPlainObject(rec) && isVector(rec.v)) out[k] = rec;
  return out;
}

const clone = (x) => JSON.parse(JSON.stringify(x));

function makeDeviceId() {
  const id = globalThis.crypto?.randomUUID?.();
  if (id) return id.slice(0, 8);
  let s = "";
  while (s.length < 8) s += Math.floor(Math.random() * 36).toString(36);
  return s;
}

/**
 * Per-entry version record for two-way transfer. Stored at `papersNavigator:<id>:sync` as
 * `{device, hv: 2, entries: {[key]: {v, t, h, deleted?}}}`; `h` is the current value's
 * `identity` (a tombstone has `h: ""` and `deleted: true`), so a change of metadata only (a
 * paper's reason, an attended mark's time) is no change.
 */
export function createSyncMeta(
  conferenceId,
  storage = globalThis.localStorage,
  newDevice = makeDeviceId,
) {
  const key = `papersNavigator:${conferenceId}:sync`;

  const memo = unsavedOf(storage, key);

  function load() {
    try {
      const text = storage.getItem(key);
      const kept = memo?.get();
      if (kept && kept.raw === text) return clone(kept.doc);
      memo?.clear();
      const raw = JSON.parse(text);
      if (raw && typeof raw === "object" && !Array.isArray(raw))
        return {
          device: typeof raw.device === "string" ? raw.device : "",
          hv: raw.hv,
          entries: cleanEntries(raw.entries),
        };
    } catch {
      // missing or corrupt: start empty
    }
    return { device: "", hv: HV, entries: {} };
  }

  /**
   * False when the browser couldn't save it (reported). With `remember` (a reconcile), what
   * couldn't be saved is still used on this page (see `unsaved`).
   */
  function save(doc, { remember = false } = {}) {
    let before = null;
    try {
      before = storage.getItem(key);
      storage.setItem(key, JSON.stringify(doc));
      memo?.clear();
      return true;
    } catch {
      reportStorageFailure(key);
      if (remember) memo?.set({ raw: before, doc: clone(doc) });
      return false;
    }
  }

  /** Records `currentEntries` in `doc` (in place); returns the changed keys. */
  function record(doc, currentEntries, now) {
    const entries = doc.entries;
    // Records made before identity hashes: one still describing its value gets its identity
    // hash without a bump (a bump would make every paper a change on the next transfer)
    const migrate = doc.hv !== HV;
    const t = now.toISOString();
    const changed = [];
    for (const [k, value] of Object.entries(currentEntries)) {
      const h = identity(k, value);
      let rec = entries[k];
      if (migrate && rec && !rec.deleted && rec.h === stableHash(value))
        rec = entries[k] = { ...rec, h };
      if (rec && !rec.deleted && rec.h === h) continue;
      entries[k] = { v: bump(rec?.v, device), t, h };
      changed.push(k);
    }
    for (const [k, rec] of Object.entries(entries)) {
      if (k in currentEntries || rec.deleted) continue;
      entries[k] = { v: bump(rec.v, device), t, h: "", deleted: true };
      changed.push(k);
    }
    return { changed, migrate };
  }

  let device = load().device;
  if (!device) {
    device = newDevice();
    const { hv, entries } = load();
    save({ device, hv: Object.keys(entries).length ? hv : HV, entries });
  }

  return {
    device,
    read: () => load().entries,
    /** Replaces every record; false when it couldn't be saved. */
    write(entries) {
      return save({ device, hv: load().hv, entries });
    },
    /**
     * Versions what changed in `currentEntries` and saves it; returns the changed keys. When it
     * can't be saved, this page still uses the new versions (see `unsaved`).
     */
    reconcile(currentEntries, now = new Date()) {
      const doc = load();
      const { changed, migrate } = record(doc, currentEntries, now);
      // a record kept only on this page is saved as soon as storage takes it
      if (changed.length || migrate || memo?.get())
        save({ device, hv: HV, entries: doc.entries }, { remember: true });
      return changed;
    },
    /**
     * The records as a reconcile of `currentEntries` would make them, without saving anything:
     * for an export, so every value in the file carries its own version.
     */
    preview(currentEntries, now = new Date()) {
      const doc = load();
      record(doc, currentEntries, now);
      return doc.entries;
    },
  };
}
