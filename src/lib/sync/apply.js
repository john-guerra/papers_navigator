import { createAttendedStore } from "../attended.js";
import { createDislikedStore } from "../disliked.js";
import { createFollowedStore } from "../followed.js";
import { exportMyPapers, parseMyPapersFile } from "../myPapersFile.js";
import { createNotesStore } from "../notes.js";
import { createRatingsStore } from "../ratings.js";
import { createRulesStore, normalizeRule } from "../rules.js";
import { reportStorageFailure } from "../storageHealth.js";
import { busy } from "./busy.js";
import { stableHash } from "./clock.js";
import { fromEntries, splitKey, toEntries } from "./entries.js";
import { readState } from "./state.js";
import { isPlainObject, isSyncKey } from "./validate.js";

/**
 * Writes an import into the stores (two-way transfer), so that nothing is ever lost:
 * - before anything changes, a snapshot of all the data (v3 payload; the last 3 per
 *   conference, newest first, at `papersNavigator:<id>:syncSnapshots`);
 * - then the version records (meta), then the stores, one write each: another tab that
 *   reconciles on a store's `storage` event already finds the import's versions recorded, so it
 *   doesn't take the imported values for its own edits;
 * - last, an undo record (`papersNavigator:<id>:syncUndo`, 7 days, survives a reload) with every
 *   changed entry's previous value (a note discarded by a clash choice included) and version.
 * Undo reverts only entries still as the import left them, so it never loses a later edit.
 *
 * `ctx` is `{stores, meta, conferenceId, storage, now}`: `stores` are the page's store objects
 * (`{followed, rules, notes, ratings, disliked, attended}`; a missing one is written through a
 * fresh store on `storage`), `meta` is `createSyncMeta(conferenceId, storage)`.
 */

const DAY = 24 * 3600_000;
const UNDO_DAYS = 7;
const MAX_SNAPSHOTS = 3;
const NONE = { reverted: [], skipped: [] };

const snapshotsKey = (id) => `papersNavigator:${id}:syncSnapshots`;
const undoKey = (id) => `papersNavigator:${id}:syncUndo`;
const storageOf = (ctx) => ctx.storage ?? globalThis.localStorage;
const nowOf = (ctx) => ctx.now ?? new Date();
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
/** Hash of an entry as `toEntries` gives it; "" when absent (as a tombstone's `h`). */
const hashIn = (entries, key) =>
  own(entries, key) ? stableHash(entries[key]) : "";
const sameRecord = (a, b) => stableHash(a ?? null) === stableHash(b ?? null);

function storageError(message) {
  reportStorageFailure();
  return Object.assign(new Error(message), { code: "storage" });
}

const currentEntries = (ctx) =>
  toEntries(readState(ctx.conferenceId, storageOf(ctx)));

/**
 * `value` as its store will hold it and `toEntries` read it back (so its hash is the one a
 * reconcile computes), or undefined when the store can't hold it.
 */
function canonical(key, value, now) {
  const [store, id] = splitKey(key);
  if (!id) return undefined;
  if (store === "followed") {
    if (!isPlainObject(value)) return undefined;
    const { reason, addedOn } = value;
    return {
      reason: reason == null ? "" : String(reason),
      addedOn:
        typeof addedOn === "string" && !Number.isNaN(Date.parse(addedOn))
          ? addedOn
          : now.toISOString(),
    };
  }
  if (store === "exception" && value !== true) return undefined;
  if (store === "rule") {
    // the rule's own id must be the key's, or it would be stored under another one
    const rule = normalizeRule(value, now);
    if (!rule || rule.id !== id) return undefined;
  }
  return toEntries(fromEntries({ [key]: value }))[key];
}

const FACTORIES = {
  followed: createFollowedStore,
  rules: createRulesStore,
  notes: createNotesStore,
  ratings: createRatingsStore,
  disliked: createDislikedStore,
  attended: createAttendedStore,
};

/** Writes `changes` (`{key, value | deleted, raw?}`) with one call per store. */
function writeStores(ctx, changes) {
  const followed = { put: [], remove: [] };
  const rules = { put: [], remove: [], except: [], unexcept: [] };
  const notes = { put: {}, remove: [] };
  const ratings = { put: {}, remove: [] };
  const keyed = { disliked: [], attended: [] };
  for (const c of changes) {
    const [store, id] = splitKey(c.key);
    const del = c.deleted === true;
    if (store === "followed")
      del ? followed.remove.push(id) : followed.put.push({ id, ...c.value });
    else if (store === "rule")
      del ? rules.remove.push(id) : rules.put.push(c.raw ?? { ...c.value, id });
    else if (store === "exception")
      (del ? rules.unexcept : rules.except).push(id);
    else if (store === "note")
      del ? notes.remove.push(id) : (notes.put[id] = c.value);
    else if (store === "rating")
      del ? ratings.remove.push(id) : (ratings.put[id] = c.value);
    else if (store in keyed) keyed[store].push([id, del ? undefined : c.value]);
  }
  const get = (name) =>
    ctx.stores?.[name] ??
    FACTORIES[name](ctx.conferenceId, storageOf(ctx), null);
  const any = (g) => Object.values(g).some((x) => Object.keys(x).length);
  if (any(followed)) get("followed").applyEntries(followed);
  if (any(rules)) get("rules").applyEntries(rules, nowOf(ctx));
  if (any(notes)) get("notes").applyEntries(notes);
  if (any(ratings)) get("ratings").applyEntries(ratings);
  for (const name of ["disliked", "attended"])
    if (keyed[name].length) get(name).putMany(keyed[name]);
}

/** Saved snapshots, newest first: `[{at, label, payload}]` (payload: a v3 My Papers file). */
export function listSnapshots(ctx) {
  try {
    const list = JSON.parse(
      storageOf(ctx).getItem(snapshotsKey(ctx.conferenceId)),
    );
    return Array.isArray(list)
      ? list.filter(
          (s) =>
            isPlainObject(s) &&
            typeof s.at === "string" &&
            typeof s.label === "string" &&
            typeof s.payload === "string",
        )
      : [];
  } catch {
    return [];
  }
}

/**
 * Saves `state` as the newest snapshot; throws (nothing changed) when it can't. Returns a
 * function that takes it back (when what follows fails, so it doesn't rotate a useful one out).
 */
function saveSnapshot(ctx, state, label) {
  const payload = exportMyPapers(state, {
    device: ctx.meta.device,
    sync: ctx.meta.read(),
  });
  const list = [
    { at: nowOf(ctx).toISOString(), label, payload },
    ...listSnapshots(ctx),
  ].slice(0, MAX_SNAPSHOTS);
  const key = snapshotsKey(ctx.conferenceId);
  const storage = storageOf(ctx);
  const previous = storage.getItem(key);
  const takeBack = () => {
    try {
      if (previous == null) storage.removeItem?.(key);
      else storage.setItem(key, previous);
    } catch {
      // the extra snapshot stays: harmless
    }
  };
  const attempts = list.length > 1 ? [list, list.slice(0, -1)] : [list];
  for (const kept of attempts) {
    try {
      storage.setItem(key, JSON.stringify(kept));
      return takeBack;
    } catch {
      // storage full: retry once without the oldest snapshot
    }
  }
  throw storageError(
    "Couldn't save a copy of your data first (this browser's storage is full), so nothing was changed.",
  );
}

function loadUndo(ctx) {
  try {
    const rec = JSON.parse(storageOf(ctx).getItem(undoKey(ctx.conferenceId)));
    return isPlainObject(rec) && Array.isArray(rec.changes) ? rec : null;
  } catch {
    return null;
  }
}

function removeUndo(ctx, rec) {
  if (loadUndo(ctx)?.id !== rec.id) return;
  try {
    storageOf(ctx).removeItem?.(undoKey(ctx.conferenceId));
  } catch {
    // an undo record left behind only reverts entries still as that import left them
  }
}

/**
 * Applies `changes` (`{key, value | deleted, meta: record | null, raw?}`, values canonical) in
 * the safe order. Returns `{applied, failed, undo}`; throws, having changed nothing, when the
 * snapshot or the meta can't be saved.
 */
function commit(ctx, changes, { label, from, continueImport }) {
  const state = readState(ctx.conferenceId, storageOf(ctx));
  const before = toEntries(state);
  const rawRules = new Map(state.rules.map((r) => [r.id, r]));
  // Answers given later to an import's clashes join that import: its snapshot already holds
  // the data from before it, and its undo record grows (see saveUndo)
  const base = continueImport ? openRecord(ctx, continueImport) : null;

  // 1. Snapshot
  const takeBackSnapshot = base ? () => {} : saveSnapshot(ctx, state, label);

  // 2. Meta, for every key, before any store changes
  const metaEntries = ctx.meta.read();
  const record = changes.map((c) => {
    const [store, id] = splitKey(c.key);
    return {
      key: c.key,
      had: own(before, c.key),
      ...(own(before, c.key) && { before: before[c.key] }),
      ...(store === "rule" &&
        rawRules.has(id) && { beforeRaw: rawRules.get(id) }),
      beforeMeta: metaEntries[c.key] ?? null,
      afterHash: c.deleted ? "" : stableHash(c.value),
      afterMeta: c.meta,
    };
  });
  for (const c of changes)
    if (c.meta) metaEntries[c.key] = c.meta;
    else delete metaEntries[c.key];
  if (!ctx.meta.write(metaEntries)) {
    takeBackSnapshot();
    throw storageError(
      "Couldn't save the import's change history (this browser's storage is full), so nothing was changed.",
    );
  }

  // 3. Stores
  writeStores(ctx, changes);

  // A store that couldn't save (it reported it) keeps its old value: put its meta back. If
  // even that fails, the caller warns (a reload's reconcile then versions what is there).
  const after = currentEntries(ctx);
  const failed = record.filter((r) => hashIn(after, r.key) !== r.afterHash);
  let rollbackFailed = false;
  if (failed.length) {
    const m = ctx.meta.read();
    for (const r of failed)
      if (r.beforeMeta) m[r.key] = r.beforeMeta;
      else delete m[r.key];
    if (!ctx.meta.write(m)) {
      rollbackFailed = true;
      reportStorageFailure();
    }
  }
  const done = record.filter((r) => !failed.includes(r));

  // 4. Undo record
  const { undo, undoId } = saveUndo(ctx, done, { label, from, base });
  return {
    applied: done.map((r) => r.key),
    failed: failed.map((r) => r.key),
    rollbackFailed,
    undo,
    undoId,
  };
}

/** The stored undo record `id` while it can still be undone, else null. */
function openRecord(ctx, id) {
  const rec = loadUndo(ctx);
  if (rec?.id !== id) return null;
  const at = Date.parse(rec.at);
  return Number.isFinite(at) && nowOf(ctx).getTime() - at <= UNDO_DAYS * DAY
    ? rec
    : null;
}

/**
 * Saves the undo record of `changes` (it stays usable on this page if it can't be saved);
 * returns `{undo, undoId}`. With `base` (an import's record) the changes join it: a key it
 * already has keeps its value from before the import, with the new value as the one to undo.
 */
function saveUndo(ctx, changes, { label, from, base }) {
  const at = nowOf(ctx).toISOString();
  let undo;
  if (base) {
    const merged = new Map(base.changes.map((c) => [c.key, c]));
    for (const c of changes) {
      const old = merged.get(c.key);
      merged.set(
        c.key,
        old ? { ...old, afterHash: c.afterHash, afterMeta: c.afterMeta } : c,
      );
    }
    undo = { ...base, changes: [...merged.values()] };
  } else
    undo = {
      id: `${at}~${Math.random().toString(36).slice(2, 10)}`,
      at,
      label,
      from,
      changes,
    };
  try {
    storageOf(ctx).setItem(undoKey(ctx.conferenceId), JSON.stringify(undo));
  } catch {
    reportStorageFailure();
  }
  return { undo: () => undoRecord(ctx, undo), undoId: undo.id };
}

/**
 * Applies a transfer: `resolutions` is `[{key, value?, deleted?, v, t}]` (the merge's `apply`
 * plus the clash resolutions). `continueImport` (an earlier result's `undoId`) adds answers
 * given later to that import: no new snapshot, and one undo takes back the whole import (when
 * its record is gone, this is a new import). Returns `{applied, failed, skipped, undo, undoId}`:
 * `skipped` are values
 * no store can hold (left alone), `failed` keys a store couldn't save (left as they were). Throws
 * with `code: "storage"`, having changed nothing, when the snapshot or the meta can't be saved.
 */
export const applyTransfer = busy(applyTransferNow);
function applyTransferNow(
  ctx,
  resolutions,
  { from, label, continueImport } = {},
) {
  const now = nowOf(ctx);
  const byKey = new Map();
  const skipped = [];
  for (const r of resolutions ?? []) {
    if (!isPlainObject(r) || typeof r.key !== "string" || !isSyncKey(r.key))
      continue;
    const t = typeof r.t === "string" ? r.t : now.toISOString();
    const v = isPlainObject(r.v) ? r.v : {};
    if (r.deleted === true) {
      byKey.set(r.key, {
        key: r.key,
        deleted: true,
        meta: { v, t, h: "", deleted: true },
      });
      continue;
    }
    const value = canonical(r.key, r.value, now);
    if (value === undefined) {
      skipped.push(r.key);
      continue;
    }
    byKey.set(r.key, {
      key: r.key,
      value,
      meta: { v, t, h: stableHash(value) },
    });
  }
  if (!byKey.size)
    return {
      applied: [],
      failed: [],
      skipped,
      rollbackFailed: false,
      undo: () => NONE,
      undoId: (continueImport && openRecord(ctx, continueImport)?.id) || null,
    };
  return {
    ...commit(ctx, [...byKey.values()], { label, from, continueImport }),
    skipped,
  };
}

function undoRecord(ctx, rec) {
  const now = nowOf(ctx);
  const at = Date.parse(rec?.at);
  if (!rec || !Array.isArray(rec.changes) || !Number.isFinite(at)) return NONE;
  if (now.getTime() - at > UNDO_DAYS * DAY) {
    removeUndo(ctx, rec);
    return NONE;
  }
  const current = currentEntries(ctx);
  const metaEntries = ctx.meta.read();
  const reverted = [];
  const skipped = [];
  const changes = [];
  for (const c of rec.changes) {
    if (!isPlainObject(c) || typeof c.key !== "string" || !isSyncKey(c.key))
      continue;
    // Changed since (by hand, another tab or another import): leave it
    if (
      hashIn(current, c.key) !== c.afterHash ||
      !sameRecord(metaEntries[c.key], c.afterMeta)
    ) {
      skipped.push(c.key);
      continue;
    }
    reverted.push(c.key);
    if (c.beforeMeta) metaEntries[c.key] = c.beforeMeta;
    else delete metaEntries[c.key];
    changes.push(
      c.had
        ? { key: c.key, value: c.before, raw: c.beforeRaw }
        : { key: c.key, deleted: true },
    );
  }
  if (changes.length) {
    if (!ctx.meta.write(metaEntries))
      throw storageError(
        "Couldn't save the undo (this browser's storage is full), so nothing was changed.",
      );
    writeStores(ctx, changes);
  }
  removeUndo(ctx, rec);
  return { reverted, skipped };
}

/**
 * Undoes the last import (or snapshot restore) of the last 7 days, also after a reload: each
 * entry still as it left it goes back to its previous value and version; the others are
 * skipped. Returns `{reverted, skipped}` (keys).
 */
export const undoLastImport = busy((ctx) => undoRecord(ctx, loadUndo(ctx)));

/**
 * The last import's undo record while it can still be undone (7 days): `{at, from, count}`
 * (`from`: the device name the import came from, "snapshot" or "backup"), else null.
 */
export function lastImport(ctx) {
  const rec = loadUndo(ctx);
  const at = Date.parse(rec?.at);
  if (!rec || !Number.isFinite(at)) return null;
  if (nowOf(ctx).getTime() - at > UNDO_DAYS * DAY) return null;
  return {
    at: rec.at,
    from: typeof rec.from === "string" ? rec.from : "",
    count: rec.changes.length,
  };
}

/**
 * Replaces all the data with snapshot `i` (`listSnapshots` order), after snapshotting the
 * current data. The restored data is a new change on this device: every difference gets a
 * version bumped here (an entry the snapshot lacks gets a tombstone), so another device's older
 * or concurrent value never silently overrides it. Returns `{undo, failed}`: `undo()` gives
 * `{reverted, skipped}`, `failed` are keys a store couldn't save (left as they were, with their
 * versions). Throws, having changed nothing, when the snapshot is damaged or storage is full.
 */
export const restoreSnapshot = busy((ctx, i) => {
  const snap = listSnapshots(ctx)[i];
  if (!snap) throw new Error("This copy of your data is no longer saved.");
  return restoreParsed(ctx, parseMyPapersFile(snap.payload), {
    label: "Before restoring a saved copy",
    from: "snapshot",
  });
});

/**
 * Replaces all the data with a parsed My Papers file (a backup made on this device), with the
 * same safety as `restoreSnapshot`: the current data is snapshotted first (`label`), the restore
 * is a new change on this device; returns `{undo, failed}` as `restoreSnapshot` does.
 */
export const restorePayload = busy((ctx, parsed, { label } = {}) =>
  restoreParsed(ctx, parsed, {
    label: label ?? "Before restoring a backup",
    from: "backup",
  }),
);

function restoreParsed(ctx, parsed, { label, from }) {
  const now = nowOf(ctx);
  // Version any local edit not recorded yet, so the undo below covers only the restore's changes
  ctx.meta.reconcile(currentEntries(ctx), now);
  const state = readState(ctx.conferenceId, storageOf(ctx));
  const before = toEntries(state);
  const rawBefore = new Map(state.rules.map((r) => [r.id, r]));
  const metaBefore = ctx.meta.read();
  const target = toEntries(parsed);
  const rawTarget = new Map();
  for (const r of parsed.rules) {
    const n = normalizeRule(r);
    if (n) rawTarget.set(n.id, r);
  }
  const changes = [];
  for (const key of new Set([...Object.keys(target), ...Object.keys(before)])) {
    if (!isSyncKey(key)) continue;
    const [store, id] = splitKey(key);
    if (!own(target, key)) {
      changes.push({ key, deleted: true });
      continue;
    }
    const value = canonical(key, target[key], now);
    if (value === undefined || hashIn(before, key) === stableHash(value))
      continue;
    changes.push({
      key,
      value,
      ...(store === "rule" && rawTarget.has(id) && { raw: rawTarget.get(id) }),
    });
  }
  if (!changes.length) return { undo: () => NONE, failed: [] };

  saveSnapshot(ctx, state, label);
  writeStores(ctx, changes);
  // A store that couldn't save (it reported it) keeps its value, and so its version
  const written = currentEntries(ctx);
  const failed = changes
    .filter(
      (c) => hashIn(written, c.key) !== (c.deleted ? "" : stableHash(c.value)),
    )
    .map((c) => c.key);
  const changed = ctx.meta.reconcile(currentEntries(ctx), now);
  const after = currentEntries(ctx);
  const metaAfter = ctx.meta.read();
  const record = changed.map((key) => {
    const [store, id] = splitKey(key);
    return {
      key,
      had: own(before, key),
      ...(own(before, key) && { before: before[key] }),
      ...(store === "rule" &&
        rawBefore.has(id) && { beforeRaw: rawBefore.get(id) }),
      beforeMeta: metaBefore[key] ?? null,
      afterHash: hashIn(after, key),
      afterMeta: metaAfter[key] ?? null,
    };
  });
  return { undo: saveUndo(ctx, record, { label, from }).undo, failed };
}
