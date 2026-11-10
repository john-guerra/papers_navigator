// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderRatedPapers } from "../src/components/ratedPapers.js";

const p = (id, day, start, extra = {}) => ({
  id,
  shortId: `s-${id}`,
  title: `Paper ${id}`,
  day,
  start,
  typeShort: "Full",
  typeColor: "full",
  ...extra,
});
const papers = [
  p("a", "2026-11-10", "2026-11-10T15:00:00Z"),
  p("b", "2026-11-11", "2026-11-11T14:00:00Z"),
  p("c", "2026-11-11", "2026-11-11T15:00:00Z"),
  p("d", "2026-11-11", "2026-11-11T13:00:00Z"),
  p("unrated", "2026-11-11", "2026-11-11T13:00:00Z"),
];
const ratings = { a: 3, b: 5, c: 5, d: 4 };
const render = (options = {}) =>
  renderRatedPapers(papers, {
    ratings,
    notes: { b: "Ask about the color scale" },
    tz: "US/Eastern",
    onFilter: vi.fn(),
    onOpen: vi.fn(),
    detailsHref: (x) => `?paper=${x.shortId}`,
    ...options,
  });
const ids = (el) =>
  [...el.querySelectorAll(".rated-paper")].map((r) => r.dataset.paperId);

describe("renderRatedPapers (#203)", () => {
  it("lists rated papers, best first, then by time", () => {
    expect(ids(render())).toEqual(["b", "c", "d", "a"]);
  });

  it("shows stars, the note, the pill and a details link", () => {
    const el = render();
    const row = el.querySelector('[data-paper-id="b"]');
    expect(row.querySelector(".rated-stars").textContent).toContain("★★★★★");
    expect(row.textContent).toContain("Rated 5 of 5");
    expect(row.textContent).toContain("Ask about the color scale");
    expect(row.querySelector(".type-pill")).toBeTruthy();
    expect(row.querySelector("a").getAttribute("href")).toBe("?paper=s-b");
  });

  it("filters to 4★ and up", () => {
    expect(ids(render({ minRating: 4 }))).toEqual(["b", "c", "d"]);
  });

  it("filters by day", () => {
    expect(ids(render({ day: "2026-11-10" }))).toEqual(["a"]);
  });

  it("reports filter changes", () => {
    const onFilter = vi.fn();
    const el = render({ onFilter });
    const box = el.querySelector(".rated-min input");
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    expect(onFilter).toHaveBeenCalledWith({ minRating: 4, day: null });
    const select = el.querySelector(".rated-day select");
    expect([...select.options].map((o) => o.value)).toEqual([
      "",
      "2026-11-10",
      "2026-11-11",
    ]);
    select.value = "2026-11-11";
    select.dispatchEvent(new Event("change"));
    // the box is still checked
    expect(onFilter).toHaveBeenLastCalledWith({
      minRating: 4,
      day: "2026-11-11",
    });
  });

  it("has an empty state", () => {
    const el = renderRatedPapers(papers, {
      ratings: {},
      notes: {},
      tz: "US/Eastern",
      onFilter: vi.fn(),
      onOpen: vi.fn(),
      detailsHref: () => "#",
    });
    expect(el.textContent).toContain(
      "Rate papers in a session and they show up here.",
    );
  });
});
