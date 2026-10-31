// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { rowAtLine, trackListFocus } from "../src/lib/listFocus.js";

describe("rowAtLine", () => {
  const rows = [
    { id: "a", top: 0, bottom: 100 },
    { id: "b", top: 110, bottom: 200 },
    { id: "c", top: 200, bottom: 300 },
  ];
  it("picks the row crossing the reading line", () => {
    expect(rowAtLine(rows, 50)).toBe("a");
    expect(rowAtLine(rows, 200)).toBe("c");
  });
  it("in a gap between rows, the next row down", () => {
    expect(rowAtLine(rows, 105)).toBe("b");
  });
  it("nothing when the line is above or below the whole list", () => {
    expect(rowAtLine(rows, -10)).toBe(null);
    expect(rowAtLine(rows, 301)).toBe(null);
    expect(rowAtLine([], 10)).toBe(null);
  });
});

/** A list whose rows report fixed boxes (jsdom has no layout), shifted by `scroll`. */
function fakeList(ids, height = 100) {
  const list = document.createElement("div");
  let scroll = 0;
  for (const [i, id] of ids.entries()) {
    const row = document.createElement("div");
    row.className = "paper";
    row.dataset.paperId = id;
    row.getBoundingClientRect = () => ({
      top: i * height - scroll,
      bottom: (i + 1) * height - scroll,
    });
    list.append(row);
  }
  document.body.append(list);
  return { list, scrollTo: (y) => (scroll = y) };
}

const frame = (cb) => cb();

describe("trackListFocus", () => {
  it("reports the row at the reading line as the page scrolls, once per change", () => {
    const { list, scrollTo } = fakeList(["a", "b", "c", "d"]);
    const onFocus = vi.fn();
    const stop = trackListFocus(list, onFocus, {
      line: 0.5,
      viewportHeight: () => 200,
      frame,
    });
    expect(onFocus).not.toHaveBeenCalled(); // nothing until the reader scrolls
    window.dispatchEvent(new Event("scroll"));
    expect(onFocus).toHaveBeenLastCalledWith("b"); // line at y = 100
    window.dispatchEvent(new Event("scroll"));
    expect(onFocus).toHaveBeenCalledTimes(1);
    scrollTo(150);
    window.dispatchEvent(new Event("scroll"));
    expect(onFocus).toHaveBeenLastCalledWith("c");
    stop();
    scrollTo(0);
    window.dispatchEvent(new Event("scroll"));
    expect(onFocus).toHaveBeenLastCalledWith("c");
    list.remove();
  });

  it("a hovered or keyboard-focused row wins over the scroll position", () => {
    const { list } = fakeList(["a", "b", "c"]);
    const onFocus = vi.fn();
    const stop = trackListFocus(list, onFocus, {
      line: 0.5,
      viewportHeight: () => 200,
      frame,
    });
    const [, , c] = list.children;
    c.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    expect(onFocus).toHaveBeenLastCalledWith("c");
    window.dispatchEvent(new Event("scroll"));
    expect(onFocus).toHaveBeenLastCalledWith("c");
    // leaving the list goes back to the row at the reading line
    list.dispatchEvent(new MouseEvent("pointerleave"));
    expect(onFocus).toHaveBeenLastCalledWith("b");
    list.children[0].dispatchEvent(
      new FocusEvent("focusin", { bubbles: true }),
    );
    expect(onFocus).toHaveBeenLastCalledWith("a");
    stop();
    list.remove();
  });

  it("stays quiet (and clears) while disabled, e.g. stacked layouts where the map scrolls away", () => {
    const { list } = fakeList(["a", "b"]);
    const onFocus = vi.fn();
    let enabled = true;
    const stop = trackListFocus(list, onFocus, {
      line: 0.5,
      viewportHeight: () => 200,
      frame,
      enabled: () => enabled,
    });
    window.dispatchEvent(new Event("scroll"));
    expect(onFocus).toHaveBeenLastCalledWith("b");
    enabled = false;
    window.dispatchEvent(new Event("scroll"));
    expect(onFocus).toHaveBeenLastCalledWith(null);
    list.children[0].dispatchEvent(
      new MouseEvent("pointerover", { bubbles: true }),
    );
    expect(onFocus).toHaveBeenCalledTimes(2);
    stop();
    list.remove();
  });
});
