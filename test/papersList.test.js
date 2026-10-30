// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { PapersList } from "../src/widgets/papersList.js";

const papers = [
  {
    id: "a",
    title: "Exploring LLM Agents",
    url: "https://ieeevis.org/x",
    typeLabel: "VIS Short Paper",
    authors: [{ name: "Ann", affiliation: "MIT" }],
    sessionName: "Me, Myself, and AI",
    room: "America center",
    start: "2026-11-11T18:00:00.000Z",
    abstract: "This paper examines…",
    links: [{ label: "Preprint PDF", url: "https://arxiv.org/abs/1" }],
  },
  { id: "b", title: "Poster", authors: [], start: null },
];

describe("PapersList", () => {
  it("renders one item per paper with time in the conference timezone", () => {
    const list = PapersList(papers, { tz: "US/Eastern" });
    const items = list.querySelectorAll(".paper");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Wed Nov 11 13:00");
    expect(items[0].textContent).toContain("Ann (MIT)");
    expect(items[0].querySelector("a.title").href).toBe(
      "https://ieeevis.org/x",
    );
    expect(items[0].textContent).toContain("Preprint PDF");
  });

  it("renders actions and preamble for each paper", () => {
    const list = PapersList(papers, {
      tz: "US/Eastern",
      actions: (p) =>
        Object.assign(document.createElement("button"), {
          textContent: `x${p.id}`,
        }),
      preamble: (p) => `reason ${p.id}`,
    });
    expect(list.querySelectorAll("button")).toHaveLength(2);
    expect(list.textContent).toContain("reason b");
  });

  it("caps the number of rendered papers", () => {
    const list = PapersList(papers, { tz: "US/Eastern", max: 1 });
    expect(list.querySelectorAll(".paper")).toHaveLength(1);
    expect(list.textContent).toContain("1 more");
  });
});

describe("PapersList row ids", () => {
  it("marks each row with its paper id so the map can scroll to it", async () => {
    const { PapersList } = await import("../src/widgets/papersList.js");
    const el = PapersList([{ id: "p1", title: "T" }], { tz: "US/Eastern" });
    expect(el.querySelector('[data-paper-id="p1"]')).not.toBeNull();
  });
});

describe("PapersList show more", () => {
  it("lists the first batch and a Show more button that reveals the next batch in place", async () => {
    const { PapersList } = await import("../src/widgets/papersList.js");
    const papers = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      title: `T${i}`,
    }));
    const el = PapersList(papers, { tz: "US/Eastern", max: 2 });
    expect(el.querySelectorAll(".paper")).toHaveLength(2);
    const more = el.querySelector(".papers-more button");
    expect(more.textContent).toContain("Show 2 more");
    more.click();
    expect(el.querySelectorAll(".paper")).toHaveLength(4);
    el.querySelector(".papers-more button").click();
    expect(el.querySelectorAll(".paper")).toHaveLength(5);
    expect(el.querySelector(".papers-more")).toBeNull();
  });
});
