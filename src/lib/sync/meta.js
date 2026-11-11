import { reportStorageFailure } from "../storageHealth.js";
import { bump, stableHash } from "./clock.js";

function makeDeviceId() {
  const id = globalThis.crypto?.randomUUID?.();
  if (id) return id.slice(0, 8);
  let s = "";
  while (s.length < 8) s += Math.floor(Math.random() * 36).toString(36);
  return s;
}

/**
 * Per-entry version record for two-way transfer. Stored at `papersNavigator:<id>:sync` as
 * `{device, entries: {[key]: {v, t, h, deleted?}}}`; `h` is the hash of the current value
 * (a tombstone has `h: ""` and `deleted: true`).
 */
export function createSyncMeta(
  conferenceId,
  storage = globalThis.localStorage,
  newDevice = makeDeviceId,
) {
  const key = `papersNavigator:${conferenceId}:sync`;

  function load() {
    try {
      const raw = JSON.parse(storage.getItem(key));
      if (raw && typeof raw === "object" && !Array.isArray(raw))
        return {
          device: typeof raw.device === "string" ? raw.device : "",
          entries:
            raw.entries && typeof raw.entries === "object" ? raw.entries : {},
        };
    } catch {
      // missing or corrupt: start empty
    }
    return { device: "", entries: {} };
  }

  function save(doc) {
    try {
      storage.setItem(key, JSON.stringify(doc));
    } catch {
      reportStorageFailure(key);
    }
  }

  let device = load().device;
  if (!device) {
    device = newDevice();
    save({ device, entries: load().entries });
  }

  return {
    device,
    read: () => load().entries,
    write(entries) {
      save({ device, entries });
    },
    reconcile(currentEntries, now = new Date()) {
      const doc = load();
      const entries = doc.entries;
      const t = now.toISOString();
      const changed = [];
      for (const [k, value] of Object.entries(currentEntries)) {
        const h = stableHash(value);
        const rec = entries[k];
        if (rec && !rec.deleted && rec.h === h) continue;
        entries[k] = { v: bump(rec?.v, device), t, h };
        changed.push(k);
      }
      for (const [k, rec] of Object.entries(entries)) {
        if (k in currentEntries || rec.deleted) continue;
        entries[k] = { v: bump(rec.v, device), t, h: "", deleted: true };
        changed.push(k);
      }
      if (changed.length) save({ device, entries });
      return changed;
    },
  };
}
