// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  MAP_FIT_MIN_HEIGHT,
  MAP_MIN_HEIGHT,
  MAP_RESERVED_HEIGHT,
  SIDE_GAP,
  controlsHeight,
  mapSize,
  watchStickySpace,
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

  // #140: the side column (controls + map) is sticky when both fit in the viewport
  it("shrinks the map so the controls fit above it, and says it fits", () => {
    const fixed = MAP_RESERVED_HEIGHT + SIDE_GAP;
    // plenty of room: the usual 620px map, controls and all
    expect(mapSize(900, { viewportHeight: 1400, controlsHeight: 200 })).toEqual(
      [880, 620, true],
    );
    // 1000px window, 260px of controls: the map gives up the difference
    expect(mapSize(900, { viewportHeight: 1000, controlsHeight: 260 })).toEqual(
      [880, 1000 - fixed - 260, true],
    );
  });

  it("keeps a usable map: below the minimum, the controls scroll away instead", () => {
    const fixed = MAP_RESERVED_HEIGHT + SIDE_GAP;
    const viewportHeight = MAP_FIT_MIN_HEIGHT + fixed + 199;
    expect(mapSize(900, { viewportHeight, controlsHeight: 200 })).toEqual([
      880,
      Math.min(620, viewportHeight - MAP_RESERVED_HEIGHT),
      false,
    ]);
    // a narrow map (450px from its width) needs only its own height
    expect(
      mapSize(600, { viewportHeight: 450 + fixed + 200, controlsHeight: 200 }),
    ).toEqual([580, 450, true]);
  });
});

/** Controls with in-flow panels; jsdom has no layout, so boxes are given. */
function fakeControls(height, panels = []) {
  const el = document.createElement("section");
  el.getBoundingClientRect = () => ({ height });
  const row = document.createElement("div");
  row.style.rowGap = "16px";
  el.append(row);
  for (const { className, height: h, hidden = false } of panels) {
    // like My research and Watch: the panel's own wrapper has no box
    const wrapper = document.createElement("div");
    wrapper.style.display = "contents";
    const panel = document.createElement("div");
    panel.className = className;
    panel.hidden = hidden;
    panel.style.marginTop = "4px";
    panel.getBoundingClientRect = () => ({ height: hidden ? 0 : h });
    wrapper.append(panel);
    row.append(wrapper);
  }
  return el;
}

describe("controlsHeight", () => {
  it("leaves out open transient panels (and the row gap and margins around them)", () => {
    const el = fakeControls(400, [
      { className: "my-research-panel", height: 150 },
      { className: "topic-watch-panel", height: 90, hidden: true },
    ]);
    expect(controlsHeight(el)).toBe(400 - 150 - 16 - 4);
  });
});

describe("watchStickySpace", () => {
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
  const fakeObserver = () => {
    const observers = [];
    class RO {
      constructor(callback) {
        this.callback = callback;
        this.observed = [];
        observers.push(this);
      }
      observe(el) {
        this.observed.push(el);
      }
      disconnect() {
        this.observed = [];
      }
    }
    return { RO, fire: () => observers.forEach((o) => o.callback()) };
  };

  it("reports viewport and controls heights on two columns, only on real changes", () => {
    const win = fakeWindow(false);
    const { RO, fire } = fakeObserver();
    let h = 200;
    const seen = [];
    const stop = watchStickySpace((v) => seen.push(v), {
      query: "q",
      win,
      ResizeObserver: RO,
      measure: () => h,
    });
    win.resize(); // nothing changed: no redraw
    h = 205; // under 8px: not worth a redraw
    fire();
    h = 240;
    fire();
    win.innerHeight = 700;
    win.resize();
    expect(seen).toEqual([
      { viewportHeight: 900, controlsHeight: 200 },
      { viewportHeight: 900, controlsHeight: 240 },
      { viewportHeight: 700, controlsHeight: 240 },
    ]);
    stop();
    expect(win.listeners.size).toBe(0);
  });

  it("is null on stacked layouts, whatever the toolbar or the controls do", () => {
    const win = fakeWindow(true);
    const { RO, fire } = fakeObserver();
    let h = 200;
    const seen = [];
    watchStickySpace((v) => seen.push(v), {
      query: "q",
      win,
      ResizeObserver: RO,
      measure: () => h,
    });
    win.innerHeight = 640;
    win.resize();
    h = 400;
    fire();
    expect(seen).toEqual([null]);
    win.query.matches = false; // widened to desktop
    win.resize();
    expect(seen).toEqual([null, { viewportHeight: 640, controlsHeight: 400 }]);
  });
});
