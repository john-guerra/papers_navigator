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
const open = (control) => buttonNamed(control, "Clear My Papers").click();

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

  it("without watches asks inline with [Clear] [Cancel], focus on Cancel", () => {
    const onClear = vi.fn();
    const control = mount(clearMyPapers({ count: () => 12, onClear }));
    open(control);
    expect(onClear).not.toHaveBeenCalled();
    const group = control.querySelector("[role=group]");
    expect(group.textContent).toMatch(/Remove all 12 papers from My Papers\?/);
    expect(group.textContent).toMatch(/notes stay/);
    expect(
      [...group.querySelectorAll("button")].map((b) => b.textContent.trim()),
    ).toEqual(["Clear", "Cancel"]);
    expect(document.activeElement).toBe(buttonNamed(control, "Cancel"));
    buttonNamed(control, "Clear").click();
    expect(onClear).toHaveBeenCalledWith({ stopWatches: false });
    expect(control.querySelector("[role=group]")).toBeNull();
  });

  it("names the group by its question and describes it with what stays", () => {
    const control = mount(clearMyPapers({ count: () => 2, onClear: vi.fn() }));
    open(control);
    const group = control.querySelector("[role=group]");
    expect(group.hasAttribute("aria-label")).toBe(false);
    const name = document.getElementById(group.getAttribute("aria-labelledby"));
    const desc = document.getElementById(
      group.getAttribute("aria-describedby"),
    );
    expect(name.textContent).toBe("Remove all 2 papers from My Papers?");
    expect(desc.textContent).toMatch(/notes stay/);
  });

  it("with watches offers papers only or papers and the watches", () => {
    const onClear = vi.fn();
    const control = mount(
      clearMyPapers({ count: () => 5, watches: () => 2, onClear }),
    );
    open(control);
    expect(
      [...control.querySelectorAll("button")].map((b) => b.textContent.trim()),
    ).toEqual([
      "Clear papers only",
      "Clear papers and stop 2 watches",
      "Cancel",
    ]);
    expect(document.activeElement).toBe(buttonNamed(control, "Cancel"));
    buttonNamed(control, "Clear papers and stop 2 watches").click();
    expect(onClear).toHaveBeenCalledWith({ stopWatches: true });

    open(control);
    buttonNamed(control, "Clear papers only").click();
    expect(onClear).toHaveBeenLastCalledWith({ stopWatches: false });
  });

  it("says 1 paper and 1 watch in the singular", () => {
    const control = mount(
      clearMyPapers({ count: () => 1, watches: () => 1, onClear: vi.fn() }),
    );
    open(control);
    expect(control.textContent).toMatch(/Remove all 1 paper from/);
    expect(buttonNamed(control, "Clear papers and stop 1 watch")).toBeTruthy();
  });

  it("Cancel and Escape go back to the button and focus it", () => {
    const onClear = vi.fn();
    const control = mount(clearMyPapers({ count: () => 1, onClear }));
    open(control);
    buttonNamed(control, "Cancel").click();
    expect(document.activeElement).toBe(
      buttonNamed(control, "Clear My Papers"),
    );
    open(control);
    press(buttonNamed(control, "Cancel"), "Escape");
    expect(document.activeElement).toBe(
      buttonNamed(control, "Clear My Papers"),
    );
    expect(onClear).not.toHaveBeenCalled();
  });

  it("keeps the question's counts live while it is open, and the focus", () => {
    let n = 4;
    let w = 0;
    const control = mount(
      clearMyPapers({ count: () => n, watches: () => w, onClear: vi.fn() }),
    );
    open(control);
    n = 9;
    w = 2;
    control.update();
    expect(control.textContent).toMatch(/Remove all 9 papers/);
    expect(
      buttonNamed(control, "Clear papers and stop 2 watches"),
    ).toBeTruthy();
    expect(document.activeElement).toBe(buttonNamed(control, "Cancel"));
  });

  it("closes when the list empties while open and moves focus somewhere sensible", () => {
    let n = 4;
    const fallback = mount(document.createElement("button"));
    const control = mount(
      clearMyPapers({
        count: () => n,
        onClear: vi.fn(),
        emptyFocus: () => fallback,
      }),
    );
    open(control);
    n = 0;
    control.update();
    expect(control.hidden).toBe(true);
    expect(control.querySelector("[role=group]")).toBeNull();
    expect(document.activeElement).toBe(fallback);
  });

  it("focusButton() focuses Clear My Papers (after Undo)", () => {
    const control = mount(clearMyPapers({ count: () => 2, onClear: vi.fn() }));
    control.focusButton();
    expect(document.activeElement).toBe(
      buttonNamed(control, "Clear My Papers"),
    );
  });
});

const papers = [
  { id: "a", authors: [{ name: "Ada" }] },
  { id: "b", authors: [{ name: "Bo" }] },
  { id: "c", authors: [{ name: "Ada" }] },
  { id: "d", authors: [{ name: "Cy" }] },
];

function setup() {
  const storage = memoryStorage();
  const followed = createFollowedStore("conf", storage, null);
  const rules = createRulesStore("conf", storage, null);
  const notes = createNotesStore("conf", storage, null);
  const store = createMyPapers({ followed, rules, papers });
  followed.add([{ id: "b" }], "r1", new Date("2026-11-01T10:00:00Z"));
  followed.add([{ id: "x" }], "r2", new Date("2026-11-02T10:00:00Z"));
  store.watch({ type: "author", value: "Ada" });
  notes.set("b", "great talk");
  return { storage, followed, rules, notes, store };
}
const ids = (store) => store.value.map((d) => d.id).sort();

describe("myPapers.clear (#164)", () => {
  it("papers only: removes every paper, keeps watches and notes; Undo restores exactly", () => {
    const { followed, rules, notes, store } = setup();
    const before = [followed.value, rules.value, notes.value].map((v) =>
      JSON.stringify(v),
    );
    const undo = store.clear();
    expect(store.value).toEqual([]);
    expect(rules.value.rules).toHaveLength(1);
    expect(JSON.stringify(notes.value)).toBe(before[2]);
    undo();
    expect(
      [followed.value, rules.value, notes.value].map((v) => JSON.stringify(v)),
    ).toEqual(before);
  });

  it("with stopWatches: also removes the rules, and Undo brings them back", () => {
    const { rules, store } = setup();
    const rulesBefore = JSON.stringify(rules.value);
    const undo = store.clear({ stopWatches: true });
    expect(store.value).toEqual([]);
    expect(rules.value.rules).toEqual([]);
    expect(rules.value.exceptions).toEqual([]);
    undo();
    expect(JSON.stringify(rules.value)).toBe(rulesBefore);
    expect(ids(store)).toEqual(["a", "b", "c", "x"]);
  });

  it("Undo puts entries back in their places and keeps papers added meanwhile", () => {
    const { followed, store } = setup();
    const original = JSON.stringify(followed.value);
    const undo = store.clear();
    followed.add([{ id: "d" }], "new", new Date("2026-11-04T10:00:00Z"));
    followed.add([{ id: "b" }], "again", new Date("2026-11-04T10:00:00Z"));
    undo();
    expect(JSON.stringify(followed.value.slice(0, 2))).toBe(original);
    expect(followed.value.map((d) => d.id)).toEqual(["b", "x", "d"]);
  });

  it("keeps a backup: Restore previous list brings the cleared papers and exceptions back", () => {
    const { followed, rules, store } = setup();
    const before = JSON.stringify([followed.value, rules.value]);
    store.clear();
    expect(store.backupCount()).toBe(4);
    const undoRestore = store.restoreBackup();
    expect(JSON.stringify([followed.value, rules.value])).toBe(before);
    undoRestore();
    expect(store.value).toEqual([]);
    expect(store.backupCount()).toBe(4);
  });

  it("restoring the backup of a clear that stopped watches re-adds the rules", () => {
    const { rules, store } = setup();
    store.clear({ stopWatches: true });
    store.restoreBackup();
    expect(rules.value.rules.map((r) => r.value)).toEqual(["Ada"]);
    expect(ids(store)).toEqual(["a", "b", "c", "x"]);
  });

  it("a plain Replace's backup carries nothing extra", () => {
    const { followed, rules, store } = setup();
    followed.replace([
      { id: "d", reason: "r", addedOn: "2026-11-03T00:00:00Z" },
    ]);
    const exceptions = rules.value.exceptions;
    store.restoreBackup();
    expect(followed.value.map((d) => d.id)).toEqual(["b", "x"]);
    expect(rules.value.exceptions).toEqual(exceptions);
  });
});

describe("watch after Clear or Remove (#164 review)", () => {
  it("watching again brings back papers a Clear had excepted", () => {
    const { rules, store } = setup();
    store.clear();
    const id = rules.value.rules[0].id;
    store.unwatch([id]);
    store.watch({ type: "author", value: "Ada" });
    expect(ids(store)).toEqual(["a", "c"]);
    expect(rules.value.exceptions).toEqual([]);
  });

  it("re-watching an existing rule also drops its exceptions after single Removes", () => {
    const { store, rules } = setup();
    store.remove(["a"]);
    expect(rules.value.exceptions).toEqual(["a"]);
    store.watch({ type: "author", value: "Ada" });
    expect(ids(store)).toContain("a");
  });
});
