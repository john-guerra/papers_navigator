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

const scroll = () => window.dispatchEvent(new Event("scroll"));
const wheel = () => window.dispatchEvent(new Event("wheel"));
const move = (el, x = 10, y = 10) =>
  el.dispatchEvent(
    new MouseEvent("pointermove", { bubbles: true, clientX: x, clientY: y }),
  );
const track = (list, onFocus, options = {}) =>
  trackListFocus(list, onFocus, {
    line: 0.5,
    viewportHeight: () => 200,
    frame,
    ...options,
  });

describe("trackListFocus", () => {
  it("reports the row at the reading line as the page scrolls, once per change", () => {
    const { list, scrollTo } = fakeList(["a", "b", "c", "d"]);
    const onFocus = vi.fn();
    const tracker = track(list, onFocus);
    expect(onFocus).not.toHaveBeenCalled(); // nothing until the reader scrolls
    scroll();
    expect(onFocus.mock.lastCall[0]).toBe("b"); // line at y = 100
    scroll();
    expect(onFocus).toHaveBeenCalledTimes(1);
    scrollTo(150);
    scroll();
    expect(onFocus.mock.lastCall[0]).toBe("c");
    tracker.stop();
    scrollTo(0);
    scroll();
    expect(onFocus.mock.lastCall[0]).toBe("c");
    list.remove();
  });

  it("a row the pointer moves over holds until a wheel scroll or leaving the list", () => {
    const { list, scrollTo } = fakeList(["a", "b", "c", "d"]);
    const onFocus = vi.fn();
    const tracker = track(list, onFocus);
    move(list.children[2]);
    expect(onFocus.mock.lastCall).toEqual(["c", "pointer"]);
    scroll(); // a scroll the page made: still c
    expect(onFocus.mock.lastCall[0]).toBe("c");
    // the reader scrolls with the wheel, the pointer resting over the list: the line wins and
    // boundary events at the same pointer position don't take it back
    wheel();
    scrollTo(150);
    scroll();
    expect(onFocus.mock.lastCall[0]).toBe("c");
    scrollTo(250);
    scroll();
    expect(onFocus.mock.lastCall[0]).toBe("d");
    move(list.children[1]); // same coordinates as before: not a move
    expect(onFocus.mock.lastCall[0]).toBe("d");
    move(list.children[1], 20, 30);
    expect(onFocus.mock.lastCall[0]).toBe("b");
    list.dispatchEvent(new MouseEvent("pointerleave"));
    // same paper, but now from the reading line: reported again so neighbours can clear
    expect(onFocus.mock.lastCall).toEqual(["d", "line"]);
    tracker.stop();
    list.remove();
  });

  it("keyboard focus holds through the scroll that brings the row into view (#136 review)", () => {
    const { list, scrollTo } = fakeList(["a", "b", "c", "d"]);
    const onFocus = vi.fn();
    const tracker = track(list, onFocus);
    list.children[3].dispatchEvent(
      new FocusEvent("focusin", { bubbles: true }),
    );
    expect(onFocus.mock.lastCall[0]).toBe("d");
    scrollTo(250);
    scroll();
    expect(onFocus.mock.lastCall[0]).toBe("d");
    // focus leaving the list gives the line back
    scrollTo(0);
    list.children[3].dispatchEvent(
      new FocusEvent("focusout", {
        bubbles: true,
        relatedTarget: document.body,
      }),
    );
    expect(onFocus.mock.lastCall[0]).toBe("b");
    tracker.stop();
    list.remove();
  });

  it("hold() keeps a pinned map paper through the scroll to it; refresh() re-reports for new rows", () => {
    const { list, scrollTo } = fakeList(["a", "b", "c", "d"]);
    const onFocus = vi.fn();
    const tracker = track(list, onFocus);
    tracker.hold("d");
    expect(onFocus.mock.lastCall).toEqual(["d", "pin"]);
    scrollTo(160);
    scroll();
    expect(onFocus.mock.lastCall[0]).toBe("d");
    const calls = onFocus.mock.calls.length;
    tracker.refresh();
    expect(onFocus).toHaveBeenCalledTimes(calls + 1); // same id, re-reported for the new rows
    expect(onFocus.mock.lastCall[0]).toBe("d");
    // the held paper left the list (e.g. Strong): the line takes over
    list.children[3].remove();
    tracker.refresh();
    expect(onFocus.mock.lastCall[0]).toBe("c");
    tracker.stop();
    list.remove();
  });

  it("re-reports the same paper when only the reason changes (pointer → reading line)", () => {
    const { list } = fakeList(["a", "b", "c"]);
    const onFocus = vi.fn();
    const tracker = track(list, onFocus);
    move(list.children[1]); // the row at the line is b too
    expect(onFocus.mock.lastCall).toEqual(["b", "pointer"]);
    list.dispatchEvent(new MouseEvent("pointerleave"));
    expect(onFocus.mock.lastCall).toEqual(["b", "line"]);
    expect(onFocus).toHaveBeenCalledTimes(2);
    tracker.stop();
    list.remove();
  });

  it("start picks the focus up at once (a map redrawn mid-reading)", () => {
    const { list } = fakeList(["a", "b"]);
    const onFocus = vi.fn();
    const tracker = track(list, onFocus, { start: true });
    expect(onFocus.mock.lastCall[0]).toBe("b");
    tracker.stop();
    list.remove();
  });

  it("stays quiet (and clears) while disabled, e.g. stacked layouts where the map scrolls away", () => {
    const { list } = fakeList(["a", "b"]);
    const onFocus = vi.fn();
    let enabled = true;
    const tracker = track(list, onFocus, { enabled: () => enabled });
    scroll();
    expect(onFocus.mock.lastCall[0]).toBe("b");
    enabled = false;
    scroll();
    expect(onFocus.mock.lastCall[0]).toBe(null);
    move(list.children[0]);
    tracker.hold("a");
    expect(onFocus).toHaveBeenCalledTimes(2);
    tracker.stop();
    list.remove();
  });
});
