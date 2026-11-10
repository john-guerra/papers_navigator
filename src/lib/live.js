import { groupIntoSlots } from "./schedule.js";
import { dayKey } from "./time.js";
import { AWARD_TIERS } from "./paperMeta.js";

/**
 * The Live page's program (#203): every paper session (not only My Papers) grouped into days
 * and slots of parallel sessions, with schedule.js's grouping. Slot and session times are ms.
 */
export function programDays(papers, tz) {
  return groupIntoSlots(papers, tz).days;
}

const ms = (iso) => (iso ? new Date(iso).getTime() : NaN);

/**
 * Where `at` falls: `now` (the slot running), `next` (the first slot today starting after
 * `at`), `later` (today's slots after `next`) and, when nothing is left today, `nextDay` (the
 * first slot of a later day).
 */
export function slotsAt(days, at, tz) {
  const t = at.getTime();
  const key = dayKey(at, tz);
  const today = days.find((d) => d.date === key)?.slots ?? [];
  const now = today.find((s) => s.start <= t && t < s.end) ?? null;
  const upcoming = today.filter((s) => s.start > t);
  const next = upcoming[0] ?? null;
  const later = upcoming.slice(1);
  const after = next
    ? null
    : (days.find((d) => d.date > key && d.slots.length) ?? null);
  return {
    now,
    next,
    later,
    nextDay: after ? { date: after.date, slot: after.slots[0] } : null,
  };
}

/**
 * The slot's sessions with `mine` (how many of their papers are in My Papers, `mineIds`), the
 * most first, then by room; the first is `recommended` when it has any of yours.
 */
export function rankSessions(slot, mineIds) {
  const ranked = slot.sessions
    .map((s) => ({
      ...s,
      mine: s.items.filter((p) => mineIds.has(p.id)).length,
      recommended: false,
    }))
    .sort(
      (a, b) =>
        b.mine - a.mine || String(a.room ?? "").localeCompare(b.room ?? ""),
    );
  if (ranked[0]?.mine > 0) ranked[0].recommended = true;
  return ranked;
}

/** Counts of `values`, most common first (ties alphabetical): [[value, n]]. */
function counts(values) {
  const map = new Map();
  for (const v of values) if (v) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map].sort(
    (a, b) => b[1] - a[1] || String(a[0]).localeCompare(b[0]),
  );
}

/** "7 papers · 2 Full · 1 Short · 🏆 1 · Perception; Uncertainty" (topic labels contain commas) (empty parts left out). */
export function sessionSummary(session) {
  const items = session.items ?? [];
  const n = items.length;
  const parts = [`${n} ${n === 1 ? "paper" : "papers"}`];
  for (const [type, k] of counts(items.map((p) => p.typeShort)))
    parts.push(`${k} ${type}`);
  for (const [tier, { icon }] of Object.entries(AWARD_TIERS)) {
    const k = items.filter((p) => p.awardTier === tier).length;
    if (k) parts.push(`${icon} ${k}`);
  }
  const topics = counts(items.map((p) => p.clusterLabel))
    .slice(0, 2)
    .map(([t]) => t);
  if (topics.length) parts.push(topics.join("; "));
  return parts.join(" · ");
}

/** The talk running at `at` in `session` (by its own start/end), or null. */
export function talkAt(session, at) {
  const t = at.getTime();
  return session.items.find((p) => ms(p.start) <= t && t < ms(p.end)) ?? null;
}

/**
 * The session you're in ("Going here"), on this device only
 * (`papersNavigator:<id>:liveCheckIn`, `{sessionId, at}`). Reactive: `.value` is that or null;
 * `commit(sessionId, at)` replaces it, `leave()` clears it.
 */
export function createCheckInStore(
  conferenceId,
  storage = globalThis.localStorage,
  events = globalThis,
) {
  const key = `papersNavigator:${conferenceId}:liveCheckIn`;
  const store = new EventTarget();
  const load = () => {
    try {
      const v = JSON.parse(storage?.getItem(key) ?? "null");
      return v && typeof v.sessionId === "string" && typeof v.at === "string"
        ? { sessionId: v.sessionId, at: v.at }
        : null;
    } catch {
      return null;
    }
  };
  let value = load();
  const save = (next) => {
    value = next;
    try {
      if (next) storage?.setItem(key, JSON.stringify(next));
      else storage?.removeItem(key);
    } catch {
      // kept for this visit
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
  store.commit = (sessionId, at) => save({ sessionId, at: at.toISOString() });
  store.leave = () => save(null);
  store.dispose = () => events?.removeEventListener?.("storage", onStorage);
  return store;
}

/** The checked-in session while it runs today (by `at`), else null (ended, unknown, none). */
export function activeSession(checkIn, days, at, tz) {
  if (!checkIn) return null;
  const today = days.find((d) => d.date === dayKey(at, tz))?.slots ?? [];
  const t = at.getTime();
  for (const slot of today)
    for (const session of slot.sessions)
      if (session.sessionId === checkIn.sessionId && t < session.end)
        return session;
  return null;
}

/** The slot (today) that contains `session`. */
export function slotOf(session, days) {
  for (const day of days)
    for (const slot of day.slots)
      if (slot.sessions.some((s) => s.sessionId === session.sessionId))
        return slot;
  return null;
}
