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
  {
    name: "watching",
    count: (el) => el.querySelectorAll(".watching-rule").length,
    unit: ["watch", "watches"],
  },
  {
    name: "recommended",
    // the page's own count; empty while loading or after an error
    count: (el) => {
      const value = el.querySelector("[data-count]")?.dataset.count;
      return value ? Number(value) : null;
    },
    unit: ["paper", "papers"],
  },
];

const toggle = (name) => document.querySelector(`.mp-${name} h2 button`);
const flush = () => new Promise((resolve) => setTimeout(resolve));

let layout;
beforeEach(() => {
  delete document.documentElement.dataset.openSections;
  // Watching's heading is inside its re-rendered component; Recommended's is the page's own
  document.body.innerHTML = `<div class="my-papers-layout">
    <div class="mp-watching"><span><section class="watching"><h2>Watching</h2>
      <ul><li class="watching-rule">A</li><li class="watching-rule">B</li></ul></section></span></div>
    <div class="mp-recommended"><h2 id="rec">Recommended papers</h2>
      <div data-count="12"><ol><li class="recommended-paper">1</li></ol></div></div>
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
    }
    expect(toggle("watching").textContent).toMatch(/Watching\s*2/);
    expect(toggle("recommended").textContent).toMatch(
      /Recommended papers\s*12/,
    );
    // the heading stays a heading with its id
    expect(document.getElementById("rec").tagName).toBe("H2");
    expect(document.querySelector(".mp-list h2 button")).toBeNull();
  });

  it("writes the remembered state on <html>, where style.css folds by it", () => {
    const { win } = fakeMedia(false);
    const storage = memoryStorage({ [OPEN_SECTIONS_KEY]: '["watching"]' });
    collapsibleSections(layout, { sections: SECTIONS, win, storage });
    expect(document.documentElement.dataset.openSections).toBe("watching");
  });

  it("a click opens the section and remembers it on this device", () => {
    const { win } = fakeMedia(true);
    const storage = memoryStorage();
    collapsibleSections(layout, { sections: SECTIONS, win, storage });
    toggle("recommended").click();
    expect(toggle("recommended").getAttribute("aria-expanded")).toBe("true");
    // the state style.css folds by, on <html> like the head script writes it (#162)
    expect(document.documentElement.dataset.openSections).toBe("recommended");
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
    media.set(true);
    expect(toggle("watching").getAttribute("aria-expanded")).toBe("false");
    media.set(false);
    expect(toggle("watching")).toBeNull();
    expect(layout.querySelector(".mp-watching h2").textContent).toBe(
      "Watching",
    );
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
    layout.querySelector("[data-count]").dataset.count = "3";
    await flush();
    expect(toggle("recommended").textContent).toMatch(/Recommended papers\s*3/);
    // loading or failed: no number (not a misleading 0)
    layout.querySelector("[data-count]").dataset.count = "";
    await flush();
    expect(
      toggle("recommended").querySelector(".section-count").textContent,
    ).toBe("");
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
    expect(toggle("recommended").textContent).toMatch(
      /Recommended papers\s*12/,
    );
    media.set(false);
    expect(heading.innerHTML).toBe(
      `<a class="observablehq-header-anchor" href="#rec">Recommended papers</a>`,
    );
  });

  it("screen readers hear the count with its unit, not a bare number", () => {
    const { win } = fakeMedia(true);
    collapsibleSections(layout, {
      sections: SECTIONS,
      win,
      storage: memoryStorage(),
    });
    const count = toggle("watching").querySelector(".section-count");
    expect(count.querySelector('[aria-hidden="true"]').textContent).toBe("2");
    expect(count.querySelector(".sr-only").textContent).toBe(" (2 watches)");
  });

  it("keeps focus on the heading when the focused toggle goes away at the breakpoint", () => {
    const { media, win } = fakeMedia(true);
    collapsibleSections(layout, {
      sections: SECTIONS,
      win,
      storage: memoryStorage(),
    });
    toggle("watching").focus();
    media.set(false);
    expect(document.activeElement).toBe(
      layout.querySelector(".mp-watching h2"),
    );
    media.set(true);
    toggle("recommended").focus();
    media.set(false);
    expect(document.activeElement).toBe(document.getElementById("rec"));
  });

  it("a section without `count` shows no number", () => {
    const { win } = fakeMedia(true);
    collapsibleSections(layout, {
      sections: [{ name: "recommended" }],
      win,
      storage: memoryStorage(),
    });
    expect(
      toggle("recommended").querySelector(".section-count").textContent,
    ).toBe("");
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
    expect(media.listeners.size).toBe(0);
    // without buttons nothing could open them again: unfold all
    expect(document.documentElement.dataset.openSections).toBe(
      "watching recommended",
    );
  });
});
