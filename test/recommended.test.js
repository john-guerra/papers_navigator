// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderRecommended } from "../src/components/recommended.js";

const recs = Array.from({ length: 25 }, (_, i) => ({
  id: `p${i}`,
  shortId: `s${i}`,
  title: `Paper ${i}`,
  room: "Room 1",
  score: 0.9 - i / 100,
  because: { id: "m1", shortId: "sm1", title: "Mine 1" },
}));
const setup = (state, options = {}) => {
  const handlers = {
    onAdd: vi.fn(),
    onDismiss: vi.fn(),
    onOpen: vi.fn(),
    onShowMore: vi.fn(),
  };
  const el = renderRecommended(state, {
    tz: "US/Eastern",
    shown: 10,
    ...handlers,
    ...options,
  });
  document.body.append(el);
  return { el, ...handlers };
};

describe("renderRecommended", () => {
  it("shows the top N with why, and Show more", () => {
    const { el, onShowMore } = setup({ status: "ready", recs });
    const rows = el.querySelectorAll(".recommended-paper");
    expect(rows).toHaveLength(10);
    expect(rows[0].textContent).toContain("Paper 0");
    expect(rows[0].textContent).toContain("90% similar");
    expect(rows[0].querySelector(".recommended-why").textContent).toContain(
      "Mine 1",
    );
    const more = el.querySelector(".recommended-more");
    expect(more.textContent).toContain("Show more");
    more.click();
    expect(onShowMore).toHaveBeenCalledWith(20);
    el.remove();
  });
  it("opens the paper's details, and its why paper's details", () => {
    const { el, onOpen } = setup({ status: "ready", recs });
    const row = el.querySelector(".recommended-paper");
    row.querySelector(".recommended-open").click();
    expect(onOpen).toHaveBeenLastCalledWith(recs[0]);
    const why = row.querySelector(".recommended-why a");
    expect(why.getAttribute("href")).toBe("?paper=sm1");
    why.click();
    expect(onOpen).toHaveBeenLastCalledWith(recs[0].because);
    el.remove();
  });
  it("adds to My Papers and dismisses", () => {
    const { el, onAdd, onDismiss } = setup({ status: "ready", recs });
    const row = el.querySelector(".recommended-paper");
    expect(row.querySelector(".follow-toggle").textContent).toContain(
      "Add to My Papers",
    );
    row.querySelector(".follow-toggle").click();
    expect(onAdd).toHaveBeenCalledWith(recs[0]);
    row.querySelector(".recommended-dismiss").click();
    expect(onDismiss).toHaveBeenCalledWith(recs[0]);
    el.remove();
  });
  it("has no Show more when everything is shown", () => {
    const { el } = setup({ status: "ready", recs: recs.slice(0, 3) });
    expect(el.querySelectorAll(".recommended-paper")).toHaveLength(3);
    expect(el.querySelector(".recommended-more")).toBeNull();
    el.remove();
  });
  it("has empty, loading and unavailable states", () => {
    expect(setup({ status: "empty" }).el.textContent).toContain(
      "Add papers to My Papers",
    );
    expect(setup({ status: "loading" }).el.textContent).toContain("Finding");
    expect(setup({ status: "error" }).el.textContent).toContain("unavailable");
    expect(setup({ status: "ready", recs: [] }).el.textContent).toContain(
      "No more",
    );
  });
});
