// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  CONTROLS_SLACK,
  MAP_FIT_MIN_HEIGHT,
  MAP_MIN_HEIGHT,
  MAP_RESERVED_HEIGHT,
  SIDE_GAP,
  controlsHeight,
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

  // #142: the side column (controls + map) is sticky when both fit in the viewport
  it("shrinks the map so the controls fit above it, and says it fits", () => {
    const fixed = MAP_RESERVED_HEIGHT + SIDE_GAP + CONTROLS_SLACK;
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
    const fixed = MAP_RESERVED_HEIGHT + SIDE_GAP + CONTROLS_SLACK;
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

  it("leaves out the chips row and the status line: a region chip mid-drag must not resize the map (#143 review)", () => {
    const el = fakeControls(300, [
      { className: "chips", height: 28 },
      { className: "search-status", height: 20 },
    ]);
    expect(controlsHeight(el)).toBe(300 - (28 + 16 + 4) - (20 + 16 + 4));
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
