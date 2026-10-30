// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { paperPanel } from "../src/components/paperPanel.js";

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
