import { groupIntoSlots } from "./schedule.js";
import { dayKey } from "./time.js";
import { AWARD_TIERS } from "./paperMeta.js";

const ms = (iso) => (iso ? new Date(iso).getTime() : NaN);

/**
 * The Live page's program (#203): every paper session (not only My Papers) grouped into days
 * and slots of parallel sessions, with schedule.js's grouping. Slot and session times are ms.
 * `sessions` (pipeline/fetch_sessions.py) adds the ones without papers: plenaries, panels,
 * tutorials, meetups, as sessions with no `items` and an `event` {type, typeLabel, url}. One
 * joins every paper slot it overlaps without stretching it (an all-day exhibition doesn't merge
 * the day into one slot); one with no paper session on gets its own slot (merged with the
 * events it overlaps). Sessions already in the papers (by id, or listing one of their papers)
 * are skipped.
 */
export function programDays(papers, tz, sessions = []) {
  const days = groupIntoSlots(papers, tz).days;
  const paperIds = new Set(papers.map((p) => p.id));
  const sessionIds = new Set(papers.map((p) => p.sessionId));
  const events = sessions
    .filter(
      (s) =>
        !sessionIds.has(s.sessionId) &&
        !(s.paperIds ?? []).some((id) => paperIds.has(id)) &&
        Number.isFinite(ms(s.start)) &&
        Number.isFinite(ms(s.end)),
    )
    .map((s) => ({
      sessionId: s.sessionId,
      sessionName: s.title,
      room: s.room ?? null,
      items: [],
      start: ms(s.start),
      end: ms(s.end),
      firstTalk: Infinity,
      event: { type: s.type, typeLabel: s.typeLabel, url: s.url },
    }))
    .sort((a, b) => a.start - b.start);
  const own = new Map();
  for (const e of events) {
    const overlapping = days
      .flatMap((d) => d.slots)
      .filter((slot) => slot.start < e.end && e.start < slot.end);
    for (const slot of overlapping) slot.sessions.push(e);
    if (overlapping.length) continue;
    const date = dayKey(new Date(e.start), tz);
    if (!own.has(date)) own.set(date, []);
    const slots = own.get(date);
    const last = slots.at(-1);
    if (last && e.start < last.end) {
      last.sessions.push(e);
      last.end = Math.max(last.end, e.end);
    } else slots.push({ start: e.start, end: e.end, sessions: [e] });
  }
  for (const [date, slots] of own) {
    let day = days.find((d) => d.date === date);
    if (!day) days.push((day = { date, slots: [] }));
    for (const slot of slots)
      day.slots.push({
        ...slot,
        recommended: slot.sessions[0],
        alternatives: slot.sessions.slice(1),
      });
    day.slots.sort((a, b) => a.start - b.start);
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

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

/** A plenary first (nothing else is on), then paper sessions, then panels, meetups, tutorials. */
const kindRank = (s) => (!s.event ? 1 : s.event.type === "plenary" ? 0 : 2);

/**
 * The slot's sessions with `mine` (how many of their papers are in My Papers, `mineIds`), the
 * most first, then a plenary, paper sessions, other events, each by start and room; the first
 * is `recommended` when it has any of yours.
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
        b.mine - a.mine ||
        kindRank(a) - kindRank(b) ||
        a.start - b.start ||
        String(a.room ?? "").localeCompare(b.room ?? ""),
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
  // A plenary, panel or meetup (no papers): its type, as the VIS program names it
  if (session.event) return session.event.typeLabel ?? "";
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

const SAFE_COLOR = /^[a-z][a-z0-9-]*$/;

/** The most common value; on a tie, the one seen first. */
function mostCommonInOrder(values) {
  const tally = new Map();
  for (const v of values) if (v) tally.set(v, (tally.get(v) ?? 0) + 1);
  let best = null;
  for (const [v, n] of tally)
    if (best === null || n > tally.get(best)) best = v;
  return best;
}

/**
 * A session's color, as the official program colors its cards: an event (plenary, tutorial,
 * panel…) by its session type through the config's `sessionTypeColors`; a paper session by its
 * most common paper `typeColor` (ties: the first talk's); else "other". A token name for
 * `data-type-color` (style.css maps it to `--color-type-<name>`).
 */
export function sessionTypeColor(session, sessionColors = {}) {
  const color = session.event
    ? sessionColors[session.event.type]
    : mostCommonInOrder((session.items ?? []).map((p) => p.typeColor));
  return SAFE_COLOR.test(color ?? "") ? color : "other";
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
        ? {
            sessionId: v.sessionId,
            at: v.at,
            ...(v.override === true && { override: true }),
          }
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
  // `override`: made while the time was set by hand (#208 review): never marks attendance
  store.commit = (sessionId, at, { override = false } = {}) =>
    save({
      sessionId,
      at: at.toISOString(),
      ...(override && { override: true }),
    });
  store.leave = () => save(null);
  store.dispose = () => events?.removeEventListener?.("storage", onStorage);
  return store;
}

/**
 * The checked-in session while it runs today (by `at`), else null (ended, unknown, none). An
 * event in several slots (an all-day exhibition) ends with the slot you checked in during, so
 * the break view comes back (review).
 */
export function activeSession(checkIn, days, at, tz) {
  if (!checkIn) return null;
  const today = days.find((d) => d.date === dayKey(at, tz))?.slots ?? [];
  const t = at.getTime();
  for (const slot of today)
    for (const session of slot.sessions) {
      if (session.sessionId !== checkIn.sessionId) continue;
      const end = session.event
        ? Math.min(
            session.end,
            slotOf(session, days, new Date(checkIn.at))?.end ?? Infinity,
          )
        : session.end;
      return t < end ? session : null;
    }
  return null;
}

/**
 * The checked-in session wherever it is in the program, even after it ended (#208 review: a phone
 * that slept through a session still marks its talks attended on waking). Null if unknown.
 */
export function checkedInSession(checkIn, days) {
  if (!checkIn) return null;
  for (const day of days)
    for (const slot of day.slots)
      for (const s of slot.sessions)
        if (s.sessionId === checkIn.sessionId) return s;
  return null;
}

/**
 * The slot that contains `session`; with `at`, the one running then (an all-day event is in
 * several slots), else the next one to start, else the first.
 */
export function slotOf(session, days, at) {
  const slots = days
    .flatMap((day) => day.slots)
    .filter((slot) =>
      slot.sessions.some((s) => s.sessionId === session.sessionId),
    );
  const t = at?.getTime();
  return (
    slots.find((slot) => slot.start <= t && t < slot.end) ??
    slots.find((slot) => slot.start > t) ??
    slots[0] ??
    null
  );
}

/** Chips for the award groups (#208), like the row's award mark. */
const AWARD_CHIPS = {
  best: "🏆 Best",
  honorable: "🏅 Honorable mention",
  other: "🎖️ Award",
};
/** A talk that started less than this ago still counts as "just started" (#208). */
const JUST_STARTED_MS = 2 * 60_000;
const RULE_REASON = /^(👥|🏫|🔍)/u;

/**
 * Why a paper matters to you (#208): "★ My Papers" (added by hand), the watch rules that keep it
 * ("👥 Ann", "🏫 MIT", "🔍 topic"), and its award ("🏆 Best"). [] when none.
 */
export function reasonChips(paper, entry) {
  return [
    ...(entry?.manual ? ["★ My Papers"] : []),
    ...(entry?.reasons ?? []).filter((r) => RULE_REASON.test(r)),
    ...(AWARD_CHIPS[paper.awardTier] ? [AWARD_CHIPS[paper.awardTier]] : []),
  ];
}

/**
 * "Worth moving for" (#208): in each session of `slot`, the next two talks after the one on now
 * (plus one that started under 2 minutes ago), kept when they have reason chips (in My Papers,
 * `mine`: id → entry, or awarded). Rows sorted: My Papers first, then award, then time (then
 * room); `here` marks the checked-in `session`, which the badge doesn't count. `onNow`: the other
 * sessions' talk on now (null for untimed sessions) with its chips.
 */
export function worthMoving(slot, session, at, mine) {
  const t = at.getTime();
  const rows = [];
  const onNow = [];
  for (const s of slot.sessions) {
    const timed = s.items.filter((p) => Number.isFinite(ms(p.start)));
    const now = timed.find((p) => ms(p.start) <= t && t < ms(p.end)) ?? null;
    const upcoming = timed.filter((p) => ms(p.start) > t).slice(0, 2);
    const justStarted = now && t - ms(now.start) < JUST_STARTED_MS ? [now] : [];
    for (const paper of [...justStarted, ...upcoming]) {
      const chips = reasonChips(paper, mine.get(paper.id));
      if (!chips.length) continue;
      rows.push({
        paper,
        session: s,
        minutes: Math.round((ms(paper.start) - t) / 60_000),
        state: paper === now ? "just started" : "soon",
        here: s.sessionId === session.sessionId,
        chips,
        mine: mine.has(paper.id),
      });
    }
    if (s.sessionId !== session.sessionId)
      onNow.push({
        session: s,
        talk: now,
        chips: now ? reasonChips(now, mine.get(now.id)) : [],
      });
  }
  const awarded = (r) => Number(Boolean(AWARD_CHIPS[r.paper.awardTier]));
  rows.sort(
    (a, b) =>
      Number(b.mine) - Number(a.mine) ||
      awarded(b) - awarded(a) ||
      ms(a.paper.start) - ms(b.paper.start) ||
      String(a.session.room ?? "").localeCompare(b.session.room ?? ""),
  );
  return {
    rows,
    onNow,
    badge: rows.filter((r) => !r.here).length,
  };
}
