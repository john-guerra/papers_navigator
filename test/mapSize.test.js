import { describe, expect, it } from "vitest";
import {
  MAP_MIN_HEIGHT,
  MAP_RESERVED_HEIGHT,
  mapSize,
  watchStickyViewport,
} from "../src/lib/mapSize.js";

describe("mapSize", () => {
  it("keeps the old width-based size when the map isn't sticky", () => {
    expect(mapSize(900)).toEqual([880, 620]);
    expect(mapSize(400)).toEqual([380, 320]);
    expect(mapSize(600)).toEqual([580, 450]);
  });

  it("fits the sticky map in the viewport", () => {
    expect(mapSize(900, { viewportHeight: 1000 })).toEqual([880, 620]);
    expect(mapSize(900, { viewportHeight: 700 })).toEqual([
      880,
      700 - MAP_RESERVED_HEIGHT,
    ]);
    // never smaller than a usable map, even in a very short window
    expect(mapSize(900, { viewportHeight: 300 })).toEqual([
      880,
      MAP_MIN_HEIGHT,
    ]);
  });
});

describe("watchStickyViewport", () => {
  const fakeWindow = (stacked) => {
    const listeners = new Set();
    const query = { matches: stacked };
    return {
      query,
      innerHeight: 900,
      matchMedia: () => query,
      addEventListener: (type, f) => listeners.add(f),
      removeEventListener: (type, f) => listeners.delete(f),
      resize() {
        for (const f of listeners) f();
      },
      listeners,
    };
  };

  it("reports the height on the two-column layout, only when it changes", () => {
    const win = fakeWindow(false);
    const seen = [];
    const stop = watchStickyViewport((v) => seen.push(v), { query: "q", win });
    win.resize(); // same height: no redraw
    win.innerHeight = 700;
    win.resize();
    expect(seen).toEqual([900, 700]);
    stop();
    expect(win.listeners.size).toBe(0);
  });

  it("is null on stacked layouts, whatever the toolbar does to innerHeight", () => {
    const win = fakeWindow(true);
    const seen = [];
    watchStickyViewport((v) => seen.push(v), { query: "q", win });
    win.innerHeight = 640;
    win.resize();
    expect(seen).toEqual([null]);
    win.query.matches = false; // widened to desktop
    win.resize();
    expect(seen).toEqual([null, 640]);
  });
});
