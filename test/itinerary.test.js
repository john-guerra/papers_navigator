// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { groupIntoSlots, nowNext } from "../src/lib/schedule.js";
import { renderItinerary } from "../src/components/itinerary.js";
import { renderNowNext } from "../src/components/nowNext.js";

const TZ = "US/Eastern";
const at = (day, hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 10, day, h + 5, m)).toISOString();
};
const item = (id, sessionId, room, day, from, to, talk) => ({
  id,
  title: `Paper ${id}`,
  sessionId,
  sessionName: `Session ${sessionId}`,
  room,
  sessionStart: at(day, from),
  sessionEnd: at(day, to),
  start: at(day, talk),
  end: at(day, talk.replace(/:(\d\d)$/, (_, m) => `:${String(+m + 9).padStart(2, "0")}`)),
  reason: "🔍 llm",
  authors: [],
});

const items = [
  item("a", "agents", "Essex Center", 10, "10:00", "11:30", "10:00"),
  item("b", "agents", "Essex Center", 10, "10:00", "11:30", "10:12"),
  item("c", "picture", "America Center", 10, "10:00", "11:30", "10:30"),
  item("d", "modern", "America Center", 10, "13:00", "14:30", "13:00"),
];
const schedule = groupIntoSlots(items, TZ);

describe("renderItinerary", () => {
  it("renders a collapsible row per slot with the recommended room", () => {
    const el = renderItinerary(schedule, { tz: TZ });
    const slots = el.querySelectorAll("details.slot");
    expect(slots).toHaveLength(2);
    expect(slots[0].querySelector("summary").textContent).toContain("📍 Essex Center");
    expect(slots[0].querySelector("summary").textContent).toContain("10:00");
    expect(slots[0].textContent).toContain("⚠ also");
    expect(slots[1].textContent).not.toContain("⚠ also");
  });

  it("shows a tab per day", () => {
    const el = renderItinerary(schedule, { tz: TZ });
    expect(el.querySelector(".day-tabs").textContent).toContain("Tue Nov 10");
  });

  it("calls onUnfollow with the paper id", () => {
    const removed = [];
    const el = renderItinerary(schedule, { tz: TZ, onUnfollow: (id) => removed.push(id) });
    el.querySelector("button.unfollow").click();
    expect(removed).toEqual(["a"]);
  });

  it("lists unscheduled items", () => {
    const el = renderItinerary(groupIntoSlots([{ id: "p", title: "Poster" }], TZ), { tz: TZ });
    expect(el.textContent).toContain("Poster");
    expect(el.textContent).toContain("No scheduled time");
  });
});

describe("renderNowNext", () => {
  it("shows the current room, the next talk and later slots", () => {
    const result = nowNext(schedule.days, new Date(at(10, "10:05")), TZ);
    const el = renderNowNext(result, { tz: TZ });
    const now = el.querySelector(".now");
    expect(now.textContent).toContain("Essex Center");
    expect(now.textContent).toContain("until 11:30");
    expect(now.textContent).toContain("Paper a");
    expect(el.querySelectorAll(".next")).toHaveLength(1);
    expect(el.querySelector(".next").textContent).toContain("13:00");
  });

  it("says when nothing is happening right now", () => {
    const result = nowNext(schedule.days, new Date(at(10, "12:00")), TZ);
    expect(renderNowNext(result, { tz: TZ }).textContent).toContain("Nothing you follow right now");
  });
});
