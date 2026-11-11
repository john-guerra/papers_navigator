import { isPlainObject } from "./validate.js";

/**
 * How long the copies a transfer keeps of earlier data live (they hold notes and abstracts the
 * person may since have deleted): the undo record 7 days, saved snapshots 14 (two-way
 * transfer; written by apply.js). Small on purpose: every page that tracks imports it.
 */

export const DAY = 24 * 3600_000;
export const UNDO_DAYS = 7;
export const SNAPSHOT_DAYS = 14;

export const snapshotsKey = (id) => `papersNavigator:${id}:syncSnapshots`;
export const undoKey = (id) => `papersNavigator:${id}:syncUndo`;
export const storageOf = (ctx) => ctx.storage ?? globalThis.localStorage;
export const nowOf = (ctx) => ctx.now ?? new Date();

/** Whether `iso` is a time at most `days` before now. */
export const within = (ctx, iso, days) => {
  const at = Date.parse(iso);
  return Number.isFinite(at) && nowOf(ctx).getTime() - at <= days * DAY;
};

function readSnapshots(ctx) {
  try {
    const list = JSON.parse(
      storageOf(ctx).getItem(snapshotsKey(ctx.conferenceId)),
    );
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

/**
 * Saved snapshots of the last 14 days, newest first: `[{at, label, payload}]` (payload: a v3
 * My Papers file).
 */
export function listSnapshots(ctx) {
  return (readSnapshots(ctx) ?? []).filter(
    (s) =>
      isPlainObject(s) &&
      typeof s.at === "string" &&
      typeof s.label === "string" &&
      typeof s.payload === "string" &&
      within(ctx, s.at, SNAPSHOT_DAYS),
  );
}

export function loadUndo(ctx) {
  try {
    const rec = JSON.parse(storageOf(ctx).getItem(undoKey(ctx.conferenceId)));
    return isPlainObject(rec) && Array.isArray(rec.changes) ? rec : null;
  } catch {
    return null;
  }
}

const removeKey = (ctx, key) => {
  try {
    storageOf(ctx).removeItem?.(key);
    return true;
  } catch {
    return false;
  }
};

/**
 * Removes what has outlived its time, so deleted notes and abstracts don't linger in it: the
 * undo record after 7 days, saved snapshots after 14 (and anything unreadable in either).
 * Runs on every page load (startSyncTracking) and when My Papers shows them.
 */
export function expireTransferCopies(ctx) {
  const storage = storageOf(ctx);
  const key = snapshotsKey(ctx.conferenceId);
  try {
    if (storage.getItem(key) != null) {
      const all = readSnapshots(ctx);
      const kept = listSnapshots(ctx);
      if (!kept.length) removeKey(ctx, key);
      else if (!all || kept.length !== all.length)
        storage.setItem(key, JSON.stringify(kept));
    }
  } catch {
    // storage unavailable or full: tried again on the next load
  }
  try {
    if (storage.getItem(undoKey(ctx.conferenceId)) != null) {
      const rec = loadUndo(ctx);
      if (!rec || !within(ctx, rec.at, UNDO_DAYS))
        removeKey(ctx, undoKey(ctx.conferenceId));
    }
  } catch {
    // as above
  }
}

/**
 * "Delete saved copies": removes every saved snapshot and the undo record (both hold earlier
 * notes and abstracts). The data itself is untouched. False when storage refused.
 */
export function deleteSavedCopies(ctx) {
  const a = removeKey(ctx, snapshotsKey(ctx.conferenceId));
  const b = removeKey(ctx, undoKey(ctx.conferenceId));
  return a && b;
}
