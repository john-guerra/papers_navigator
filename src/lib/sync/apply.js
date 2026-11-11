import { createAttendedStore } from "../attended.js";
import { createDislikedStore } from "../disliked.js";
import { createFollowedStore } from "../followed.js";
import { exportMyPapers, parseMyPapersFile } from "../myPapersFile.js";
import { createNotesStore } from "../notes.js";
import { createRatingsStore } from "../ratings.js";
import { createRulesStore, normalizeRule } from "../rules.js";
import { reportStorageFailure } from "../storageHealth.js";
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

/** Saves `state` as the newest snapshot; throws (nothing changed) when it can't. */
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
  const attempts = list.length > 1 ? [list, list.slice(0, -1)] : [list];
  for (const kept of attempts) {
    try {
      storageOf(ctx).setItem(key, JSON.stringify(kept));
      return;
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
function commit(ctx, changes, { label, from }) {
  const now = nowOf(ctx);
  const state = readState(ctx.conferenceId, storageOf(ctx));
  const before = toEntries(state);
  const rawRules = new Map(state.rules.map((r) => [r.id, r]));

  // 1. Snapshot
  saveSnapshot(ctx, state, label);

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
  if (!ctx.meta.write(metaEntries))
    throw storageError(
      "Couldn't save the import's change history (this browser's storage is full), so nothing was changed.",
    );

  // 3. Stores
  writeStores(ctx, changes);

  // A store that couldn't save (it reported it) keeps its old value: put its meta back
  const after = currentEntries(ctx);
  const failed = record.filter((r) => hashIn(after, r.key) !== r.afterHash);
  if (failed.length) {
    const m = ctx.meta.read();
    for (const r of failed)
      if (r.beforeMeta) m[r.key] = r.beforeMeta;
      else delete m[r.key];
    ctx.meta.write(m);
  }
  const done = record.filter((r) => !failed.includes(r));

  // 4. Undo record
  const undo = {
    id: `${now.toISOString()}~${Math.random().toString(36).slice(2, 10)}`,
    at: now.toISOString(),
    label,
    from,
    changes: done,
  };
  try {
    storageOf(ctx).setItem(undoKey(ctx.conferenceId), JSON.stringify(undo));
  } catch {
    // the returned undo() still works on this page
    reportStorageFailure();
  }
  return {
    applied: done.map((r) => r.key),
    failed: failed.map((r) => r.key),
    undo: () => undoRecord(ctx, undo),
  };
}

/**
 * Applies a transfer: `resolutions` is `[{key, value?, deleted?, v, t}]` (the merge's `apply`
 * plus the clash resolutions). Returns `{applied, failed, skipped, undo}`: `skipped` are values
 * no store can hold (left alone), `failed` keys a store couldn't save (left as they were). Throws
 * with `code: "storage"`, having changed nothing, when the snapshot or the meta can't be saved.
 */
export function applyTransfer(ctx, resolutions, { from, label } = {}) {
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
    return { applied: [], failed: [], skipped, undo: () => NONE };
  return { ...commit(ctx, [...byKey.values()], { label, from }), skipped };
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
export function undoLastImport(ctx) {
  return undoRecord(ctx, loadUndo(ctx));
}

/**
 * Replaces all the data with snapshot `i` (`listSnapshots` order) and its versions, after
 * snapshotting the current data. Returns an undo (`() => {reverted, skipped}`). Throws, having
 * changed nothing, when the snapshot is damaged or storage is full.
 */
export function restoreSnapshot(ctx, i) {
  const snap = listSnapshots(ctx)[i];
  if (!snap) throw new Error("This copy of your data is no longer saved.");
  const now = nowOf(ctx);
  const parsed = parseMyPapersFile(snap.payload);
  const sync = parsed.sync ?? {};
  const target = toEntries(parsed);
  const rawRules = new Map();
  for (const r of parsed.rules) {
    const n = normalizeRule(r);
    if (n) rawRules.set(n.id, r);
  }
  const current = currentEntries(ctx);
  const metaEntries = ctx.meta.read();
  const keys = new Set([
    ...Object.keys(target),
    ...Object.keys(current),
    ...Object.keys(sync),
    ...Object.keys(metaEntries),
  ]);
  const changes = [];
  for (const key of keys) {
    if (!isSyncKey(key)) continue;
    const s = sync[key];
    let change;
    if (own(target, key)) {
      const value = canonical(key, target[key], now);
      if (value === undefined) continue;
      const meta =
        s && !s.deleted ? { v: s.v, t: s.t, h: stableHash(value) } : null;
      change = { key, value, meta, raw: rawRules.get(splitKey(key)[1]) };
      if (splitKey(key)[0] !== "rule") delete change.raw;
    } else {
      const meta = s?.deleted ? { v: s.v, t: s.t, h: "", deleted: true } : null;
      change = { key, deleted: true, meta };
    }
    const unchanged =
      hashIn(current, key) ===
        (change.deleted ? "" : stableHash(change.value)) &&
      sameRecord(metaEntries[key], change.meta);
    if (!unchanged) changes.push(change);
  }
  if (!changes.length) return () => NONE;
  return commit(ctx, changes, {
    label: `Before restoring the copy from ${snap.at}`,
    from: "snapshot",
  }).undo;
}
