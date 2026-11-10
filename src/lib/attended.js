import { createKeyedStore } from "./keyedStore.js";

/**
 * Papers you attended (#208), on this device only (`papersNavigator:<id>:attended`) and in
 * Export / Import: `{paperId: {at, how: "auto" | "manual"}}`, or `{off: true}` for a paper you
 * unticked (the automatic rule never marks it again).
 */
const valid = (e) =>
  e &&
  typeof e === "object" &&
  (e.off === true ||
    (typeof e.at === "string" && (e.how === "auto" || e.how === "manual")));

export function cleanAttended(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([id, e]) => id && valid(e))
      .map(([id, e]) => [id, e.off ? { off: true } : { at: e.at, how: e.how }]),
  );
}

/**
 * `.isAttended(id)`, `.set(id, on, now)` (by hand), `.markAuto(ids, now)` (skips papers that
 * already have an entry, attended or unticked), `.value`, `.merge(incoming)`, `.dispose()`.
 */
export function createAttendedStore(
  conferenceId,
  storage = globalThis.localStorage,
  events = globalThis,
) {
  const store = createKeyedStore(
    `papersNavigator:${conferenceId}:attended`,
    cleanAttended,
    storage,
    events,
  );
  store.isAttended = (id) => Boolean(store.get(id) && !store.get(id).off);
  store.set = (id, on, now = new Date()) =>
    store.put(
      id,
      on ? { at: now.toISOString(), how: "manual" } : { off: true },
    );
  store.markAuto = (ids, now = new Date()) =>
    store.putMany(
      ids.map((id) => [id, { at: now.toISOString(), how: "auto" }]),
      (_, current) => current !== undefined,
    );
  return store;
}

const ms = (iso) => (iso ? new Date(iso).getTime() : NaN);
const MIN_OVERLAP = 5;

/**
 * The checked-in session's talks you were there for (#208): their overlap with the time from
 * `checkIn.at` to `now` is at least 5 minutes. Untimed papers never count. Call it with the real
 * clock only (the page skips it while the time is set by hand).
 */
export function autoAttended(
  session,
  checkIn,
  now,
  { minMinutes = MIN_OVERLAP } = {},
) {
  const from = ms(checkIn?.at);
  const to = now.getTime();
  if (!Number.isFinite(from)) return [];
  return session.items
    .filter((p) => {
      const start = ms(p.start);
      const end = ms(p.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
      const overlap = Math.min(end, to) - Math.max(start, from);
      return overlap >= minMinutes * 60_000;
    })
    .map((p) => p.id);
}

/** " · 3 attended added" for the import message ("" for none). */
export function importedAttendedText(added) {
  return added ? ` · ${added} attended added` : "";
}
