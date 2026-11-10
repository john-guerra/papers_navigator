// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderReviewList } from "../src/components/reviewList.js";

describe("renderReviewList (Stage E)", () => {
  const p = (id, extra = {}) => ({
    id,
    shortId: `s-${id}`,
    title: `Paper ${id}`,
    authors: [{ name: `A ${id}` }],
    typeShort: "Full",
    typeColor: "full",
    ...extra,
  });
  const groups = [
    {
      key: "2026-11-10",
      label: "Tue Nov 10",
      rows: [p("a", { reasons: ["★ Rated"], manual: true, notInMine: false })],
    },
    {
      key: "2026-11-11",
      label: "Wed Nov 11",
      rows: [p("c", { notInMine: true })],
    },
  ];
  const render = (options = {}) =>
    renderReviewList(groups, {
      tz: "US/Eastern",
      inMyPapers: (id) => id === "a",
      onToggle: vi.fn(),
      onOpen: vi.fn(),
      detailsHref: (x) => `?paper=${x.shortId}`,
      ...options,
    });

  it("folds each group with its label and count", () => {
    const el = render();
    const heads = [
      ...el.querySelectorAll("details.review-group-box > summary"),
    ].map((s) => s.textContent.trim().replace(/\s+/g, " "));
    expect(heads).toEqual(["Tue Nov 10 (1)", "Wed Nov 11 (1)"]);
    expect(
      [...el.querySelectorAll("details.review-group-box")].every((d) => d.open),
    ).toBe(true);
  });

  it("rows are paper rows with reason chips or Not in My Papers, and the My Papers toggle", () => {
    const onToggle = vi.fn();
    const el = render({ onToggle });
    const a = el.querySelector('li.paper[data-paper-id="a"]');
    expect(a.textContent).toContain("★ Rated");
    expect(a.querySelector(".follow-toggle").textContent).toContain(
      "In My Papers",
    );
    const c = el.querySelector('li.paper[data-paper-id="c"]');
    expect(c.querySelector(".not-in-mine").textContent).toBe(
      "Not in My Papers",
    );
    expect(c.querySelector(".follow-toggle").textContent).toContain(
      "Add to My Papers",
    );
    c.querySelector(".follow-toggle").click();
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: "c" }));
  });

  it("no wrapper when not grouped", () => {
    const el = renderReviewList(
      [{ key: "", label: "", rows: groups[0].rows }],
      {
        tz: "US/Eastern",
        inMyPapers: () => true,
        onToggle: vi.fn(),
        onOpen: vi.fn(),
        detailsHref: () => "#",
      },
    );
    expect(el.querySelector("details")).toBeNull();
    expect(el.querySelectorAll("li.paper")).toHaveLength(1);
  });
});

describe("review rows keep New and Added (review fix)", () => {
  it("shows the New badge and the Added date for papers in My Papers", () => {
    const row = {
      id: "n",
      shortId: "s-n",
      title: "N",
      authors: [],
      typeShort: "Full",
      reasons: ["👥 Ann"],
      new: true,
      addedOn: "2026-11-10T12:00:00Z",
      notInMine: false,
    };
    const el = renderReviewList([{ key: "", label: "", rows: [row] }], {
      tz: "US/Eastern",
      inMyPapers: () => true,
      onToggle: vi.fn(),
      onOpen: vi.fn(),
      detailsHref: () => "#",
    });
    const li = el.querySelector("li.paper");
    expect(li.querySelector(".new-badge").textContent).toBe("New");
    expect(li.textContent).toContain("Added ");
  });
});
