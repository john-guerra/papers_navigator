// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { arrangeMyPapers } from "../src/components/myPapersLayout.js";

const names = (el) =>
  [...el.children].map((c) => c.className.replace("mp-", ""));

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

let layout;
beforeEach(() => {
  // the page's markup: every section in the main column, in the stacked order
  document.body.innerHTML = `<div class="my-papers-layout">
    <div class="mp-main">
      <div class="mp-view"><button id="view">Now / Next</button></div>
      <div class="mp-tools"><button id="share">Share list</button></div>
      <div class="mp-schedule"></div>
      <div class="mp-watching"></div>
      <div class="mp-recommended"></div>
      <div class="mp-list"></div>
    </div>
    <div class="mp-side"></div>
  </div>`;
  layout = document.querySelector(".my-papers-layout");
});

describe("arrangeMyPapers (DESIGN.md → Layout, My Papers desktop)", () => {
  it("puts tools, Watching and Recommended in the side column on desktop", () => {
    const { win } = fakeMedia(false);
    arrangeMyPapers(layout, { win });
    expect(names(layout.querySelector(".mp-main"))).toEqual([
      "view",
      "schedule",
      "list",
    ]);
    expect(names(layout.querySelector(".mp-side"))).toEqual([
      "tools",
      "watching",
      "recommended",
    ]);
    expect(layout.classList.contains("has-side")).toBe(true);
  });

  it("keeps one column in the usual order when stacked", () => {
    const { win } = fakeMedia(true);
    arrangeMyPapers(layout, { win });
    expect(names(layout.querySelector(".mp-main"))).toEqual([
      "view",
      "tools",
      "schedule",
      "watching",
      "recommended",
      "list",
    ]);
    expect(layout.querySelector(".mp-side").childElementCount).toBe(0);
    expect(layout.classList.contains("has-side")).toBe(false);
  });

  it("rearranges when the layout crosses the breakpoint, keeping focus", () => {
    const { media, win } = fakeMedia(false);
    const stop = arrangeMyPapers(layout, { win });
    document.getElementById("share").focus();
    media.set(true);
    expect(names(layout.querySelector(".mp-main"))[1]).toBe("tools");
    expect(document.activeElement.id).toBe("share");
    media.set(false);
    expect(names(layout.querySelector(".mp-side"))[0]).toBe("tools");
    expect(document.activeElement.id).toBe("share");
    stop();
    expect(media.listeners.size).toBe(0);
  });
});
