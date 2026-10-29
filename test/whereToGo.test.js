// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { whereToGo } from "../src/lib/whereToGo.js";
import { renderWhereToGo } from "../src/components/whereToGo.js";

const TZ = "US/Eastern";
// Nov 2026 is EST (UTC-5)
const at = (day, hh, mm = 0) =>
  new Date(Date.UTC(2026, 10, day, hh + 5, mm)).toISOString();
const paper = (id, score, day, hh, room, sessionName, sessionId = sessionName) => ({
  id,
  title: `Paper ${id}`,
  url: `https://example.org/${id}`,
  score,
  room,
  sessionId,
  sessionName,
  sessionStart: at(day, hh),
  start: at(day, hh, 10),
});

const papers = [
  paper("a", 0.6, 11, 10, "Room A", "Agents"),
  paper("b", 0.5, 11, 10, "Room A", "Agents"),
  paper("c", 0.4, 11, 14, "Room B", "Maps"),
  paper("d", 0.35, 10, 9, "Room B", "Text"),
  paper("e", 0.2, 10, 9, "Room C", "Low"),
  { id: "f", title: "Unscheduled", score: 0.9 },
  // 23:30 EST on Nov 12 is Nov 13 in UTC; must stay on Nov 12
  paper("g", 0.45, 12, 23, "Room A", "Late"),
];

describe("whereToGo", () => {
  it("keeps papers above the min score, grouped by conference day in date order", () => {
    const { days } = whereToGo(papers, { minScore: 0.3, tz: TZ });
    expect(days.map((d) => d.day)).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(days.flatMap((d) => d.rooms.flatMap((r) => r.papers.map((p) => p.id))).sort()).toEqual(
      ["a", "b", "c", "d", "g"],
    );
  });

  it("sorts rooms within a day by number of matching papers", () => {
    const day = whereToGo(papers, { minScore: 0.3, tz: TZ }).days[1];
    expect(day.rooms.map((r) => [r.room, r.papers.length])).toEqual([
      ["Room A", 2],
      ["Room B", 1],
    ]);
  });

  it("sorts sessions within a day by start time", () => {
    const day = whereToGo(papers, { minScore: 0.3, tz: TZ }).days[1];
    expect(day.sessions.map((s) => s.sessionName)).toEqual(["Agents", "Maps"]);
    expect(day.sessions[0]).toMatchObject({ room: "Room A", start: at(11, 10) });
  });

  it("counts papers it could not place in time", () => {
    expect(whereToGo(papers, { minScore: 0.3, tz: TZ }).unscheduled.map((p) => p.id)).toEqual(["f"]);
  });

  it("returns nothing without scores", () => {
    const { days } = whereToGo(papers.map((p) => ({ ...p, score: null })), { minScore: 0.3, tz: TZ });
    expect(days).toEqual([]);
  });
});

describe("renderWhereToGo", () => {
  it("renders collapsible rooms and sessions per day", () => {
    const el = renderWhereToGo(whereToGo(papers, { minScore: 0.3, tz: TZ }), { tz: TZ });
    const text = el.textContent.replace(/\s+/g, " ");
    expect(text).toContain("Rooms to go");
    expect(text).toContain("Sessions you should attend");
    expect(text).toContain("Wed Nov 11 (3)");
    expect(text).toContain("Room A (2)");
    expect(text).toContain("10:00 Room A - Agents (2)");
    expect(el.querySelector("a[href='https://example.org/a']").textContent).toContain("Paper a");
  });
});
