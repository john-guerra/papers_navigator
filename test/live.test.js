import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  activeSession,
  createCheckInStore,
  programDays,
  rankSessions,
  sessionSummary,
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
