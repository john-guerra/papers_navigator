import { reportStorageFailure } from "../storageHealth.js";
import { bump, stableHash } from "./clock.js";
import { identity } from "./entries.js";

/** Format of `h`: 2 = `identity(key, value)`; before (no `hv`), the hash of the whole value. */
const HV = 2;

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

  function load() {
    try {
      const raw = JSON.parse(storage.getItem(key));
      if (raw && typeof raw === "object" && !Array.isArray(raw))
        return {
          device: typeof raw.device === "string" ? raw.device : "",
          hv: raw.hv,
          entries:
            raw.entries && typeof raw.entries === "object" ? raw.entries : {},
        };
    } catch {
      // missing or corrupt: start empty
    }
    return { device: "", hv: HV, entries: {} };
  }

  /** False when the browser couldn't save it (reported). */
  function save(doc) {
    try {
      storage.setItem(key, JSON.stringify(doc));
      return true;
    } catch {
      reportStorageFailure(key);
      return false;
    }
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
    reconcile(currentEntries, now = new Date()) {
      const doc = load();
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
      if (changed.length || migrate) save({ device, hv: HV, entries });
      return changed;
    },
  };
}
