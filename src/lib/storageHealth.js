import { dayKey } from "./time.js";

/**
 * Keeping your data safe (Stage E). Your list, notes, ratings, 👎 and attended papers live only in
 * this browser's localStorage. Their stores call `reportStorageFailure(key)` when a save fails
 * (storage full, or blocked as in private browsing); `storageHealth` then emits `failure` once per
 * page view and pages show a banner. View settings never report.
 */
export const storageHealth = Object.assign(new EventTarget(), {
  failed: false,
});

export function reportStorageFailure() {
  if (storageHealth.failed) return;
  storageHealth.failed = true;
  storageHealth.dispatchEvent(new Event("failure"));
}

let asked = false;
/** For tests: forget this page view's failure and persistence request. */
export function resetStorageHealth() {
  storageHealth.failed = false;
  asked = false;
}

/**
 * Asks the browser to keep this site's data (`navigator.storage.persist()`), once per page view,
 * quietly: it helps on Chromium/Android; Safari may ignore it.
 */
export async function requestPersistence(
  storage = globalThis.navigator?.storage,
) {
  if (asked || typeof storage?.persist !== "function") return;
  asked = true;
  try {
    await storage.persist();
  } catch {
    // nothing to do: the data note and the export are the backup
  }
}

const DAY = 24 * 3600_000;
const NUDGE_AFTER = 10;

/**
 * Whether to suggest a backup: 10+ ratings, notes, 👎 or attended papers more than at the last
 * export (`lastExport` {at, count}; none counts as 0), or from the conference's `lastDay` on (with
 * something to back up); never within 24 h of an export or a dismissal.
 */
export function backupNudge({
  total,
  lastExport,
  dismissedAt,
  now,
  lastDay,
  tz,
}) {
  if (!total) return false;
  const quiet = (iso) => iso && now.getTime() - Date.parse(iso) < DAY;
  if (quiet(lastExport?.at) || quiet(dismissedAt)) return false;
  const grown = total - (lastExport?.count ?? 0) >= NUDGE_AFTER;
  const ending = Boolean(lastDay) && dayKey(now, tz) >= lastDay;
  return grown || ending;
}

/** Safari on iPhone or iPad in a tab (not opened from the Home Screen). */
export function isIosSafariTab(nav = globalThis.navigator) {
  return /iPhone|iPad|iPod/.test(nav?.userAgent ?? "") && !nav?.standalone;
}

/**
 * How many things you'd lose without a backup: your list, ratings, notes, 👎 and attended papers
 * (not unticked ones). Takes the stores (`.value`), as My Papers and Live have them.
 */
export function dataTotal({ followed, ratings, notes, disliked, attended }) {
  const size = (store) => Object.keys(store?.value ?? {}).length;
  return (
    (followed?.value?.length ?? 0) +
    size(ratings) +
    size(notes) +
    size(disliked) +
    Object.values(attended?.value ?? {}).filter((e) => !e?.off).length
  );
}

const readJson = (storage, key) => {
  try {
    return JSON.parse(storage?.getItem(key) ?? "null");
  } catch {
    return null;
  }
};

/** backupNudge with the last export and dismissal read from this browser (both pages). */
export function backupDue({
  conferenceId,
  total,
  now = new Date(),
  lastDay,
  tz,
  storage = globalThis.localStorage,
}) {
  return backupNudge({
    total,
    lastExport: readJson(storage, `papersNavigator:${conferenceId}:lastExport`),
    dismissedAt: readJson(
      storage,
      `papersNavigator:${conferenceId}:backupDismissed`,
    ),
    now,
    lastDay,
    tz,
  });
}

/** "Not now" on the reminder: quiet for 24 h on every page. */
export function dismissBackup(
  conferenceId,
  now = new Date(),
  storage = globalThis.localStorage,
) {
  try {
    storage.setItem(
      `papersNavigator:${conferenceId}:backupDismissed`,
      JSON.stringify(now.toISOString()),
    );
  } catch {
    // shows again next time
  }
}
