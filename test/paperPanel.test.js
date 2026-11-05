// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { paperPanel } from "../src/components/paperPanel.js";
import { createNotesStore } from "../src/lib/notes.js";

const papers = [
  { id: "id-a", shortId: "a", title: "A" },
  { id: "id-b", shortId: "b", title: "B" },
];
const makeStore = () => {
  const ids = new Set();
  return {
    get value() {
      return [...ids].map((id) => ({ id }));
    },
    add: vi.fn((items) => items.forEach((d) => ids.add(d.id))),
    remove: vi.fn((list) => {
      list.forEach((id) => ids.delete(id));
      return () => {};
    }),
  };
};
const setup = (key, extra = {}) => {
  const route = { open: vi.fn(), close: vi.fn() };
  const store = makeStore();
  const toast = vi.fn();
  const addWithUndo = vi.fn((s, items) => (s.add(items), () => {}));
  const el = paperPanel(key, {
    papers,
    tz: "US/Eastern",
    store,
    route,
    related: () => [{ ...papers[1], score: 0.8 }],
    toast,
    addWithUndo,
    ...extra,
  });
  document.body.append(el);
  return { el, route, store, toast, addWithUndo };
};

describe("paperPanel", () => {
  it("renders nothing visible without a paper, or for an unknown key", () => {
    expect(setup(null).el.classList.contains("paper-detail")).toBe(false);
    expect(setup("zz").el.classList.contains("paper-detail")).toBe(false);
  });
  it("finds the paper by shortId or id and opens related papers by shortId", () => {
    const { el, route } = setup("a");
    expect(el.querySelector("h2").textContent).toBe("A");
    el.querySelector(".related-open").click();
    expect(route.open).toHaveBeenCalledWith("b");
    expect(setup("id-b").el.querySelector("h2").textContent).toBe("B");
  });
  it("adds with the reason, and removes, with an Undo toast", () => {
    const { el, store, toast, addWithUndo } = setup("a", {
      addReason: "★ Added by hand",
    });
    const toggle = el.querySelector(".paper-detail-header .follow-toggle");
    toggle.click();
    expect(addWithUndo).toHaveBeenCalledWith(
      store,
      [papers[0]],
      "★ Added by hand",
    );
    expect(toast).toHaveBeenLastCalledWith(
      "Added to My Papers",
      expect.objectContaining({ actionLabel: "Undo" }),
    );
    toggle.click();
    expect(store.remove).toHaveBeenCalledWith(["id-a"]);
    expect(toast).toHaveBeenLastCalledWith(
      "Removed from My Papers",
      expect.objectContaining({ actionLabel: "Undo" }),
    );
  });
  it("closes on Esc until disposed", () => {
    const { el, route } = setup("a");
    dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(route.close).toHaveBeenCalledTimes(1);
    el.dispose();
    dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(route.close).toHaveBeenCalledTimes(1);
  });
});

describe("paperPanel Escape (#177 review)", () => {
  it("leaves an Escape another layer already handled (e.g. a toggletip)", () => {
    const { el, route } = setup("a");
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    event.preventDefault();
    dispatchEvent(event);
    expect(route.close).not.toHaveBeenCalled();
    el.dispose();
  });
});

describe("paperPanel mini-map (#101)", () => {
  it("redraws the mini-map only when the map's key changes after the first", () => {
    let rows = [
      { id: "id-a", x: 0, y: 0, title: "A" },
      { id: "id-b", x: 1, y: 1, title: "B" },
    ];
    const { el } = setup("a", { mapRows: () => rows });
    const first = el.querySelector(".mini-map");
    expect(first).toBeTruthy();
    el.refreshMiniMap("umap:true");
    el.refreshMiniMap("umap:true");
    expect(el.querySelector(".mini-map")).toBe(first);
    rows = [
      { id: "id-a", x: 5, y: 5, title: "A" },
      { id: "id-b", x: 9, y: 2, title: "B" },
    ];
    el.refreshMiniMap("tsne:true");
    expect(el.querySelector(".mini-map")).not.toBe(first);
    expect(el.querySelector(".mini-map")).toBeTruthy();
    el.dispose();
  });
});

describe("paperPanel notes (#152)", () => {
  it("shows My note when given a notes store; a note doesn't add the paper", () => {
    const notes = createNotesStore("conf", null, null);
    const { el, store, addWithUndo } = setup("a", { notes });
    const input = el.querySelector(".paper-note textarea");
    expect(input).toBeTruthy();
    input.value = "Ask about the evaluation";
    input.dispatchEvent(new Event("input"));
    // closing the panel saves pending typing
    el.dispose();
    expect(notes.get("id-a")).toBe("Ask about the evaluation");
    expect(store.value).toEqual([]);
    expect(addWithUndo).not.toHaveBeenCalled();
  });
  it("has no note section without a notes store", () => {
    const { el } = setup("a");
    expect(el.querySelector(".paper-note")).toBeNull();
    el.dispose();
  });
});

describe("paperPanel focus (#152 review)", () => {
  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  it("focuses Close when a paper opens, not when the same panel is redrawn", async () => {
    const route = { open: vi.fn(), close: vi.fn() };
    const notes = createNotesStore("conf", null, null);
    const first = setup("a", { route, notes }).el;
    await frame();
    expect(document.activeElement.classList).toContain("paper-detail-close");
    // typing a note when the page redraws the panel (e.g. related papers arrived)
    const input = first.querySelector(".paper-note textarea");
    input.focus();
    input.value = "half a sent";
    input.dispatchEvent(new Event("input"));
    // Framework builds the new panel, then disposes and replaces the old one
    const again = setup("a", { route, notes }).el;
    first.dispose();
    first.remove();
    await frame();
    const next = again.querySelector(".paper-note textarea");
    expect(next.value).toBe("half a sent");
    expect(document.activeElement).toBe(next);
    again.dispose();
    // after closing, opening it again focuses Close
    setup(null, { route });
    const reopened = setup("a", { route, notes }).el;
    await frame();
    expect(document.activeElement.classList).toContain("paper-detail-close");
    reopened.dispose();
  });
});
