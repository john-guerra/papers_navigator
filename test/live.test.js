import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  activeSession,
  createCheckInStore,
  programDays,
  rankSessions,
  sessionSummary,
  slotOf,
  slotsAt,
  talkAt,
} from "../src/lib/live.js";

const TZ = "US/Eastern";
// Wed Nov 11 2026, US/Eastern = UTC−5
const et = (hhmm, day = 11) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 10, day, h + 5, m)).toISOString();
};
const talk = (id, sessionId, room, from, to, extra = {}) => ({
  id,
  title: `Paper ${id}`,
  sessionId,
  sessionName: `Session ${sessionId}`,
  room,
  sessionStart: et("10:30"),
  sessionEnd: et("12:00"),
  start: et(from),
  end: et(to),
  typeShort: "Full",
  awardTier: null,
  clusterLabel: null,
  ...extra,
});
const papers = [
  talk("a1", "A", "Room 2", "10:30", "10:45"),
  talk("b1", "B", "Room 3", "10:30", "10:45"),
  talk("b2", "B", "Room 3", "10:45", "11:00"),
  talk("c1", "C", "Room 1", "10:30", "10:45"),
  // A later slot
  {
    ...talk("d1", "D", "Room 1", "14:00", "14:15"),
    sessionStart: et("14:00"),
    sessionEnd: et("15:30"),
  },
  // The next day
  {
    ...talk("e1", "E", "Room 1", "09:00", "09:15"),
    sessionStart: et("09:00", 12),
    sessionEnd: et("10:00", 12),
    start: et("09:00", 12),
    end: et("09:15", 12),
  },
];
const days = programDays(papers, TZ);
const slot = days[0].slots[0];

describe("rankSessions", () => {
  it("puts the sessions with most of your papers first, then by room; the first is recommended", () => {
    const ranked = rankSessions(slot, new Set(["b1", "b2"]));
    expect(ranked.map((s) => [s.sessionId, s.mine, s.recommended])).toEqual([
      ["B", 2, true],
      ["C", 0, false],
      ["A", 0, false],
    ]);
  });

  it("recommends nothing when none of your papers are there", () => {
    expect(rankSessions(slot, new Set()).some((s) => s.recommended)).toBe(
      false,
    );
  });
});

describe("sessionSummary", () => {
  it("counts papers, types, awards and the most common topics", () => {
    const items = [
      { typeShort: "Full", awardTier: "best", clusterLabel: "Perception" },
      { typeShort: "Full", awardTier: null, clusterLabel: "Perception" },
      { typeShort: "Full", awardTier: null, clusterLabel: "Color" },
      { typeShort: "Short", awardTier: null, clusterLabel: null },
    ];
    expect(sessionSummary({ items })).toBe(
      "4 papers · 3 Full · 1 Short · 🏆 1 · Perception; Color",
    );
  });

  it("leaves out empty parts and says paper for one", () => {
    expect(
      sessionSummary({
        items: [{ typeShort: "Poster", awardTier: null, clusterLabel: null }],
      }),
    ).toBe("1 paper · 1 Poster");
  });
});

describe("slotsAt", () => {
  it("during a slot: now is it, next is the following one", () => {
    const s = slotsAt(days, new Date(et("10:40")), TZ);
    expect(s.now).toBe(slot);
    expect(s.next.sessions[0].sessionId).toBe("D");
    expect(s.later).toEqual([]);
    expect(s.nextDay).toBeNull();
  });

  it("at a break: no now, next is the coming slot, the rest is later today", () => {
    const s = slotsAt(days, new Date(et("09:00")), TZ);
    expect(s.now).toBeNull();
    expect(s.next).toBe(slot);
    expect(s.later.map((x) => x.sessions[0].sessionId)).toEqual(["D"]);
  });

  it("after the day's last slot: points to the next day's first slot", () => {
    const s = slotsAt(days, new Date(et("18:00")), TZ);
    expect(s.next).toBeNull();
    expect(s.nextDay.date).toBe("2026-11-12");
    expect(s.nextDay.slot.sessions[0].sessionId).toBe("E");
  });
});

describe("talkAt", () => {
  it("finds the talk in progress", () => {
    const B = slot.sessions.find((s) => s.sessionId === "B");
    expect(talkAt(B, new Date(et("10:50"))).id).toBe("b2");
    expect(talkAt(B, new Date(et("11:30")))).toBeNull();
  });

  it("is null for papers with only a session time (workshops, posters)", () => {
    const session = { items: [{ id: "w", start: null, end: null }] };
    expect(talkAt(session, new Date(et("10:50")))).toBeNull();
  });
});

describe("check-in", () => {
  const memoryStorage = () => {
    const data = new Map();
    return {
      data,
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(k, String(v)),
      removeItem: (k) => data.delete(k),
    };
  };

  it("commits, replaces and leaves", () => {
    const store = createCheckInStore(
      "ieeevis2026",
      memoryStorage(),
      new EventTarget(),
    );
    expect(store.value).toBeNull();
    store.commit("B", new Date(et("10:30")));
    expect(store.value).toEqual({ sessionId: "B", at: et("10:30") });
    store.commit("C", new Date(et("10:35")));
    expect(store.value.sessionId).toBe("C");
    store.leave();
    expect(store.value).toBeNull();
  });

  it("drops corrupt or incomplete stored values", () => {
    const storage = memoryStorage();
    const key = "papersNavigator:ieeevis2026:liveCheckIn";
    storage.setItem(key, "{x");
    expect(createCheckInStore("ieeevis2026", storage).value).toBeNull();
    storage.setItem(key, JSON.stringify({ at: et("10:30") }));
    expect(createCheckInStore("ieeevis2026", storage).value).toBeNull();
  });

  it("activeSession: the checked-in session while it runs, else null", () => {
    const checkIn = { sessionId: "B", at: et("10:30") };
    expect(
      activeSession(checkIn, days, new Date(et("11:00")), TZ).sessionId,
    ).toBe("B");
    expect(activeSession(checkIn, days, new Date(et("12:00")), TZ)).toBeNull();
    expect(
      activeSession(
        { sessionId: "gone", at: et("10:30") },
        days,
        new Date(et("11:00")),
        TZ,
      ),
    ).toBeNull();
    expect(activeSession(null, days, new Date(et("11:00")), TZ)).toBeNull();
  });
});

describe("programDays on the real program", () => {
  it("groups every paper session into slots of at most 6 parallel sessions", () => {
    const real = JSON.parse(
      readFileSync(
        new URL("../conferences/ieeevis2026/data/papers.json", import.meta.url),
        "utf-8",
      ),
    );
    const realDays = programDays(real, TZ);
    const slots = realDays.flatMap((d) => d.slots);
    expect(slots.length).toBeGreaterThanOrEqual(15);
    expect(
      Math.max(...slots.map((s) => s.sessions.length)),
    ).toBeLessThanOrEqual(6);
    // every session with a time is somewhere
    const sessions = new Set(
      real
        .filter((p) => p.sessionId && (p.start || p.sessionStart))
        .map((p) => p.sessionId),
    );
    expect(
      new Set(slots.flatMap((s) => s.sessions.map((x) => x.sessionId))),
    ).toEqual(sessions);
  });
});

describe("worthMoving (#208)", () => {
  // 3 rooms of back-to-back 12-minute talks from 10:30; X is untimed (posters)
  const t = (id, s, room, from, extra = {}) => ({
    id,
    title: `T ${id}`,
    sessionId: s,
    sessionName: `S ${s}`,
    room,
    sessionStart: et("10:30"),
    sessionEnd: et("12:00"),
    start: et(from),
    end: new Date(new Date(et(from)).getTime() + 12 * 60_000).toISOString(),
    awardTier: null,
    ...extra,
  });
  const ps = [
    t("a1", "A", "R1", "10:30"),
    t("a2", "A", "R1", "10:42"),
    t("a3", "A", "R1", "10:54", { awardTier: "best", award: "best paper" }),
    t("a4", "A", "R1", "11:06"),
    t("b1", "B", "R2", "10:27"),
    t("b2", "B", "R2", "10:39", {
      awardTier: "honorable",
      award: "honorable mention",
    }),
    t("b3", "B", "R2", "10:51"),
    t("c1", "C", "R3", "10:30"),
    t("c2", "C", "R3", "10:42"),
    { ...t("x1", "X", "Hall", "10:30"), start: null, end: null },
  ];
  const [slot] = programDays(ps, TZ)[0].slots;
  const C = slot.sessions.find((s) => s.sessionId === "C");
  const mine = new Map([
    ["a2", { id: "a2", manual: true, reasons: ["★ Added by hand"] }],
    ["b3", { id: "b3", manual: false, reasons: ["👥 Ann Lee"] }],
    ["c2", { id: "c2", manual: true, reasons: ["★ Added by hand", "🏫 MIT"] }],
    ["a4", { id: "a4", manual: true, reasons: ["★ Added by hand"] }],
  ]);

  it("lists the next two talks per room that are yours or awarded, yours first; the badge counts other rooms", async () => {
    const { worthMoving } = await import("../src/lib/live.js");
    const { rows, badge } = worthMoving(slot, C, new Date(et("10:40")), mine);
    expect(rows.map((r) => [r.paper.id, r.state, r.here, r.chips])).toEqual([
      ["a2", "soon", false, ["★ My Papers"]],
      ["c2", "soon", true, ["★ My Papers", "🏫 MIT"]],
      ["b3", "soon", false, ["👥 Ann Lee"]],
      ["b2", "just started", false, ["🏅 Honorable mention"]],
      ["a3", "soon", false, ["🏆 Best"]],
    ]);
    // a4 is the third talk after now in R1: outside the window
    expect(badge).toBe(4);
    expect(rows[0].minutes).toBe(2);
  });

  it("On now: one line per other room, with its talk and chips; untimed rooms have none", async () => {
    const { worthMoving } = await import("../src/lib/live.js");
    const { onNow } = worthMoving(slot, C, new Date(et("10:40")), mine);
    expect(onNow.map((d) => [d.session.sessionId, d.talk?.id ?? null])).toEqual(
      [
        ["A", "a1"],
        ["B", "b2"],
        ["X", null],
      ],
    );
  });

  it("nothing qualifies: no rows, badge 0", async () => {
    const { worthMoving } = await import("../src/lib/live.js");
    const r = worthMoving(slot, C, new Date(et("10:40")), new Map());
    expect(r.rows.map((d) => d.paper.id)).toEqual(["b2", "a3"]);
    const none = worthMoving(slot, C, new Date(et("11:50")), new Map());
    expect(none.rows).toEqual([]);
    expect(none.badge).toBe(0);
  });
});

describe("checkedInSession (#208 review)", () => {
  it("finds the checked-in session even after it ended (phone slept through it)", async () => {
    const { checkedInSession } = await import("../src/lib/live.js");
    expect(
      checkedInSession({ sessionId: "B", at: et("10:30") }, days).sessionId,
    ).toBe("B");
    expect(
      checkedInSession({ sessionId: "gone", at: et("10:30") }, days),
    ).toBeNull();
    expect(checkedInSession(null, days)).toBeNull();
  });
});

describe("worthMoving sort: My Papers, then award, then time (#208 review)", () => {
  it("puts an awarded talk of yours before your other talks", async () => {
    const { worthMoving } = await import("../src/lib/live.js");
    const ps = [
      talk("x1", "X", "R1", "10:30", "10:42"),
      talk("x2", "X", "R1", "10:42", "10:54"),
      talk("y1", "Y", "R2", "10:30", "10:44"),
      talk("y2", "Y", "R2", "10:44", "10:56", {
        awardTier: "best",
        award: "best paper",
      }),
      talk("z1", "Z", "R3", "10:30", "10:42"),
    ];
    const [s] = programDays(ps, TZ)[0].slots;
    const Z = s.sessions.find((x) => x.sessionId === "Z");
    const mine = new Map(
      ["x2", "y2"].map((id) => [id, { id, manual: true, reasons: [] }]),
    );
    const { rows } = worthMoving(s, Z, new Date(et("10:40")), mine);
    // y2 starts later (10:44) than x2 (10:42) but is awarded: first
    expect(rows.map((r) => r.paper.id)).toEqual(["y2", "x2"]);
  });
});

describe("programDays with sessions without papers (plenaries, panels)", () => {
  const event = (sessionId, title, from, to, extra = {}) => ({
    sessionId,
    type: "plenary",
    typeLabel: "Plenary",
    title,
    room: "Hall America",
    start: et(from),
    end: et(to),
    url: `https://ieeevis.org/s/${sessionId}`,
    paperIds: [],
    ...extra,
  });
  const sessions = [
    // All day, over the paper slot: joins it, without stretching it
    event("visap", "VISAP Exhibition", "09:00", "18:00", { type: "visap" }),
    // Nothing else on: their own slot, merged as they overlap
    event("awards", "Awards", "12:15", "13:00"),
    event("meetup", "Vega meetup", "12:30", "13:30", { type: "meetup" }),
    // Already in the papers (by id, or listing one of their papers): skipped
    event("A", "Session A", "10:30", "12:00"),
    event("beliv-2", "BELIV part 2", "16:00", "17:00", { paperIds: ["c1"] }),
  ];
  const withEvents = programDays(papers, TZ, sessions);
  const wed = withEvents.find((d) => d.date === "2026-11-11");

  it("adds an event to the paper slot it overlaps, keeping the slot's times", () => {
    const slot = wed.slots[0];
    expect([slot.start, slot.end]).toEqual([
      Date.parse(et("10:30")),
      Date.parse(et("12:00")),
    ]);
    const visap = slot.sessions.find((s) => s.sessionId === "visap");
    expect(visap).toMatchObject({
      sessionName: "VISAP Exhibition",
      room: "Hall America",
      items: [],
      start: Date.parse(et("09:00")),
      end: Date.parse(et("18:00")),
      event: {
        type: "visap",
        typeLabel: "Plenary",
        url: "https://ieeevis.org/s/visap",
      },
    });
  });

  it("gives events with nothing else on their own slot, in time order", () => {
    expect(wed.slots.map((s) => s.sessions.map((x) => x.sessionId))).toEqual([
      ["A", "B", "C", "visap"],
      ["awards", "meetup"],
      ["D", "visap"],
    ]);
    expect(wed.slots[1].end).toBe(Date.parse(et("13:30")));
    expect(slotsAt(withEvents, new Date(et("12:45")), TZ).now).toBe(
      wed.slots[1],
    );
  });

  it("skips sessions that are already paper sessions", () => {
    const ids = withEvents.flatMap((d) =>
      d.slots.flatMap((s) => s.sessions.map((x) => x.sessionId)),
    );
    expect(ids.filter((id) => id === "A")).toHaveLength(1);
    expect(ids).not.toContain("beliv-2");
  });

  it("without sessions, is the papers' program", () => {
    expect(programDays(papers, TZ, [])).toEqual(programDays(papers, TZ));
  });
});

describe("sessions without papers on Live", () => {
  const visap = {
    sessionId: "visap",
    type: "visap",
    typeLabel: "Arts Program",
    title: "VISAP Exhibition",
    room: "Hall E",
    start: et("09:00"),
    end: et("18:00"),
    url: "https://ieeevis.org/s/visap",
    paperIds: [],
  };
  const all = programDays(papers, TZ, [visap]);
  const event = all[0].slots[0].sessions.find((s) => s.sessionId === "visap");

  it("summarises an event by its type", () => {
    expect(sessionSummary(event)).toBe("Arts Program");
  });

  it("slotOf finds the slot an event is in at `at` (one event, several slots)", () => {
    expect(slotOf(event, all, new Date(et("14:30"))).start).toBe(
      Date.parse(et("14:00")),
    );
    expect(slotOf(event, all).start).toBe(Date.parse(et("10:30")));
  });
});

describe("rankSessions with events", () => {
  const ev = (sessionId, type, from, room) => ({
    sessionId,
    type,
    typeLabel: type,
    title: sessionId,
    room,
    start: et(from),
    end: et("15:30"),
    url: null,
    paperIds: [],
  });
  it("puts a plenary first, then paper sessions, then other events by start, then room", () => {
    const all = programDays(papers, TZ, [
      ev("late-meetup", "meetup", "14:30", "Hall A"),
      ev("panel", "panel", "14:00", "Hall Z"),
      ev("lunch", "plenary", "14:00", "Hall Y"),
    ]);
    const slot = all[0].slots.find((s) =>
      s.sessions.some((x) => x.sessionId === "D"),
    );
    expect(rankSessions(slot, new Set()).map((s) => s.sessionId)).toEqual([
      "lunch",
      "D",
      "panel",
      "late-meetup",
    ]);
  });
});

describe("checked in to an event in several slots (review)", () => {
  const visap = {
    sessionId: "visap",
    type: "visap",
    typeLabel: "Arts Program",
    title: "VISAP Exhibition",
    room: "Hall E",
    start: et("09:00"),
    end: et("18:00"),
    url: null,
    paperIds: [],
  };
  const all = programDays(papers, TZ, [visap]);
  const checkIn = (hhmm) => ({ sessionId: "visap", at: et(hhmm) });

  it("ends with the slot you checked in during, not at the event's end", () => {
    expect(
      activeSession(checkIn("10:40"), all, new Date(et("11:50")), TZ)
        ?.sessionId,
    ).toBe("visap");
    expect(
      activeSession(checkIn("10:40"), all, new Date(et("12:00")), TZ),
    ).toBeNull();
  });

  it("checked in from Next (between slots) counts the slot that starts next", () => {
    expect(
      activeSession(checkIn("13:50"), all, new Date(et("14:30")), TZ)
        ?.sessionId,
    ).toBe("visap");
    expect(
      activeSession(checkIn("13:50"), all, new Date(et("15:30")), TZ),
    ).toBeNull();
  });

  it("slotOf between slots is the one starting next", () => {
    const event = all[0].slots[0].sessions.find((s) => s.sessionId === "visap");
    expect(slotOf(event, all, new Date(et("13:50"))).start).toBe(
      Date.parse(et("14:00")),
    );
  });
});
