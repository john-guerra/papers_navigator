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
  end: at(
    day,
    talk.replace(/:(\d\d)$/, (_, m) => `:${String(+m + 9).padStart(2, "0")}`),
  ),
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
    expect(slots[0].querySelector("summary").textContent).toContain(
      "📍 Essex Center",
    );
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
    const el = renderItinerary(schedule, {
      tz: TZ,
      onUnfollow: (id) => removed.push(id),
    });
    el.querySelector("button.unfollow").click();
    expect(removed).toEqual(["a"]);
  });

  it("lists unscheduled items", () => {
    const el = renderItinerary(
      groupIntoSlots([{ id: "p", title: "Poster" }], TZ),
      { tz: TZ },
    );
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
    expect(renderNowNext(result, { tz: TZ }).textContent).toContain(
      "Nothing of yours right now",
    );
  });
});

describe("renderItinerary state", () => {
  it("keeps the selected day across re-renders", () => {
    const state = {};
    const first = renderItinerary(schedule, {
      tz: TZ,
      state,
      now: new Date(at(1, "10:00")),
    });
    first.querySelector(".day-tabs button").click();
    expect(state.day).toBe("2026-11-10");
    const second = renderItinerary(schedule, {
      tz: TZ,
      state,
      now: new Date(at(1, "10:00")),
    });
    expect(second.querySelector(".day-tabs button.on").textContent.trim()).toBe(
      "Tue Nov 10",
    );
  });

  it("keeps open slots open across re-renders", () => {
    const state = {};
    const first = renderItinerary(schedule, { tz: TZ, state });
    const slot = first.querySelector("details.slot");
    slot.open = true;
    slot.dispatchEvent(new Event("toggle"));
    const second = renderItinerary(schedule, { tz: TZ, state });
    expect(second.querySelector("details.slot").open).toBe(true);
  });
});

describe("nowNext statuses (#14)", () => {
  const conferenceDays = [
    "2026-11-08",
    "2026-11-09",
    "2026-11-10",
    "2026-11-11",
    "2026-11-12",
    "2026-11-13",
  ];
  const items2 = [
    item("a", "agents", "Essex Center", 10, "10:00", "11:30", "10:00"),
    item("b", "agents", "Essex Center", 10, "10:00", "11:30", "10:12"),
    item("z", "late", "America Center", 12, "13:00", "14:30", "13:00"),
  ];
  const days2 = groupIntoSlots(items2, TZ).days;
  it("labels the talk in progress and the following one", () => {
    const r = nowNext(days2, new Date(at(10, "10:05")), TZ, { conferenceDays });
    expect(r.status).toBe("live");
    expect(r.nowItem.id).toBe("a");
    expect(r.nextItem.id).toBe("b");
  });
  it("on a conference day with nothing (more) of yours, points to the next day's first slot", () => {
    const r = nowNext(days2, new Date(at(11, "09:00")), TZ, { conferenceDays });
    expect(r.status).toBe("nothing-today");
    expect(r.upcoming.date).toBe("2026-11-12");
    expect(r.upcoming.slot.recommended.room).toBe("America Center");
    const afterLast = nowNext(days2, new Date(at(10, "15:00")), TZ, {
      conferenceDays,
    });
    expect(afterLast.status).toBe("nothing-today");
  });
  it("after the last conference day says the conference is over", () => {
    expect(
      nowNext(days2, new Date(at(14, "10:00")), TZ, { conferenceDays }).status,
    ).toBe("over");
  });
  it("outside the conference (before it starts) returns null so the itinerary shows", () => {
    expect(
      nowNext(days2, new Date(at(1, "10:00")), TZ, { conferenceDays }),
    ).toBeNull();
  });
  it("renders the new states and singular counts", () => {
    const nothing = renderNowNext(
      nowNext(days2, new Date(at(11, "09:00")), TZ, { conferenceDays }),
      { tz: TZ },
    );
    expect(nothing.textContent.replace(/\s+/g, " ")).toContain(
      "Nothing of yours today",
    );
    expect(nothing.textContent.replace(/\s+/g, " ")).toContain("Thu Nov 12");
    expect(nothing.textContent.replace(/\s+/g, " ")).toContain("1 paper");
    expect(nothing.textContent).not.toContain("1 papers");
    const over = renderNowNext({ status: "over" }, { tz: TZ });
    expect(over.textContent).toContain("The conference is over");
    const live = renderNowNext(
      nowNext(days2, new Date(at(10, "10:05")), TZ, { conferenceDays }),
      { tz: TZ },
    );
    const text = live.textContent.replace(/\s+/g, " ");
    expect(text).toContain("now: Paper a");
    expect(text).toContain("next: Paper b");
  });
});
