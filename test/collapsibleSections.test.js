// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  OPEN_SECTIONS_KEY,
  collapsibleSections,
} from "../src/components/collapsibleSections.js";

/** A matchMedia stand-in whose `matches` the test flips. */
function fakeMedia(matches) {
  const listeners = new Set();
  const media = {
    matches,
    addEventListener: (type, f) => listeners.add(f),
    removeEventListener: (type, f) => listeners.delete(f),
    set(value) {
      media.matches = value;
      for (const f of listeners) f();
    },
    listeners,
  };
  return { media, win: { matchMedia: () => media } };
}

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    data,
  };
}

const SECTIONS = [
  { name: "watching", count: ".watching-rule" },
  { name: "recommended", count: ".recommended-paper" },
];

const toggle = (name) => document.querySelector(`.mp-${name} h2 button`);
const flush = () => new Promise((resolve) => setTimeout(resolve));

let layout;
beforeEach(() => {
  // Watching's heading is inside its re-rendered component; Recommended's is the page's own
  document.body.innerHTML = `<div class="my-papers-layout">
    <div class="mp-watching"><span><section class="watching"><h2>Watching</h2>
      <ul><li class="watching-rule">A</li><li class="watching-rule">B</li></ul></section></span></div>
    <div class="mp-recommended"><h2 id="rec">Recommended papers</h2>
      <div><ol><li class="recommended-paper">1</li></ol></div></div>
    <div class="mp-list"><h2>All my papers</h2></div>
  </div>`;
  layout = document.querySelector(".my-papers-layout");
});

describe("collapsibleSections (#160, My Papers in one column)", () => {
  it("stacked: headings become collapsed disclosure buttons with a count", () => {
    const { win } = fakeMedia(true);
    collapsibleSections(layout, {
      sections: SECTIONS,
      win,
      storage: memoryStorage(),
    });
    for (const name of ["watching", "recommended"]) {
      const button = toggle(name);
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(layout.querySelector(`.mp-${name}`).classList).toContain(
        "is-collapsed",
      );
    }
    expect(toggle("watching").textContent).toMatch(/Watching\s*2/);
    expect(toggle("recommended").textContent).toMatch(/Recommended papers\s*1/);
    // the heading stays a heading with its id
    expect(document.getElementById("rec").tagName).toBe("H2");
    expect(document.querySelector(".mp-list h2 button")).toBeNull();
  });

  it("a click opens the section and remembers it on this device", () => {
    const { win } = fakeMedia(true);
    const storage = memoryStorage();
    collapsibleSections(layout, { sections: SECTIONS, win, storage });
    toggle("recommended").click();
    expect(toggle("recommended").getAttribute("aria-expanded")).toBe("true");
    expect(layout.querySelector(".mp-recommended").classList).not.toContain(
      "is-collapsed",
    );
    expect(JSON.parse(storage.getItem(OPEN_SECTIONS_KEY))).toEqual([
      "recommended",
    ]);
    toggle("recommended").click();
    expect(JSON.parse(storage.getItem(OPEN_SECTIONS_KEY))).toEqual([]);
  });

  it("starts open where the device remembers it open", () => {
    const { win } = fakeMedia(true);
    const storage = memoryStorage({ [OPEN_SECTIONS_KEY]: '["watching"]' });
    collapsibleSections(layout, { sections: SECTIONS, win, storage });
    expect(toggle("watching").getAttribute("aria-expanded")).toBe("true");
    expect(toggle("recommended").getAttribute("aria-expanded")).toBe("false");
  });

  it("survives unreadable or broken storage", () => {
    const { win } = fakeMedia(true);
    const broken = {
      getItem: () => "not json",
      setItem: () => {
        throw new Error("quota");
      },
    };
    collapsibleSections(layout, { sections: SECTIONS, win, storage: broken });
    expect(() => toggle("watching").click()).not.toThrow();
    expect(toggle("watching").getAttribute("aria-expanded")).toBe("true");
  });

  it("desktop: no toggles, nothing collapsed; crossing the breakpoint adds and removes them", () => {
    const { media, win } = fakeMedia(false);
    collapsibleSections(layout, {
      sections: SECTIONS,
      win,
      storage: memoryStorage(),
    });
    expect(toggle("watching")).toBeNull();
    expect(layout.querySelector(".is-collapsed")).toBeNull();
    media.set(true);
    expect(toggle("watching").getAttribute("aria-expanded")).toBe("false");
    media.set(false);
    expect(toggle("watching")).toBeNull();
    expect(layout.querySelector(".mp-watching h2").textContent).toBe(
      "Watching",
    );
    expect(layout.querySelector(".is-collapsed")).toBeNull();
  });

  it("a re-rendered section gets its toggle back, keeps its state and updates the count", async () => {
    const { win } = fakeMedia(true);
    collapsibleSections(layout, {
      sections: SECTIONS,
      win,
      storage: memoryStorage(),
    });
    toggle("watching").click();
    layout.querySelector(".mp-watching span").innerHTML =
      `<section class="watching">
      <h2>Watching</h2><ul><li class="watching-rule">A</li></ul></section>`;
    await flush();
    expect(toggle("watching").getAttribute("aria-expanded")).toBe("true");
    expect(toggle("watching").textContent).toMatch(/Watching\s*1/);
    layout.querySelector(".mp-recommended ol").innerHTML =
      `<li class="recommended-paper">1</li><li class="recommended-paper">2</li><li class="recommended-paper">3</li>`;
    await flush();
    expect(toggle("recommended").textContent).toMatch(/Recommended papers\s*3/);
  });

  it("takes Framework's heading anchor out of the button (no link inside a button), back on desktop", () => {
    const { media, win } = fakeMedia(true);
    const heading = document.getElementById("rec");
    heading.innerHTML = `<a class="observablehq-header-anchor" href="#rec">Recommended papers</a>`;
    collapsibleSections(layout, {
      sections: SECTIONS,
      win,
      storage: memoryStorage(),
    });
    expect(heading.querySelector("a")).toBeNull();
    expect(toggle("recommended").textContent).toMatch(/Recommended papers\s*1/);
    media.set(false);
    expect(heading.innerHTML).toBe(
      `<a class="observablehq-header-anchor" href="#rec">Recommended papers</a>`,
    );
  });

  it("stop() removes the toggles and listeners", () => {
    const { media, win } = fakeMedia(true);
    const stop = collapsibleSections(layout, {
      sections: SECTIONS,
      win,
      storage: memoryStorage(),
    });
    stop();
    expect(toggle("watching")).toBeNull();
    expect(layout.querySelector(".is-collapsed")).toBeNull();
    expect(media.listeners.size).toBe(0);
  });
});
