// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { starRating } from "../src/widgets/starRating.js";
import { quickNote } from "../src/components/quickNote.js";

describe("starRating (#203)", () => {
  const stars = (el) => [...el.querySelectorAll("button")];

  it("has 5 labelled star buttons in a labelled group", () => {
    const el = starRating(0, { label: "Rate Paper A" });
    expect(el.getAttribute("role")).toBe("group");
    expect(el.getAttribute("aria-label")).toBe("Rate Paper A");
    expect(stars(el).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Rate 1 of 5",
      "Rate 2 of 5",
      "Rate 3 of 5",
      "Rate 4 of 5",
      "Rate 5 of 5",
    ]);
  });

  it("sets the value with one tap and emits input once", () => {
    const el = starRating(0, { label: "x" });
    document.body.append(el);
    const onInput = vi.fn();
    el.addEventListener("input", onInput);
    stars(el)[3].click();
    expect(el.value).toBe(4);
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(stars(el).map((b) => b.getAttribute("aria-pressed"))).toEqual([
      "true",
      "true",
      "true",
      "true",
      "false",
    ]);
    el.remove();
  });

  it("clears with a tap on the current star", () => {
    const el = starRating(4, { label: "x" });
    stars(el)[3].click();
    expect(el.value).toBe(0);
    expect(
      stars(el).every((b) => b.getAttribute("aria-pressed") === "false"),
    ).toBe(true);
  });

  it("can be set from outside without emitting input", () => {
    const el = starRating(0, { label: "x" });
    const onInput = vi.fn();
    el.addEventListener("input", onInput);
    el.value = 2;
    expect(stars(el)[1].getAttribute("aria-pressed")).toBe("true");
    expect(onInput).not.toHaveBeenCalled();
  });
});

describe("quickNote (#203)", () => {
  const fakeNotes = (initial = {}) => {
    const store = new EventTarget();
    let value = { ...initial };
    store.get = (id) => value[id] ?? "";
    store.set = vi.fn((id, text) => {
      value = { ...value, [id]: text };
      store.dispatchEvent(new Event("input"));
      return true;
    });
    store.replace = (next) => {
      value = next;
      store.dispatchEvent(new Event("input"));
    };
    return store;
  };

  it("is a one-line field showing the paper's note", () => {
    const el = quickNote({ id: "p1" }, { notes: fakeNotes({ p1: "hi" }) });
    const input = el.querySelector("textarea");
    expect(input.getAttribute("rows")).toBe("1");
    expect(input.value).toBe("hi");
    expect(input.placeholder).toBe("Quick note…");
  });

  it("saves on blur (and after a pause in typing)", () => {
    vi.useFakeTimers();
    const notes = fakeNotes();
    const el = quickNote({ id: "p1" }, { notes, delay: 500 });
    document.body.append(el);
    const input = el.querySelector("textarea");
    input.value = "great";
    input.dispatchEvent(new Event("input"));
    expect(notes.set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(notes.set).toHaveBeenCalledWith("p1", "great");
    input.value = "great talk";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new Event("blur"));
    expect(notes.set).toHaveBeenLastCalledWith("p1", "great talk");
    el.remove();
    vi.useRealTimers();
  });

  it("follows the store unless it has focus", () => {
    const notes = fakeNotes({ p1: "a" });
    const el = quickNote({ id: "p1" }, { notes });
    document.body.append(el);
    const input = el.querySelector("textarea");
    notes.replace({ p1: "from another tab" });
    expect(input.value).toBe("from another tab");
    input.focus();
    notes.replace({ p1: "ignored while typing" });
    expect(input.value).toBe("from another tab");
    el.dispose();
    el.remove();
  });

  it("flush saves pending typing at once", () => {
    const notes = fakeNotes();
    const el = quickNote({ id: "p1" }, { notes, delay: 10_000 });
    const input = el.querySelector("textarea");
    input.value = "x";
    input.dispatchEvent(new Event("input"));
    el.flush();
    expect(notes.set).toHaveBeenCalledWith("p1", "x");
  });
});

describe("quickNote fits an existing note (#203 Stage B)", () => {
  it("grows to a multi-line note after a frame", () => {
    const frames = [];
    const raf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (f) => frames.push(f);
    const notes = new EventTarget();
    notes.get = () => "a\nb\nc";
    notes.set = () => true;
    const el = quickNote({ id: "p1" }, { notes });
    document.body.append(el);
    const input = el.querySelector("textarea");
    Object.defineProperty(input, "scrollHeight", { value: 66 });
    expect(input.style.height).toBe("");
    frames.forEach((f) => f());
    expect(input.style.height).toBe("66px");
    globalThis.requestAnimationFrame = raf;
    el.remove();
  });
});

describe("quickNote says Saved (Stage E)", () => {
  it("shows Saved after a save, then clears it", () => {
    vi.useFakeTimers();
    const notes = new EventTarget();
    notes.get = () => "";
    notes.set = vi.fn(() => true);
    const el = quickNote({ id: "p1" }, { notes, delay: 100 });
    document.body.append(el);
    const input = el.querySelector("textarea");
    input.value = "hello";
    input.dispatchEvent(new Event("input"));
    vi.advanceTimersByTime(100);
    const status = el.querySelector(".quick-note-status");
    expect(status.textContent).toBe("Saved");
    // announced through .quick-note-live (minor 4); this one is visual
    expect(status.getAttribute("aria-hidden")).toBe("true");
    vi.advanceTimersByTime(2100);
    expect(status.textContent).toBe("");
    el.remove();
    vi.useRealTimers();
  });
});

describe("quickNote tells screen readers Saved once per edit (minor 4)", () => {
  it("announces the first save after focus, not every autosave; again after leaving", () => {
    vi.useFakeTimers();
    const notes = new EventTarget();
    notes.get = () => "";
    notes.set = vi.fn(() => true);
    const el = quickNote({ id: "p1" }, { notes, delay: 100 });
    document.body.append(el);
    const input = el.querySelector("textarea");
    const live = el.querySelector(".quick-note-live");
    const shown = el.querySelector(".quick-note-status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(shown.getAttribute("aria-hidden")).toBe("true");
    input.dispatchEvent(new Event("focus"));
    const type = (text) => {
      input.value = text;
      input.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(100);
    };
    type("a");
    expect(live.textContent).toBe("Saved");
    expect(shown.textContent).toBe("Saved");
    vi.advanceTimersByTime(2100);
    expect(live.textContent).toBe("");
    type("ab");
    expect(shown.textContent).toBe("Saved");
    expect(live.textContent).toBe("");
    input.dispatchEvent(new Event("blur"));
    input.dispatchEvent(new Event("focus"));
    type("abc");
    expect(live.textContent).toBe("Saved");
    el.remove();
    vi.useRealTimers();
  });
});
