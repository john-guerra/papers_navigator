// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { awardMark, typePill } from "../src/widgets/paperMarks.js";
import { compactPaperRow } from "../src/widgets/compactPaperRow.js";

const paper = {
  id: "a",
  shortId: "s1",
  title: "QueerTravel",
  type: "full",
  typeLabel: "Full VIS Paper",
  typeShort: "Full",
  typeColor: "full",
  award: "honorable mention",
  awardTier: "honorable",
  authors: [
    { name: "Başak Oral", affiliation: "Utrecht University" },
    { name: "Evanthia Dimara", affiliation: "Utrecht University" },
  ],
  sessionName: "Story time",
  room: "America north",
  start: "2026-11-12T13:36:00.000Z",
  url: "https://ieeevis.org/x",
  abstract: "Social safety plays a critical role…",
  links: [{ label: "Preprint PDF", url: "https://arxiv.org/abs/1" }],
};

describe("typePill (#199)", () => {
  it("shows the short label in its type color, the full type in the tooltip", () => {
    const pill = typePill(paper);
    expect(pill.classList).toContain("type-pill");
    expect(pill.dataset.color).toBe("full");
    expect(pill.textContent).toContain("Full");
    expect(pill.title).toBe("Full VIS Paper");
  });

  it("falls back to the type label in the neutral color", () => {
    const pill = typePill({ type: "poster", typeLabel: "Poster" });
    expect(pill.textContent).toContain("Poster");
    expect(pill.dataset.color).toBe("other");
  });

  it("ignores a color that isn't a plain token name", () => {
    expect(
      typePill({ ...paper, typeColor: "x; color:red" }).dataset.color,
    ).toBe("other");
  });
});

describe("awardMark (#199)", () => {
  it("is the group's icon alone, the full award on hover and for screen readers", () => {
    const mark = awardMark(paper);
    expect(mark.textContent).toBe("🏅");
    expect(mark.title).toBe("Honorable mention");
    expect(mark.getAttribute("role")).toBe("img");
    expect(mark.getAttribute("aria-label")).toBe("Award: Honorable mention");
    const other = awardMark({
      ...paper,
      award: "mini-challenge 2: award for x",
      awardTier: "other",
    });
    expect(other.textContent).toBe("🎖️");
    expect(other.title).toBe("Mini-challenge 2: award for x");
  });

  it("is empty without an award", () => {
    expect(awardMark({ award: null, awardTier: null })).toBe("");
  });
});

describe("compactPaperRow (#199)", () => {
  const render = (options = {}) =>
    compactPaperRow(paper, {
      tz: "US/Eastern",
      tzLabel: "ET",
      authorHref: (name) => `authors.html?name=${encodeURIComponent(name)}`,
      onOpen: vi.fn(),
      titleClass: "recommended-open",
      meta: "71% similar",
      ...options,
    });

  it("leads with the type pill and award, then the title", () => {
    const row = render();
    const head = row.querySelector(".paper-head");
    expect(head.querySelector(".type-pill")).toBeTruthy();
    expect(head.querySelector(".award-mark")).toBeTruthy();
    expect(head.querySelector(".recommended-open").textContent.trim()).toBe(
      "QueerTravel",
    );
  });

  it("lists the authors, each linking to their profile", () => {
    const links = render().querySelectorAll(".compact-authors a.author-link");
    expect([...links].map((a) => a.textContent)).toEqual([
      "Başak Oral",
      "Evanthia Dimara",
    ]);
    expect(links[0].getAttribute("href")).toBe(
      "authors.html?name=Ba%C5%9Fak%20Oral",
    );
  });

  it("shows room, time and the caller's meta", () => {
    const text = render().querySelector(".compact-meta").textContent;
    expect(text).toContain("📍 America north");
    expect(text).toContain("Thu Nov 12 08:36 ET");
    expect(text).toContain("71% similar");
  });

  it("opens the details from the title", () => {
    const onOpen = vi.fn();
    render({ onOpen }).querySelector(".recommended-open").click();
    expect(onOpen).toHaveBeenCalledWith(paper);
  });

  it("expands Details in place: session, type, affiliations, abstract, links, full details", () => {
    const onOpen = vi.fn();
    const row = render({ onOpen });
    const toggle = row.querySelector(".compact-details-toggle");
    const panel = row.querySelector(".compact-details");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(panel.hidden).toBe(true);
    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    const text = panel.textContent;
    expect(text).toContain("Story time");
    expect(text).toContain("Full VIS Paper");
    expect(text).toContain("Utrecht University");
    expect(text).toContain("Social safety plays");
    expect(text).toContain("Preprint PDF");
    expect(text).toContain("Honorable mention");
    panel.querySelector(".compact-details-open").click();
    expect(onOpen).toHaveBeenCalledWith(paper);
    toggle.click();
    expect(panel.hidden).toBe(true);
  });

  it("puts the caller's extra line and actions in the row", () => {
    const row = render({
      extra: "✨ Like X",
      actions: Object.assign(document.createElement("button"), {
        className: "act",
      }),
    });
    expect(row.textContent).toContain("✨ Like X");
    expect(row.querySelector(".act")).toBeTruthy();
  });
});
