import { dayKey } from "./time.js";

/**
 * The Live page's time (#203): the clock, or a time set by hand. A set time is stored as an
 * offset from the clock (so it keeps ticking: "running 10 min late" works) and only counts on
 * the conference day it was set (`day`, conference timezone); the next day starts on real time.
 * Stored on this device only (`papersNavigator:<id>:liveClock`), never in a URL.
 */
export function liveTime(stored, now, tz) {
  const valid =
    stored &&
    Number.isFinite(stored.offsetMs) &&
    typeof stored.day === "string";
  if (!valid || dayKey(now, tz) !== stored.day)
    return { at: now, override: false };
  return { at: new Date(now.getTime() + stored.offsetMs), override: true };
}

/**
 * Reactive clock: `.value` is `{at: Date, override: boolean}`; emits `input` on `setTo(date)`,
 * `reset()` and `tick()` (the page ticks it every 30 s).
 */
export function createLiveClock(
  conferenceId,
  { tz, storage = globalThis.localStorage, now = () => new Date() } = {},
) {
  const key = `papersNavigator:${conferenceId}:liveClock`;
  const clock = new EventTarget();
  const read = () => {
    try {
      return JSON.parse(storage?.getItem(key) ?? "null");
    } catch {
      return null;
    }
  };
  let stored = read();
  let value = liveTime(stored, now(), tz);
  const update = () => {
    value = liveTime(stored, now(), tz);
    clock.dispatchEvent(new Event("input"));
  };
  Object.defineProperty(clock, "value", { get: () => value });
  clock.setTo = (date) => {
    const t = now();
    stored = { offsetMs: date.getTime() - t.getTime(), day: dayKey(t, tz) };
    try {
      storage?.setItem(key, JSON.stringify(stored));
    } catch {
      // kept for this visit
    }
    update();
  };
  clock.reset = () => {
    stored = null;
    try {
      storage?.removeItem(key);
    } catch {
      // nothing stored
    }
    update();
  };
  clock.tick = update;
  return clock;
}
