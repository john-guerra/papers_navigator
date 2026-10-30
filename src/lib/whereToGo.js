import { dayKey } from "./time.js";

const when = (p) => p.sessionStart ?? p.start;

/**
 * "Where to go?" for search results (ported from the CHI 2026 notebook):
 * papers scoring above `minScore`, grouped per conference day into rooms
 * (most matching papers first) and sessions (by start time).
 */
export function whereToGo(papers, { minScore, tz }) {
  const matching = papers.filter((p) => p.score != null && p.score > minScore);
  const unscheduled = matching.filter((p) => !when(p));
  const byDay = new Map();
  for (const p of matching.filter(when)) {
    const day = dayKey(when(p), tz);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(p);
  }

  const days = [...byDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, dayPapers]) => {
      const rooms = new Map();
      const sessions = new Map();
      for (const p of dayPapers) {
        const room = p.room ?? "Room TBA";
        if (!rooms.has(room)) rooms.set(room, { room, papers: [] });
        rooms.get(room).papers.push(p);
        const key = `${when(p)}|${p.sessionId ?? p.sessionName}`;
        if (!sessions.has(key))
          sessions.set(key, {
            start: when(p),
            room,
            sessionName: p.sessionName ?? "Session TBA",
            papers: [],
          });
        sessions.get(key).papers.push(p);
      }
      const byScore = (a, b) => b.score - a.score;
      return {
        day,
        count: dayPapers.length,
        rooms: [...rooms.values()]
          .map((r) => ({ ...r, papers: r.papers.sort(byScore) }))
          .sort(
            (a, b) =>
              b.papers.length - a.papers.length || a.room.localeCompare(b.room),
          ),
        sessions: [...sessions.values()]
          .map((s) => ({ ...s, papers: s.papers.sort(byScore) }))
          .sort(
            (a, b) =>
              a.start.localeCompare(b.start) ||
              b.papers.length - a.papers.length,
          ),
      };
    });
  return { days, unscheduled };
}
