import { describe, expect, it } from "vitest";
import { dayKey, formatTime } from "../src/lib/time.js";
import { groupIntoSlots, nowNext } from "../src/lib/schedule.js";

const TZ = "US/Eastern";
// Nov 2026 is EST (UTC-5): 10:00 Eastern = 15:00Z
const at = (day, hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 10, day, h + 5, m)).toISOString();
};
let n = 0;
function talk(sessionId, room, day, sessionFrom, sessionTo, talkFrom, talkTo) {
  return {
    id: `p${++n}`,
    title: `Paper ${n}`,
    sessionId,
    sessionName: `Session ${sessionId}`,
    room,
    sessionStart: at(day, sessionFrom),
    sessionEnd: at(day, sessionTo),
    start: talkFrom ? at(day, talkFrom) : null,
    end: talkTo ? at(day, talkTo) : null,
  };
}

describe("time helpers", () => {
  it("formats times and days in the conference timezone", () => {
    expect(formatTime("2026-11-11T18:00:00.000Z", TZ)).toBe("13:00");
    expect(dayKey("2026-11-11T03:30:00Z", TZ)).toBe("2026-11-10");
  });
});

describe("groupIntoSlots", () => {
  const agents = [
    talk("agents", "Essex Center", 10, "10:00", "11:30", "10:00", "10:12"),
    talk("agents", "Essex Center", 10, "10:00", "11:30", "10:24", "10:36"),
    talk("agents", "Essex Center", 10, "10:00", "11:30", "10:12", "10:24"),
  ];
  const picture = [talk("picture", "America Center", 10, "10:00", "11:30", "10:48", "11:00")];
  const afternoon = [talk("modern", "America Center", 10, "13:00", "14:30", "13:00", "13:12")];

  it("groups parallel sessions into one slot and recommends the busiest", () => {
    const { days } = groupIntoSlots([...picture, ...agents, ...afternoon], TZ);
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe("2026-11-10");
    const [morning, after] = days[0].slots;
    expect(morning.recommended.sessionId).toBe("agents");
    expect(morning.recommended.items.map((d) => d.start)).toEqual(
      [...agents].map((d) => d.start).sort(),
    );
    expect(morning.alternatives.map((s) => s.sessionId)).toEqual(["picture"]);
    expect(after.recommended.sessionId).toBe("modern");
  });

  it("joins a long workshop with every session it overlaps", () => {
    const workshop = [talk("ws", "Room W", 10, "09:00", "12:30", null, null)];
    const { days } = groupIntoSlots([...agents, ...picture, ...workshop, ...afternoon], TZ);
    expect(days[0].slots).toHaveLength(2);
    expect(days[0].slots[0].sessions.map((s) => s.sessionId).sort()).toEqual([
      "agents",
      "picture",
      "ws",
    ]);
  });

  it("breaks ties by the earliest first talk", () => {
    const a = [talk("late", "R1", 11, "10:00", "11:30", "10:40", "10:50")];
    const b = [talk("early", "R2", 11, "10:00", "11:30", "10:05", "10:15")];
    const { days } = groupIntoSlots([...a, ...b], TZ);
    expect(days[0].slots[0].recommended.sessionId).toBe("early");
  });

  it("lists untimed items after timed ones inside a session", () => {
    const untimed = { ...talk("agents", "Essex Center", 10, "10:00", "11:30", null, null) };
    const { days } = groupIntoSlots([untimed, ...agents], TZ);
    const items = days[0].slots[0].recommended.items;
    expect(items.at(-1).id).toBe(untimed.id);
  });

  it("buckets days in the conference timezone", () => {
    const late = talk("night", "R", 10, "22:00", "23:00", "22:30", "22:40");
    expect(late.start).toBe("2026-11-11T03:30:00.000Z");
    const { days } = groupIntoSlots([late], TZ);
    expect(days[0].date).toBe("2026-11-10");
  });

  it("puts items without a session or time in unscheduled", () => {
    const poster = { id: "x", title: "Poster", sessionId: null, start: null };
    const { days, unscheduled } = groupIntoSlots([poster, ...afternoon], TZ);
    expect(unscheduled.map((d) => d.id)).toEqual(["x"]);
    expect(days[0].slots).toHaveLength(1);
  });
});

describe("nowNext", () => {
  const items = [
    talk("agents", "Essex Center", 10, "10:00", "11:30", "10:00", "10:12"),
    talk("agents", "Essex Center", 10, "10:00", "11:30", "10:12", "10:24"),
    talk("modern", "America Center", 10, "13:00", "14:30", "13:00", "13:12"),
    talk("figuring", "America Center", 10, "15:00", "16:30", "15:00", "15:12"),
  ];
  const { days } = groupIntoSlots(items, TZ);

  it("returns the current slot, the next talk, and later slots", () => {
    const result = nowNext(days, new Date(at(10, "10:14")), TZ);
    expect(result.now.recommended.sessionId).toBe("agents");
    expect(result.nowItem.id).toBe(items[1].id);
    expect(result.next.map((s) => s.recommended.sessionId)).toEqual(["modern", "figuring"]);
  });

  it("has no current slot between sessions but still lists the next ones", () => {
    const result = nowNext(days, new Date(at(10, "12:00")), TZ);
    expect(result.now).toBeNull();
    expect(result.next.map((s) => s.recommended.sessionId)).toEqual(["modern", "figuring"]);
  });

  it("returns null outside conference days", () => {
    expect(nowNext(days, new Date("2026-11-20T15:00:00Z"), TZ)).toBeNull();
  });
});
