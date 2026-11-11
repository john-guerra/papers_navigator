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

describe("Papers I rated: Not for me (#208)", () => {
  it("lists disliked papers after the starred ones, and 4★ and up hides them", () => {
    const el = render({ dislikedIds: ["unrated"] });
    const section = el.querySelector(".rated-disliked");
    expect(section.textContent).toContain("Not for me");
    expect(section.querySelector('[data-paper-id="unrated"]')).toBeTruthy();
    expect(
      render({ dislikedIds: ["unrated"], minRating: 4 }).querySelector(
        ".rated-disliked",
      ),
    ).toBeNull();
  });
});

describe("Papers I rated: rows are stars, title and note only (John: save space)", () => {
  it("links to review everything in My Papers; no My Papers toggle, Post or Discussion", () => {
    const el = render({
      inMyPapers: (id) => id === "b",
      onToggle: vi.fn(),
      postPanel: vi.fn(),
      discussion: new Map([["c", "https://bsky.app/profile/x/post/2"]]),
    });
    const link = el.querySelector("a.review-all");
    expect(link.textContent).toContain("Review all in My Papers →");
    expect(link.getAttribute("href")).toBe("my-papers.html#review=rating");
    expect(el.querySelector(".follow-toggle")).toBeNull();
    expect(el.querySelector(".live-post")).toBeNull();
    expect(el.querySelector(".live-discussion")).toBeNull();
    expect(el.querySelector(".rated-actions")).toBeNull();
    // the note stays
    expect(el.querySelector(".rated-note")).not.toBeNull();
  });
});
