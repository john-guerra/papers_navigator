// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearMyPapers } from "../src/components/clearMyPapers.js";
import { createFollowedStore } from "../src/lib/followed.js";
import { createMyPapers, createRulesStore } from "../src/lib/rules.js";
import { createNotesStore } from "../src/lib/notes.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    data,
  };
}

const mount = (el) => (document.body.append(el), el);
const buttonNamed = (el, name) =>
  [...el.querySelectorAll("button")].find((b) => b.textContent.trim() === name);
const press = (el, key) =>
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

afterEach(() => document.body.replaceChildren());

describe("clearMyPapers", () => {
  it("is hidden while My Papers is empty and shows once it has papers", () => {
    let n = 0;
    const control = mount(clearMyPapers({ count: () => n, onClear: vi.fn() }));
    expect(control.hidden).toBe(true);
    n = 3;
    control.update();
    expect(control.hidden).toBe(false);
    expect(buttonNamed(control, "Clear My Papers")).toBeTruthy();
  });

  it("asks inline first, saying how many papers go and that notes stay", () => {
    const onClear = vi.fn();
    const control = mount(clearMyPapers({ count: () => 12, onClear }));
    buttonNamed(control, "Clear My Papers").click();
    expect(onClear).not.toHaveBeenCalled();
    const group = control.querySelector("[role=group]");
    expect(group).toBeTruthy();
    expect(group.textContent).toMatch(/Remove all 12 papers from My Papers\?/);
    expect(group.textContent).toMatch(/notes stay/);
    // the safe choice has focus: Enter right after the click doesn't clear
    expect(document.activeElement).toBe(buttonNamed(control, "Cancel"));
    expect(buttonNamed(control, "Clear My Papers")).toBeUndefined();
  });

  it("mentions that watches stay when there are any", () => {
    const control = mount(
      clearMyPapers({ count: () => 2, watches: () => 1, onClear: vi.fn() }),
    );
    buttonNamed(control, "Clear My Papers").click();
    expect(control.textContent).toMatch(/watches and notes stay/);
  });

  it("Cancel and Escape go back to the button and focus it", () => {
    const onClear = vi.fn();
    const control = mount(clearMyPapers({ count: () => 1, onClear }));
    buttonNamed(control, "Clear My Papers").click();
    expect(control.textContent).toMatch(/Remove all 1 paper from/);
    buttonNamed(control, "Cancel").click();
    expect(document.activeElement).toBe(
      buttonNamed(control, "Clear My Papers"),
    );

    buttonNamed(control, "Clear My Papers").click();
    press(buttonNamed(control, "Cancel"), "Escape");
    expect(document.activeElement).toBe(
      buttonNamed(control, "Clear My Papers"),
    );
    expect(onClear).not.toHaveBeenCalled();
  });

  it("Yes, clear calls onClear once and resets the control", () => {
    const onClear = vi.fn();
    const control = mount(clearMyPapers({ count: () => 4, onClear }));
    buttonNamed(control, "Clear My Papers").click();
    buttonNamed(control, "Yes, clear").click();
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(control.querySelector("[role=group]")).toBeNull();
  });

  it("update() while asking keeps the question unless the list emptied", () => {
    let n = 4;
    const control = mount(clearMyPapers({ count: () => n, onClear: vi.fn() }));
    buttonNamed(control, "Clear My Papers").click();
    control.update();
    expect(control.querySelector("[role=group]")).toBeTruthy();
    n = 0;
    control.update();
    expect(control.hidden).toBe(true);
    expect(control.querySelector("[role=group]")).toBeNull();
  });
});

describe("clearing My Papers with the stores (as the page does)", () => {
  const papers = [
    { id: "a", authors: [{ name: "Ada" }] },
    { id: "b", authors: [{ name: "Bo" }] },
    { id: "c", authors: [{ name: "Ada" }] },
  ];

  it("removes every paper, keeps watches and notes, and Undo restores the exact list", () => {
    const storage = memoryStorage();
    const followed = createFollowedStore("conf", storage, null);
    const rules = createRulesStore("conf", storage, null);
    const notes = createNotesStore("conf", storage, null);
    const store = createMyPapers({ followed, rules, papers });
    followed.add([{ id: "b" }], "by hand", new Date("2026-11-01T10:00:00Z"));
    followed.add(
      [{ id: "x" }],
      "gone from program",
      new Date("2026-11-02T10:00:00Z"),
    );
    store.watch({ type: "author", value: "Ada" });
    notes.set("b", "great talk");
    expect(notes.get("b")).toBe("great talk");
    const followedBefore = JSON.stringify(followed.value);
    const rulesBefore = JSON.stringify(rules.value);
    const notesBefore = JSON.stringify(notes.value);
    expect(store.value.map((d) => d.id).sort()).toEqual(["a", "b", "c", "x"]);

    const undo = store.remove(store.value.map((d) => d.id));
    expect(store.value).toEqual([]);
    expect(rules.value.rules).toHaveLength(1);
    expect(JSON.stringify(notes.value)).toBe(notesBefore);

    undo();
    expect(JSON.stringify(followed.value)).toBe(followedBefore);
    expect(JSON.stringify(rules.value)).toBe(rulesBefore);
    expect(store.value.map((d) => d.id).sort()).toEqual(["a", "b", "c", "x"]);
  });
});
