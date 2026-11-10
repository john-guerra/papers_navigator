import { describe, expect, it } from "vitest";
import { createLiveClock, liveTime } from "../src/lib/liveClock.js";

const TZ = "US/Eastern";
const KEY = "papersNavigator:ieeevis2026:liveClock";
const memoryStorage = () => {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
};
const at = (iso) => new Date(iso);

describe("liveTime", () => {
  it("is the clock without an override", () => {
    const T = at("2026-11-11T15:00:00Z");
    expect(liveTime(null, T, TZ)).toEqual({ at: T, override: false });
  });

  it("adds the stored offset on the day it was set", () => {
    const stored = { offsetMs: 3_600_000, day: "2026-11-11" };
    expect(liveTime(stored, at("2026-11-11T15:00:00Z"), TZ)).toEqual({
      at: at("2026-11-11T16:00:00Z"),
      override: true,
    });
  });

  it("ignores an offset from another conference day", () => {
    const stored = { offsetMs: 3_600_000, day: "2026-11-11" };
    const T = at("2026-11-12T15:00:00Z");
    expect(liveTime(stored, T, TZ)).toEqual({ at: T, override: false });
  });

  it("uses the conference timezone for the day (03:00 UTC is still the 11th in Boston)", () => {
    const stored = { offsetMs: 0, day: "2026-11-11" };
    expect(liveTime(stored, at("2026-11-12T03:00:00Z"), TZ).override).toBe(
      true,
    );
  });

  it("ignores a malformed stored value", () => {
    const T = at("2026-11-11T15:00:00Z");
    expect(liveTime({ offsetMs: "x", day: 3 }, T, TZ)).toEqual({
      at: T,
      override: false,
    });
  });
});

describe("createLiveClock", () => {
  it("stores an offset when set, and forgets it on reset", () => {
    const storage = memoryStorage();
    const now = () => at("2026-11-11T15:00:00Z");
    const clock = createLiveClock("ieeevis2026", { tz: TZ, storage, now });
    let events = 0;
    clock.addEventListener("input", () => events++);
    clock.setTo(at("2026-11-11T18:00:00Z"));
    expect(JSON.parse(storage.data.get(KEY))).toEqual({
      offsetMs: 10_800_000,
      day: "2026-11-11",
    });
    expect(clock.value).toEqual({
      at: at("2026-11-11T18:00:00Z"),
      override: true,
    });
    clock.reset();
    expect(storage.data.has(KEY)).toBe(false);
    expect(clock.value.override).toBe(false);
    expect(events).toBe(2);
  });

  it("keeps ticking forward from a set time", () => {
    const storage = memoryStorage();
    let t = at("2026-11-11T15:00:00Z");
    const clock = createLiveClock("ieeevis2026", {
      tz: TZ,
      storage,
      now: () => t,
    });
    clock.setTo(at("2026-11-11T14:00:00Z"));
    t = at("2026-11-11T15:30:00Z");
    clock.tick();
    expect(clock.value.at).toEqual(at("2026-11-11T14:30:00Z"));
  });

  it("survives corrupt storage", () => {
    const storage = memoryStorage();
    storage.setItem(KEY, "{nope");
    const now = () => at("2026-11-11T15:00:00Z");
    const clock = createLiveClock("ieeevis2026", { tz: TZ, storage, now });
    expect(clock.value).toEqual({ at: now(), override: false });
  });
});
