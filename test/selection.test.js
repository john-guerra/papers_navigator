// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { planAdd, selectionReason } from "../src/lib/selection.js";
import { showToast } from "../src/components/toast.js";
import { renderAddBar } from "../src/components/addBar.js";
import { renderChips } from "../src/components/chips.js";

describe("planAdd", () => {
  it("splits the listed papers into new ones and those already in My Papers", () => {
    const plan = planAdd(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      new Set(["b"]),
    );
    expect(plan).toEqual({
      total: 3,
      fresh: [{ id: "a" }, { id: "c" }],
      already: 1,
    });
  });
});

describe("selectionReason", () => {
  const base = { types: ["full"], defaultTypes: ["full"], typeLabel: (t) => t };
  it("summarizes the visible constraints", () => {
    expect(
      selectionReason({
        ...base,
        query: "uncertainty",
        affiliations: ["Northeastern University"],
        region: true,
      }),
    ).toBe("🔍 uncertainty · 🏫 Northeastern University · Map region");
  });
  it("leaves out the default types", () => {
    expect(selectionReason({ ...base, authors: ["Ann"] })).toBe("👤 Ann");
    expect(selectionReason({ ...base, types: ["poster"] })).toBe(
      "Type: poster",
    );
  });
  it("falls back when nothing narrows the list", () => {
    expect(selectionReason(base)).toBe("All matching papers");
  });
});

describe("showToast", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });
  it("shows one toast with an Undo action that disappears after 10 s", () => {
    vi.useFakeTimers();
    const undo = vi.fn();
    showToast("Added 3", { actionLabel: "Undo", onAction: undo });
    showToast("Added 4", { actionLabel: "Undo", onAction: undo });
    const toasts = document.querySelectorAll(".toast");
    expect(toasts).toHaveLength(1);
    expect(toasts[0].textContent).toContain("Added 4");
    expect(
      document.querySelector(".toast-region").getAttribute("aria-live"),
    ).toBe("polite");
    toasts[0].querySelector("button").click();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll(".toast")).toHaveLength(0);
    showToast("Removed 1");
    vi.advanceTimersByTime(10_001);
    expect(document.querySelectorAll(".toast")).toHaveLength(0);
  });
});

describe("renderAddBar", () => {
  it("offers to add the new papers and says how many are already there", () => {
    const onAdd = vi.fn();
    const el = renderAddBar(
      { total: 6, fresh: [{ id: "a" }, { id: "b" }], already: 4 },
      { onAdd },
    );
    expect(el.textContent).toContain("Matching papers");
    const button = el.querySelector("button");
    expect(button.textContent).toContain("Add 2 to My Papers");
    expect(el.textContent).toContain("4 already there");
    button.click();
    expect(onAdd).toHaveBeenCalledWith([{ id: "a" }, { id: "b" }]);
  });
  it("is disabled when every listed paper is already in My Papers", () => {
    const el = renderAddBar(
      { total: 3, fresh: [], already: 3 },
      { onAdd: () => {} },
    );
    expect(el.querySelector("button").disabled).toBe(true);
    expect(el.querySelector("button").textContent).toContain(
      "All 3 in My Papers",
    );
  });
});

describe("renderChips", () => {
  it("renders a removable chip per constraint and Clear all", () => {
    const clearQuery = vi.fn();
    const clearAll = vi.fn();
    const el = renderChips(
      [{ label: "Search", value: "uncertainty", onClear: clearQuery }],
      { onClearAll: clearAll },
    );
    expect(el.textContent).toContain("Search");
    expect(el.textContent).toContain("uncertainty");
    el.querySelector(".chip button").click();
    expect(clearQuery).toHaveBeenCalled();
    el.querySelector(".chips-clear").click();
    expect(clearAll).toHaveBeenCalled();
  });
  it("renders nothing without constraints", () => {
    expect(renderChips([], {}).children).toHaveLength(0);
  });
});

describe("addWithUndo", () => {
  it("adds only the fresh papers and its undo removes exactly those", async () => {
    const { addWithUndo } = await import("../src/lib/selection.js");
    const calls = [];
    const store = {
      add: (list, reason) => calls.push(["add", list.map((p) => p.id), reason]),
      remove: (ids) => calls.push(["remove", ids]),
    };
    const undo = addWithUndo(store, [{ id: "a" }, { id: "c" }], "🔍 q");
    undo();
    expect(calls).toEqual([
      ["add", ["a", "c"], "🔍 q"],
      ["remove", ["a", "c"]],
    ]);
  });
});

describe("renderAddBar disabled hint", () => {
  it("explains why bulk add is off when nothing narrows the list", () => {
    const el = renderAddBar(
      { total: 283, fresh: [{ id: "a" }], already: 0 },
      { onAdd: () => {}, disabledHint: "Search or filter to add in bulk" },
    );
    expect(el.querySelector("button").disabled).toBe(true);
    expect(el.textContent).toContain("Search or filter to add in bulk");
  });
});
