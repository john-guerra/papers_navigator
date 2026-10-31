// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { listTopScroll, stickyListHeader } from "../src/lib/stickyList.js";
import { renderAddBar } from "../src/components/addBar.js";

describe("listTopScroll", () => {
  it("puts the list's top just under the sticky offset", () => {
    // list 300px above the viewport's top, page scrolled to 1200: the list starts at 900
    expect(listTopScroll({ scrollY: 1200, listTop: -300, offset: 56 })).toBe(
      900 - 56,
    );
  });
  it("never scrolls above the page's top", () => {
    expect(listTopScroll({ scrollY: 10, listTop: 20, offset: 56 })).toBe(0);
  });
});

/** A fake window: scroll position, reduced-motion preference, listeners. */
function fakeWindow({ reduced = false } = {}) {
  const listeners = new Map();
  return {
    scrollY: 0,
    scrolls: [],
    matchMedia: (q) => ({ matches: q.includes("reduce") && reduced }),
    addEventListener: (type, f) => listeners.set(`${type}`, f),
    removeEventListener: (type) => listeners.delete(type),
    scrollTo(options) {
      this.scrolls.push(options);
    },
    fire(type) {
      listeners.get(type)?.();
    },
    listeners,
  };
}

function fakeListWithBar({ listTop = 100, barHeight = 48 } = {}) {
  const list = document.createElement("section");
  list.className = "explore-list";
  const state = { listTop, barHeight };
  list.getBoundingClientRect = () => ({ top: state.listTop });
  const bar = renderAddBar({ total: 12, fresh: [{ id: "a" }], already: 0 });
  list.append(bar);
  list.querySelector(".add-bar").getBoundingClientRect = () => ({
    height: state.barHeight,
  });
  document.body.append(list);
  return { list, state };
}

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.style.removeProperty("--list-header-height");
});

describe("stickyListHeader", () => {
  const start = (list, win, options = {}) =>
    stickyListHeader(list, {
      win,
      offset: () => 56,
      frame: (cb) => cb(),
      ResizeObserver: null,
      ...options,
    });

  it("marks the list as scrolled once its top passes under the sticky header", () => {
    const { list, state } = fakeListWithBar();
    const win = fakeWindow();
    const header = start(list, win);
    expect(list.classList.contains("is-scrolled")).toBe(false);
    state.listTop = 40;
    win.fire("scroll");
    expect(list.classList.contains("is-scrolled")).toBe(true);
    state.listTop = 55.6; // back at the top, give or take sub-pixel layout
    win.fire("scroll");
    expect(list.classList.contains("is-scrolled")).toBe(false);
    header.stop();
    expect(win.listeners.size).toBe(0);
  });

  it("publishes the header's height for scroll-padding, again after the bar re-renders", () => {
    const { list, state } = fakeListWithBar({ barHeight: 47.6 });
    const header = start(list, fakeWindow());
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--list-header-height")).toBe("48px");
    state.barHeight = 92;
    header.refresh();
    expect(root.style.getPropertyValue("--list-header-height")).toBe("92px");
    header.stop();
    expect(root.style.getPropertyValue("--list-header-height")).toBe("");
  });

  it("scrolls back to the list's top (smoothly) and moves focus to its heading", () => {
    const { list, state } = fakeListWithBar();
    const win = fakeWindow();
    win.scrollY = 2000;
    state.listTop = -500;
    const header = start(list, win);
    header.scrollToTop();
    expect(win.scrolls).toEqual([{ top: 1500 - 56, behavior: "smooth" }]);
    const heading = list.querySelector(".add-bar-title");
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute("tabindex")).toBe("-1");
  });

  it("jumps instantly when the reader prefers reduced motion", () => {
    const { list } = fakeListWithBar();
    const win = fakeWindow({ reduced: true });
    win.scrollY = 800;
    start(list, win).scrollToTop();
    expect(win.scrolls[0].behavior).toBe("instant");
  });
});

describe("renderAddBar list header (#142)", () => {
  it("has a ↑ Top button and a clickable title that both go back to the top", () => {
    const onTop = vi.fn();
    const el = renderAddBar(
      { total: 220, fresh: [{ id: "a" }], already: 3 },
      { onAdd: () => {}, onTop },
    );
    // the Add button stays the first button
    expect(el.querySelector("button").textContent).toContain("Add 1");
    const top = el.querySelector(".add-bar-top");
    expect(top.textContent).toContain("Top");
    expect(top.getAttribute("aria-label")).toBe("Back to the top of the list");
    top.click();
    el.querySelector(".add-bar-title").click();
    expect(onTop).toHaveBeenCalledTimes(2);
  });

  it("carries a short label for phones and keeps the notes out of the sticky bar", () => {
    const el = renderAddBar(
      { total: 1, fresh: [{ id: "a" }], already: 3 },
      { onAdd: () => {} },
    );
    expect(el.querySelector(".add-bar-short").textContent).toBe("1 paper");
    expect(el.querySelector(".add-bar .add-bar-note")).toBe(null);
    expect(el.querySelector(".add-bar-notes").textContent).toContain(
      "3 already there",
    );
  });
});
