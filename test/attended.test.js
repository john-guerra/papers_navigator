import { describe, expect, it } from "vitest";
import {
  autoAttended,
  cleanAttended,
  createAttendedStore,
} from "../src/lib/attended.js";

const KEY = "papersNavigator:ieeevis2026:attended";
const memoryStorage = () => {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
};
const et = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 10, 11, h + 5, m)).toISOString();
};
const talk = (id, from, minutes = 12) => ({
  id,
  start: et(from),
  end: new Date(new Date(et(from)).getTime() + minutes * 60_000).toISOString(),
});

describe("attended store (#208)", () => {
  it("cleanAttended keeps valid entries", () => {
    expect(
      cleanAttended({
        a: { at: "2026-11-11T15:00:00.000Z", how: "auto" },
        b: { off: true },
        c: { how: "x" },
        d: 3,
      }),
    ).toEqual({
      a: { at: "2026-11-11T15:00:00.000Z", how: "auto" },
      b: { off: true },
    });
  });

  it("set on/off; markAuto skips unticked and existing entries", () => {
    const s = createAttendedStore(
      "ieeevis2026",
      memoryStorage(),
      new EventTarget(),
    );
    const now = new Date("2026-11-11T15:00:00.000Z");
    s.set("a", true, now);
    expect(s.isAttended("a")).toBe(true);
    expect(s.value.a.how).toBe("manual");
    s.set("b", false, now);
    expect(s.value.b).toEqual({ off: true });
    s.markAuto(["a", "b", "c"], now);
    expect(s.value.a.how).toBe("manual");
    expect(s.value.b).toEqual({ off: true });
    expect(s.value.c).toEqual({ at: now.toISOString(), how: "auto" });
    expect(s.isAttended("b")).toBe(false);
  });

  it("merge: yours win (an unticked paper stays unticked); undo", () => {
    const storage = memoryStorage();
    const s = createAttendedStore("ieeevis2026", storage, new EventTarget());
    s.set("a", false, new Date());
    const { added, undo } = s.merge({
      a: { at: "2026-11-11T15:00:00.000Z", how: "auto" },
      b: { at: "2026-11-11T15:00:00.000Z", how: "manual" },
    });
    expect(added).toBe(1);
    expect(s.value.a).toEqual({ off: true });
    undo();
    expect(Object.keys(s.value)).toEqual(["a"]);
    expect(JSON.parse(storage.data.get(KEY))).toEqual({ a: { off: true } });
  });
});

describe("autoAttended (#208): checked in for 5+ minutes of a talk", () => {
  const session = {
    items: [
      talk("t1", "10:00"),
      talk("t2", "10:12"),
      talk("t3", "10:24"),
      talk("t4", "10:36"),
      { id: "poster", start: null, end: null },
    ],
  };
  it("counts the overlap with the check-in", () => {
    // checked in at 10:20: t2 overlap 4 min (no), t3 12 (yes); now 10:41: t4 overlap 5 (yes)
    expect(
      autoAttended(session, { at: et("10:20") }, new Date(et("10:41"))),
    ).toEqual(["t3", "t4"]);
  });
  it("never counts talks that ended before the check-in", () => {
    expect(
      autoAttended(session, { at: et("10:30") }, new Date(et("10:34"))),
    ).toEqual([]);
  });
  it("after the phone slept through talks, they all count at the next tick", () => {
    expect(
      autoAttended(session, { at: et("10:00") }, new Date(et("10:50"))),
    ).toEqual(["t1", "t2", "t3", "t4"]);
  });
});

describe("autoAttended review fixes (#208)", () => {
  const session = { items: [talk("t1", "10:00"), talk("t2", "10:12")] };
  it("never marks for a check-in made while the time was set by hand", () => {
    expect(
      autoAttended(
        session,
        { at: et("10:00"), override: true },
        new Date(et("10:30")),
      ),
    ).toEqual([]);
  });
  it("never marks when the check-in is later than now (made at a time set ahead)", () => {
    expect(
      autoAttended(session, { at: et("10:20") }, new Date(et("10:10"))),
    ).toEqual([]);
  });
});
