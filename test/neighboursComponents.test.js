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
      neighbours: [
        { id: "b", similarity: 0.82, mapRank: 2, missing: false },
        { id: "c", similarity: 0.71, mapRank: 87, missing: true },
      ],
    });
    expect(el.hidden).toBe(false);
    expect(el.textContent).toContain("Nearest neighbours of");
    expect(el.textContent).toContain("Paper a");
    expect(el.textContent).toContain("1 of 2 also among its 10 nearest");
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
