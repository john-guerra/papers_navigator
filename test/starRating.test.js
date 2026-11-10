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
