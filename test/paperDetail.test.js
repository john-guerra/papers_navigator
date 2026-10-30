// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { relatedPapers } from "../src/lib/search.js";
import { renderPaperDetail } from "../src/components/paperDetail.js";

const DIMS = 3;
// unit vectors: a ~ b, c orthogonal
const vectors = [
  [1, 0, 0],
  [0.9, 0.436, 0],
  [0, 0, 1],
  [0.6, 0.8, 0],
];
const matrix = new Float32Array(vectors.flat());
const papers = ["a", "b", "c", "d"].map((id) => ({
  id,
  shortId: id,
  title: `Paper ${id}`,
}));

describe("relatedPapers", () => {
  it("ranks the other papers by cosine similarity, excluding the paper itself", () => {
    const related = relatedPapers("a", matrix, papers, { k: 2, dims: DIMS });
    expect(related.map((p) => p.id)).toEqual(["b", "d"]);
    expect(related[0].score).toBeCloseTo(0.9);
  });
  it("returns [] for an unknown paper", () => {
    expect(relatedPapers("zz", matrix, papers, { dims: DIMS })).toEqual([]);
  });
});

describe("renderPaperDetail", () => {
  const paper = {
    id: "a",
    title: "Paper a",
    abstract: "About <b>things</b>",
    authors: [{ name: "Ann", affiliation: "MIT" }],
    typeLabel: "Full VIS Paper",
    sessionName: "S1",
    room: "Room 1",
    start: "2026-11-10T15:00:00Z",
    url: "https://example.org/a",
    links: [{ label: "Preprint PDF", url: "https://example.org/a.pdf" }],
  };
  const setup = (overrides = {}) => {
    const handlers = {
      onToggle: vi.fn(),
      onOpen: vi.fn(),
      onClose: vi.fn(),
      inMyPapers: () => false,
    };
    const el = renderPaperDetail(paper, {
      tz: "US/Eastern",
      related: [{ ...papers[1], score: 0.9, room: "Room 2" }],
      ...handlers,
      ...overrides,
    });
    document.body.append(el);
    return { el, ...handlers };
  };
  it("shows the paper's details, escaped, with its links", () => {
    const { el } = setup();
    const text = el.textContent.replace(/\s+/g, " ");
    expect(text).toContain("Paper a");
    expect(text).toContain("Ann (MIT)");
    expect(text).toContain("Room 1");
    expect(text).toContain("Tue Nov 10 10:00");
    expect(el.querySelector(".paper-detail-abstract").innerHTML).not.toContain(
      "<b>",
    );
    expect(
      el.querySelector('a[href="https://example.org/a.pdf"]'),
    ).not.toBeNull();
    el.remove();
  });
  it("lists related papers that open their own details, and toggles My Papers", () => {
    const { el, onOpen, onToggle, onClose } = setup();
    expect(el.textContent).toContain("Related papers");
    el.querySelector(".related-paper .related-open").click();
    expect(onOpen).toHaveBeenCalledWith("b");
    el.querySelector(".paper-detail-header .follow-toggle").click();
    expect(onToggle).toHaveBeenCalledWith(paper);
    el.querySelector(".paper-detail-close").click();
    expect(onClose).toHaveBeenCalled();
    el.remove();
  });
});

describe("renderPaperDetail update (#66 review)", () => {
  it("updates its toggles in place, so the panel keeps its scroll and node", () => {
    const mine = new Set();
    const el = renderPaperDetail(
      { id: "a", title: "A" },
      {
        tz: "US/Eastern",
        related: [{ id: "b", title: "B", score: 0.5 }],
        inMyPapers: (id) => mine.has(id),
        onToggle() {},
        onOpen() {},
        onClose() {},
      },
    );
    const toggles = () =>
      [...el.querySelectorAll(".follow-toggle")].map((b) =>
        b.getAttribute("aria-pressed"),
      );
    expect(toggles()).toEqual(["false", "false"]);
    mine.add("b");
    el.update();
    expect(toggles()).toEqual(["false", "true"]);
    expect(el.querySelectorAll(".follow-toggle")[1].textContent).toContain(
      "In My Papers",
    );
  });
});
