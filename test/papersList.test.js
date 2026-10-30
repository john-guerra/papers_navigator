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
    // one injected action per paper (rows may also have a "More" toggle)
    expect(
      [...list.querySelectorAll("button")].filter((b) =>
        b.textContent.startsWith("x"),
      ),
    ).toHaveLength(2);
    expect(list.textContent).toContain("reason b");
  });

  it("links author names with authorHref, keeping affiliations as text (#78)", () => {
    const plain = PapersList(papers, { tz: "US/Eastern" });
    expect(plain.querySelector(".paper-authors a")).toBeNull();
    const list = PapersList(papers, {
      tz: "US/Eastern",
      authorHref: (name) => `./authors.html?name=${name}`,
    });
    const link = list.querySelector(".paper-authors a.author-link");
    expect(link.getAttribute("href")).toBe("./authors.html?name=Ann");
    expect(link.textContent).toBe("Ann");
    expect(list.querySelector(".paper-authors").textContent).toBe("Ann (MIT)");
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

describe("PapersList keeps its expansion", () => {
  it("starts with `shown` rows and reports each Show more, so pages can restore it after a re-render", async () => {
    const { PapersList } = await import("../src/widgets/papersList.js");
    const papers = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      title: `T${i}`,
    }));
    const counts = [];
    const el = PapersList(papers, {
      tz: "US/Eastern",
      max: 2,
      shown: 4,
      onShow: (n) => counts.push(n),
    });
    expect(el.querySelectorAll(".paper")).toHaveLength(4);
    el.querySelector(".papers-more button").click();
    expect(el.querySelectorAll(".paper")).toHaveLength(5);
    expect(counts).toEqual([5]);
  });
});

describe("PapersList showThrough", () => {
  it("expands the list until a given paper is rendered and returns its row", async () => {
    const { PapersList } = await import("../src/widgets/papersList.js");
    const papers = Array.from({ length: 7 }, (_, i) => ({
      id: `p${i}`,
      title: `T${i}`,
    }));
    const counts = [];
    const el = PapersList(papers, {
      tz: "US/Eastern",
      max: 2,
      onShow: (n) => counts.push(n),
    });
    const row = el.showThrough("p4");
    expect(row.dataset.paperId).toBe("p4");
    expect(el.querySelectorAll(".paper")).toHaveLength(6);
    expect(counts.at(-1)).toBe(6);
    expect(el.showThrough("missing")).toBeNull();
  });
});

describe("PapersList More toggle", () => {
  it("expands a clamped paper in place and collapses it again", async () => {
    const { PapersList } = await import("../src/widgets/papersList.js");
    const el = PapersList(
      [
        {
          id: "p",
          title: "T",
          abstract: "Long abstract",
          authors: [{ name: "A" }],
        },
      ],
      { tz: "US/Eastern" },
    );
    const row = el.querySelector(".paper");
    const more = row.querySelector(".paper-more");
    expect(more.textContent.trim()).toBe("More");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    more.click();
    expect(row.classList.contains("expanded")).toBe(true);
    expect(more.textContent.trim()).toBe("Less");
    expect(more.getAttribute("aria-expanded")).toBe("true");
    more.click();
    expect(row.classList.contains("expanded")).toBe(false);
  });
  it("offers More for a long author list without an abstract", async () => {
    const { PapersList } = await import("../src/widgets/papersList.js");
    const authors = Array.from({ length: 12 }, (_, i) => ({
      name: `Author Number ${i}`,
      affiliation: "Some University",
    }));
    const el = PapersList([{ id: "p", title: "T", authors }], {
      tz: "US/Eastern",
    });
    expect(el.querySelector(".paper-more")).not.toBeNull();
  });
  it("has no More toggle when there is nothing to expand", async () => {
    const { PapersList } = await import("../src/widgets/papersList.js");
    const el = PapersList([{ id: "p", title: "T" }], { tz: "US/Eastern" });
    expect(el.querySelector(".paper-more")).toBeNull();
  });
});

describe("PapersList title opens the app's details (John)", () => {
  it("links the title to the details view and calls onTitle on a plain click", async () => {
    const { PapersList } = await import("../src/widgets/papersList.js");
    const opened = [];
    const el = PapersList(
      [{ id: "p1", shortId: "s1", title: "T", url: "https://conf/p1" }],
      {
        tz: "US/Eastern",
        details: {
          href: (p) => `?paper=${p.shortId}`,
          open: (p) => opened.push(p.id),
        },
      },
    );
    document.body.append(el);
    const title = el.querySelector("a.title");
    expect(title.getAttribute("href")).toBe("?paper=s1");
    expect(title.hasAttribute("target")).toBe(false);
    expect(title.classList.contains("paper-details-open")).toBe(true);
    title.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    expect(opened).toEqual(["p1"]);
    // cmd/ctrl-click keeps the browser's open-in-new-tab
    const e = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      metaKey: true,
    });
    title.dispatchEvent(e);
    expect(opened).toEqual(["p1"]);
    expect(e.defaultPrevented).toBe(false);
    el.remove();
  });
  it("conferenceLink points to the paper's conference page in a new tab", async () => {
    const { conferenceLink } = await import("../src/widgets/papersList.js");
    const a = conferenceLink({ url: "https://conf/p1" });
    expect(a.getAttribute("href")).toBe("https://conf/p1");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.textContent).toContain("Conference page");
    expect(conferenceLink({})).toBe("");
  });
});
