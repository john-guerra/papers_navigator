import { describe, expect, it } from "vitest";
import {
  ANIMATION_KEY,
  SPEEDS,
  createAnimationSettings,
  mapAnimation,
} from "../src/lib/animationSettings.js";

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => (data[k] = String(v)),
    removeItem: (k) => delete data[k],
    data,
  };
};

describe("animation settings", () => {
  it("defaults: animate, align, animate filter changes, by topic, normal speed", () => {
    const store = createAnimationSettings({
      storage: memoryStorage(),
      reducedMotion: false,
    });
    expect(store.value).toEqual({
      enabled: true,
      align: true,
      filters: true,
      motion: "topic",
      speed: "normal",
    });
    expect(SPEEDS).toEqual({ slow: 1200, normal: 700, fast: 400 });
  });

  it("is off by default with prefers-reduced-motion, unless the user turns it on", () => {
    const storage = memoryStorage();
    const store = createAnimationSettings({ storage, reducedMotion: true });
    expect(store.value.enabled).toBe(false);
    store.set({ enabled: true });
    expect(
      createAnimationSettings({ storage, reducedMotion: true }).value.enabled,
    ).toBe(true);
  });

  it("stores only the choices made and emits input", () => {
    const storage = memoryStorage();
    const store = createAnimationSettings({ storage, reducedMotion: false });
    let fired = 0;
    store.addEventListener("input", () => fired++);
    store.set({ speed: "fast", motion: "all" });
    expect(fired).toBe(1);
    expect(store.value.speed).toBe("fast");
    expect(JSON.parse(storage.data[ANIMATION_KEY])).toEqual({
      speed: "fast",
      motion: "all",
    });
  });

  it("ignores invalid stored values and survives a throwing storage", () => {
    const storage = memoryStorage({
      [ANIMATION_KEY]: JSON.stringify({ speed: "warp", align: false }),
    });
    const store = createAnimationSettings({ storage, reducedMotion: false });
    expect(store.value.speed).toBe("normal");
    expect(store.value.align).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const safe = createAnimationSettings({
      storage: broken,
      reducedMotion: false,
    });
    expect(safe.value.enabled).toBe(true);
    safe.set({ enabled: false });
    expect(safe.value.enabled).toBe(false);
  });
});

describe("mapAnimation", () => {
  const settings = {
    enabled: true,
    align: true,
    filters: true,
    motion: "topic",
    speed: "slow",
  };
  const byTopic = (d) => d.cluster;

  it("stages projection switches by topic at the chosen speed", () => {
    expect(
      mapAnimation(settings, { projectionChanged: true, stageOf: byTopic }),
    ).toEqual({ duration: 1200, stageOf: byTopic });
    expect(
      mapAnimation(
        { ...settings, motion: "all" },
        { projectionChanged: true, stageOf: byTopic },
      ).stageOf,
    ).toBeNull();
  });

  it("animates filter changes in one stage, only when asked", () => {
    expect(mapAnimation(settings, { stageOf: byTopic }).stageOf).toBeNull();
    expect(mapAnimation({ ...settings, filters: false }, {})).toBeNull();
    expect(
      mapAnimation(
        { ...settings, filters: false },
        { projectionChanged: true },
      ),
    ).not.toBeNull();
  });

  it("never animates when animation is off", () => {
    expect(
      mapAnimation(
        { ...settings, enabled: false },
        { projectionChanged: true },
      ),
    ).toBeNull();
  });
});
