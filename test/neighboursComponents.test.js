// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  neighboursControl,
  neighboursPanel,
} from "../src/components/neighbours.js";
import { createNeighbourSettings } from "../src/lib/neighbours.js";

const memoryStorage = () => {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => (data[k] = String(v)),
  };
};

describe("neighboursControl", () => {
  it("shows and changes the toggle and k", () => {
    const store = createNeighbourSettings({ storage: memoryStorage() });
    const el = neighboursControl(store);
    document.body.append(el);
    const toggle = el.querySelector("[data-setting=neighbours]");
    expect(el.textContent).toContain("Nearest neighbours on hover");
    expect(toggle.checked).toBe(true);
    const pressed = () =>
      [...el.querySelectorAll("button[aria-pressed=true]")].map(
        (b) => b.textContent,
      );
    expect(pressed()).toEqual(["10"]);
    el.querySelector("button[data-value='15']").click();
    expect(store.value.k).toBe(15);
    expect(pressed()).toEqual(["15"]);
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    expect(store.value.enabled).toBe(false);
    el.remove();
  });

  it("dispose stops following the store (no listener left per re-render)", () => {
    const store = createNeighbourSettings({ storage: memoryStorage() });
    const el = neighboursControl(store);
    el.dispose();
    store.set({ k: 15 });
    expect(
      el.querySelector("button[data-value='15']").getAttribute("aria-pressed"),
    ).toBe("false");
  });
});

describe("neighboursPanel", () => {
  const papers = new Map(
    ["a", "b", "c"].map((id) => [id, { id, title: `Paper ${id}` }]),
  );
  const setup = () => {
    const opened = [];
    let closed = 0;
    const el = neighboursPanel({
      paperOf: (id) => papers.get(id),
      href: (p) => `?paper=${p.id}`,
      onOpen: (p) => opened.push(p.id),
      onClose: () => closed++,
    });
    document.body.append(el);
    return { el, opened, closed: () => closed };
  };

  it("is hidden until a paper is pinned", () => {
    const { el } = setup();
    expect(el.hidden).toBe(true);
    el.show({ pinned: null, neighbours: [] });
    expect(el.hidden).toBe(true);
    el.remove();
  });

  it("lists the neighbours with similarity and map rank; titles open details; ✕ unpins", () => {
    const { el, opened, closed } = setup();
    el.show({
      pinned: "a",
      k: 10,
      reach: 30,
      neighbours: [
        { id: "b", similarity: 0.82, mapRank: 2, missing: false },
        { id: "c", similarity: 0.71, mapRank: 87, missing: true },
      ],
    });
    expect(el.hidden).toBe(false);
    expect(el.textContent).toContain("Nearest neighbours of");
    expect(el.textContent).toContain("Paper a");
    expect(el.textContent.replace(/\s+/g, " ")).toContain(
      "1 of 2 close on the map (within its 30 nearest)",
    );
    const items = [...el.querySelectorAll("li")];
    expect(
      items.map((li) => li.textContent.replace(/\s+/g, " ").trim()),
    ).toEqual([
      "Paper b 82% similar · map #2",
      "Paper c 71% similar · map #87 (far)",
    ]);
    expect(items[1].classList.contains("missing")).toBe(true);
    items[1].querySelector("a").click();
    expect(opened).toEqual(["c"]);
    el.querySelector(".neighbours-close").click();
    expect(closed()).toBe(1);
    el.remove();
  });
});

describe("neighboursPanel, floating over the sticky map (desktop, #114)", () => {
  const papers = new Map(
    Array.from({ length: 12 }, (_, i) => [
      `p${i}`,
      { id: `p${i}`, title: `Paper ${i}` },
    ]),
  );
  const state = (pinned = "p0", k = 10) => ({
    pinned,
    k,
    reach: 30,
    neighbours: Array.from({ length: k }, (_, i) => ({
      id: `p${i + 1}`,
      similarity: 0.8 - i / 100,
      mapRank: i + 2,
      missing: false,
    })),
  });
  const fakeMedia = (matches) => {
    const listeners = new Set();
    return {
      matches,
      addEventListener: (type, f) => listeners.add(f),
      removeEventListener: (type, f) => listeners.delete(f),
      set(value) {
        this.matches = value;
        for (const f of listeners) f();
      },
    };
  };
  const setup = (floating) => {
    const media = fakeMedia(floating);
    const el = neighboursPanel({
      paperOf: (id) => papers.get(id),
      href: (p) => `?paper=${p.id}`,
      onOpen: () => {},
      onClose: () => {},
      floating: media,
    });
    document.body.append(el);
    return { el, media };
  };
  const shown = (el) => el.querySelectorAll(".neighbours-list li").length;
  const button = (el, text) =>
    [...el.querySelectorAll("button")].find((b) =>
      b.textContent.includes(text),
    );

  it("shows the top 5 and 'Show all 10' expands the list", () => {
    const { el } = setup(true);
    el.show(state());
    expect(el.classList.contains("is-floating")).toBe(true);
    expect(shown(el)).toBe(5);
    button(el, "Show all 10").click();
    expect(shown(el)).toBe(10);
    // a redraw with the same pin keeps it expanded; a new pin starts at 5 again
    el.show(state());
    expect(shown(el)).toBe(10);
    el.show(state("p3"));
    expect(shown(el)).toBe(5);
    el.remove();
  });

  it("collapses to its header and back, and stays collapsed across pins", () => {
    const { el } = setup(true);
    el.show(state());
    const toggle = el.querySelector(".neighbours-collapse");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    toggle.click();
    expect(shown(el)).toBe(0);
    expect(el.querySelector(".neighbours-close")).not.toBeNull();
    expect(
      el.querySelector(".neighbours-collapse").getAttribute("aria-expanded"),
    ).toBe("false");
    el.show(state("p4"));
    expect(shown(el)).toBe(0);
    el.querySelector(".neighbours-collapse").click();
    expect(shown(el)).toBe(5);
    el.remove();
  });

  it("stacked layouts keep the full list under the map, without the toggle", () => {
    const { el, media } = setup(false);
    el.show(state());
    expect(el.classList.contains("is-floating")).toBe(false);
    expect(shown(el)).toBe(10);
    expect(el.querySelector(".neighbours-collapse")).toBeNull();
    expect(button(el, "Show all")).toBeUndefined();
    media.set(true); // widened past 1024px: redrawn as the floating card
    expect(el.classList.contains("is-floating")).toBe(true);
    expect(shown(el)).toBe(5);
    el.remove();
  });
});
