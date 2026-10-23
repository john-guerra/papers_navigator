import { dayKey } from "./time.js";

const time = (iso) => (iso ? new Date(iso).getTime() : NaN);

function sessionGroups(items) {
  const groups = new Map();
  for (const item of items) {
    let group = groups.get(item.sessionId);
    if (!group) {
      group = {
        sessionId: item.sessionId,
        sessionName: item.sessionName,
        room: item.room,
        items: [],
      };
      groups.set(item.sessionId, group);
    }
    group.items.push(item);
  }
  for (const group of groups.values()) {
    const first = group.items[0];
    const starts = group.items
      .map((d) => time(d.start))
      .filter(Number.isFinite);
    const ends = group.items.map((d) => time(d.end)).filter(Number.isFinite);
    group.start = time(first.sessionStart) || Math.min(...starts);
    group.end = time(first.sessionEnd) || Math.max(...ends);
    // Timed talks in presentation order, untimed ones after
    group.items.sort((a, b) => {
      const ta = time(a.start);
      const tb = time(b.start);
      if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
      return Number.isFinite(ta) ? -1 : Number.isFinite(tb) ? 1 : 0;
    });
    group.firstTalk = Math.min(
      ...group.items.map((d) => time(d.start)).filter(Number.isFinite),
      Infinity,
    );
  }
  return [...groups.values()];
}

function pickRecommended(sessions) {
  return [...sessions].sort(
    (a, b) =>
      b.items.length - a.items.length ||
      a.firstTalk - b.firstTalk ||
      a.start - b.start,
  );
}

/**
 * Groups followed items into days (conference timezone) and slots of overlapping sessions.
 * Items without a session or any time are returned as `unscheduled`.
 */
export function groupIntoSlots(items, tz) {
  const unscheduled = [];
  const scheduled = [];
  for (const item of items) {
    const hasTime = item.sessionStart || item.start;
    if (item.sessionId && hasTime) scheduled.push(item);
    else unscheduled.push(item);
  }

  const byDay = new Map();
  for (const group of sessionGroups(scheduled)) {
    const key = dayKey(group.start, tz);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(group);
  }

  const days = [...byDay.keys()].sort().map((date) => {
    const groups = byDay.get(date).sort((a, b) => a.start - b.start);
    const slots = [];
    for (const group of groups) {
      const slot = slots.at(-1);
      if (slot && group.start < slot.end) {
        slot.sessions.push(group);
        slot.end = Math.max(slot.end, group.end);
      } else {
        slots.push({ start: group.start, end: group.end, sessions: [group] });
      }
    }
    for (const slot of slots) {
      const [recommended, ...alternatives] = pickRecommended(slot.sessions);
      Object.assign(slot, { recommended, alternatives });
    }
    return { date, slots };
  });

  return { days, unscheduled };
}

/**
 * Current slot (if any), the next followed talk in its recommended session, and the
 * remaining slots of today. Null when `now` is not on a conference day with slots.
 */
export function nowNext(days, now, tz) {
  const today = days.find((d) => d.date === dayKey(now, tz));
  if (!today) return null;
  const t = now.getTime();
  const current = today.slots.find((s) => s.start <= t && t < s.end) ?? null;
  const nowItem =
    current?.recommended.items.find((d) => time(d.end) > t) ?? null;
  const next = today.slots.filter((s) => s.start > t);
  return { now: current, nowItem, next };
}
