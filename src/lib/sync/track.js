import { reportStorageFailure } from "../storageHealth.js";
import { expireTransferCopies } from "./expire.js";
import { isBusy } from "./busy.js";
import { toEntries } from "./entries.js";
import { createSyncMeta } from "./meta.js";
import { readState } from "./state.js";

/**
 * Keeps the version record (meta) in step with the stores: reconciles at once (the first load
 * after a deploy migrates existing data) and after every `input` of the given stores, deferred
 * and coalesced into one reconcile per tick (an import writes several stores in a row). Waits
 * while an import/undo/restore is applying. On start it also removes an expired undo record and
 * saved copies (expireTransferCopies), on every page that tracks. `stores` are the page's store objects (any subset;
 * values are read from `storage`, which every store writes synchronously). Returns `stop()`.
 */
export function startSyncTracking(
  conferenceId,
  stores = {},
  { storage = globalThis.localStorage, schedule = queueMicrotask } = {},
) {
  let stopped = false;
  let pending = false;
  let meta;

  function reconcileNow() {
    try {
      meta ??= createSyncMeta(conferenceId, storage);
      meta.reconcile(toEntries(readState(conferenceId, storage)), new Date());
    } catch (err) {
      console.warn("Couldn't record changes for transfer", err);
      if (err?.name === "QuotaExceededError" || err?.code === "storage")
        reportStorageFailure();
    }
  }

  function run() {
    if (stopped) {
      pending = false;
      return;
    }
    if (isBusy()) return schedule(run);
    pending = false;
    reconcileNow();
  }

  function request() {
    if (stopped || pending) return;
    pending = true;
    schedule(run);
  }

  const targets = Object.values(stores).filter((s) => s?.addEventListener);
  for (const s of targets) s.addEventListener("input", request);
  reconcileNow();
  try {
    expireTransferCopies({ conferenceId, storage });
  } catch (err) {
    console.warn("Couldn't remove expired copies of your data", err);
  }

  return () => {
    stopped = true;
    for (const s of targets) s.removeEventListener("input", request);
  };
}
