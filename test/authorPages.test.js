// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { buildAuthorIndex } from "../src/lib/authors.js";
import {
  renderAuthorIndex,
  renderAuthorNotFound,
  renderAuthorProfile,
} from "../src/components/authorPages.js";

const tz = "US/Eastern";
const papers = [
  {
    id: "p1",
    type: "full",
    title: "Maps",
    room: "Hall A",
    authors: [
      { name: "Ann Lee", affiliation: "MIT" },
      { name: "Bo Chen", affiliation: "ETH" },
    ],
    keywords: ["Color"],
    clusterLabel: "maps, geo",
    sessionId: "s1",
    start: "2026-11-10T15:00:00Z",
    end: "2026-11-10T15:15:00Z",
  },
  {
    id: "p2",
    type: "poster",
    title: "Posters",
    authors: [{ name: "Ann Lee", affiliation: "Harvard" }],
  },
  ...Array.from({ length: 150 }, (_, i) => ({
    id: `x${i}`,
    title: `X${i}`,
    authors: [{ name: `Person ${i}`, affiliation: i % 2 ? "Odd U" : "Even U" }],
  })),
];
const other = {
  id: "m1",
  title: "Other talk",
  sessionId: "s9",
  start: "2026-11-10T15:05:00Z",
  end: "2026-11-10T15:20:00Z",
};
const index = buildAuthorIndex(papers);

describe("renderAuthorIndex (#78)", () => {
  it("lists researchers, most papers first, with Show more and a search", () => {
    const el = renderAuthorIndex(index);
    document.body.append(el);
    const rows = el.querySelectorAll(".author-row");
    expect(rows).toHaveLength(100);
    expect(rows[0].textContent).toContain("Ann Lee");
    expect(rows[0].textContent).toContain("2 papers");
    expect(rows[0].querySelector("a").getAttribute("href")).toBe(
      "./authors.html?name=Ann+Lee",
    );
    el.querySelector(".papers-more button").click();
    expect(el.querySelectorAll(".author-row")).toHaveLength(152);
    const input = el.querySelector("input");
    input.value = "harvard";
    input.dispatchEvent(new Event("input"));
    expect(
      [...el.querySelectorAll(".author-name")].map((a) => a.textContent),
    ).toEqual(["Ann Lee"]);
    expect(el.textContent).toContain("1 researcher match");
    el.remove();
  });

  it("keeps the search in the state it's given", () => {
    const state = { query: "odd" };
    const el = renderAuthorIndex(index, { state });
    expect(el.querySelectorAll(".author-row")).toHaveLength(75);
  });
});

describe("renderAuthorNotFound", () => {
  it("links back to the index", () => {
    const el = renderAuthorNotFound("Nobody");
    expect(el.textContent).toContain("Nobody");
    expect(el.querySelector('a[href="./authors.html"]')).not.toBeNull();
  });
});

describe("renderAuthorProfile (#78)", () => {
  const setup = (mine = []) => {
    let myPapers = mine;
    const handlers = {
      onToggle: vi.fn(),
      onAddAll: vi.fn(),
      onDetails: vi.fn(),
    };
    const el = renderAuthorProfile(index[0], {
      tz,
      tzLabel: "ET",
      now: new Date("2026-11-09T12:00:00Z"),
      myPapers: () => myPapers,
      inMyPapers: (id) => myPapers.some((d) => d.id === id),
      ...handlers,
    });
    document.body.append(el);
    return { el, ...handlers, set: (list) => (myPapers = list) };
  };

  it("shows affiliations, when they present, topics, co-authors and papers", () => {
    const { el } = setup();
    const text = el.textContent.replace(/\s+/g, " ");
    expect(text).toContain("Ann Lee");
    expect(text).toContain("Harvard (1) · MIT (1)");
    expect(text).toContain("may be more than one person");
    expect(text).toContain("2 papers · Tue 1 talk · 1 poster without a time");
    expect(text).toContain("Next Tue Nov 10 10:00 ET · 📍 Hall A · Maps");
    expect(text).toContain("maps, geo");
    expect(text).toContain("Color");
    expect(el.querySelector(".author-coauthors a").getAttribute("href")).toBe(
      "./authors.html?name=Bo+Chen",
    );
    expect(el.querySelectorAll(".paper")).toHaveLength(2);
    // co-author names in the paper rows link to their profiles too
    expect(el.querySelector(".paper .author-link")).not.toBeNull();
  });

  it("adds all with one button and reflects My Papers in place, with conflicts", () => {
    const { el, onAddAll, set } = setup([other]);
    const add = el.querySelector(".author-add button");
    expect(add.textContent.trim()).toBe("Add 2 to My Papers");
    expect(el.textContent).toContain(
      "⚠ Same time as “Other talk” in My Papers",
    );
    add.click();
    expect(onAddAll.mock.calls[0][0].map((p) => p.id)).toEqual(["p1", "p2"]);
    set([papers[0], papers[1]]);
    el.update();
    const button = el.querySelector(".author-add button");
    expect(button.textContent.trim()).toBe("✓ All 2 in My Papers");
    expect(button.disabled).toBe(true);
    expect(el.textContent).not.toContain("⚠");
    expect(
      el.querySelector(".follow-toggle").getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("opens details from the next presentation and from rows", () => {
    const { el, onDetails } = setup();
    el.querySelector(".author-next-open").click();
    el.querySelector(".paper-details-open").click();
    expect(onDetails).toHaveBeenCalledTimes(2);
    expect(onDetails.mock.calls[0][0].id).toBe("p1");
  });

  it("lists papers like theirs once they load, with toggles that follow My Papers (#150)", async () => {
    const index = buildAuthorIndex(papers);
    const ann = index.find((a) => a.name === "Ann Lee");
    const like = Array.from({ length: 8 }, (_, i) => ({
      ...papers[2 + i],
      score: 0.8 - i / 100,
      because: papers[0],
    }));
    let mine = new Set(["x1"]);
    const onToggle = vi.fn();
    const el = renderAuthorProfile(ann, {
      tz,
      inMyPapers: (id) => mine.has(id),
      onToggle,
      onAddAll: () => {},
      onDetails: () => {},
      similar: () => Promise.resolve(like),
    });
    document.body.append(el);
    const section = el.querySelector(".author-like-theirs");
    expect(section.querySelector("h2").textContent).toBe("Papers like theirs");
    expect(section.textContent).toContain("Finding papers like theirs…");
    await new Promise((r) => setTimeout(r));
    const rows = section.querySelectorAll(".recommended-paper");
    expect(rows).toHaveLength(5);
    expect(rows[0].textContent).toContain("80% similar");
    expect(rows[0].textContent).toContain("Like Maps");
    expect(section.querySelector(".recommended-dismiss")).toBeNull();
    const toggle = rows[1].querySelector(".follow-toggle");
    expect(toggle.getAttribute("aria-pressed")).toBe("true"); // x1 is in My Papers
    toggle.click();
    expect(onToggle).toHaveBeenCalledWith(like[1]);
    mine = new Set();
    el.update();
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    section.querySelector(".recommended-more").click();
    expect(section.querySelectorAll(".recommended-paper")).toHaveLength(8);
    el.remove();
  });

  it("offers Try again when the embeddings can't load (#150)", async () => {
    const index = buildAuthorIndex(papers);
    const ann = index.find((a) => a.name === "Ann Lee");
    const similar = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([]);
    const el = renderAuthorProfile(ann, {
      tz,
      inMyPapers: () => false,
      onToggle: () => {},
      onAddAll: () => {},
      onDetails: () => {},
      similar,
    });
    document.body.append(el);
    await new Promise((r) => setTimeout(r));
    el.querySelector(".author-like-theirs .recommended-retry").click();
    await new Promise((r) => setTimeout(r));
    expect(similar).toHaveBeenCalledTimes(2);
    expect(el.querySelector(".author-like-theirs").textContent).toContain(
      "No similar papers",
    );
    el.remove();
  });

  it("has no Papers like theirs section without a source", () => {
    const ann = buildAuthorIndex(papers).find((a) => a.name === "Ann Lee");
    const el = renderAuthorProfile(ann, {
      tz,
      inMyPapers: () => false,
      onToggle: () => {},
      onAddAll: () => {},
      onDetails: () => {},
    });
    expect(el.querySelector(".author-like-theirs")).toBeNull();
  });
});
