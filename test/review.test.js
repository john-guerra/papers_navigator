import { describe, expect, it } from "vitest";
import {
  filterByRating,
  groupRows,
  includeCounts,
  ratingKey,
  reviewRows,
} from "../src/lib/review.js";

const paper = (id, extra = {}) => ({
  id,
  title: `Paper ${id}`,
  day: "2026-11-11",
  start: `2026-11-11T1${id.length}:00:00Z`,
  typeShort: "Full",
  ...extra,
});
const papers = [
  paper("a", {
    day: "2026-11-10",
    clusterLabel: "Color",
    awardTier: "best",
    sessionName: "S1",
  }),
  paper("b", { clusterLabel: "Color", sessionName: "S1" }),
  paper("c", { clusterLabel: "Text", sessionName: "S2" }),
  paper("d", { sessionName: "S2" }),
  paper("e"),
];
// a, b in My Papers (as resolveFollowed gives them)
const items = [
  { ...papers[0], manual: true, reasons: ["★ Rated"], ruleIds: [] },
  {
    ...papers[1],
    manual: false,
    reasons: ["👥 Friend: Ann"],
    ruleIds: ["author:ann"],
  },
];
const ctx = {
  ratings: { a: 5, c: 4 },
  disliked: { d: true },
  attended: {
    b: { at: "x", how: "auto" },
    e: { at: "x", how: "manual" },
    x: { off: true },
  },
};
const ids = (rows) => rows.map((r) => r.id);

describe("reviewRows (Stage E)", () => {
  it("is your list only by default", () => {
    expect(ids(reviewRows({ items, papers, ...ctx, include: {} }))).toEqual([
      "a",
      "b",
    ]);
  });
  it("includes rated or attended papers outside the list, and 👎 ones, on request; never twice", () => {
    const rows = reviewRows({
      items,
      papers,
      ...ctx,
      include: { ratedOrAttended: true, disliked: true },
    });
    expect(ids(rows)).toEqual(["a", "b", "c", "e", "d"]);
    expect(rows.filter((r) => r.notInMine).map((r) => r.id)).toEqual([
      "c",
      "e",
      "d",
    ]);
  });
  it("counts what each Include box would add", () => {
    expect(includeCounts({ items, papers, ...ctx })).toEqual({
      ratedOrAttended: 2,
      disliked: 1,
    });
  });
  it("with nothing in My Papers, the included papers still show", () => {
    expect(
      ids(
        reviewRows({
          items: [],
          papers,
          ...ctx,
          include: { ratedOrAttended: true },
        }),
      ),
    ).toEqual(["a", "b", "c", "e"]);
  });
});

describe("ratings (Stage E)", () => {
  it("ratingKey: stars, 👎 or none", () => {
    expect(ratingKey("a", ctx)).toBe("5");
    expect(ratingKey("d", ctx)).toBe("no");
    expect(ratingKey("e", ctx)).toBe("none");
  });
  it("filterByRating keeps any of the chosen keys; none chosen keeps all", () => {
    const rows = papers;
    expect(ids(filterByRating(rows, new Set(), ctx))).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
    expect(ids(filterByRating(rows, new Set(["5", "4"]), ctx))).toEqual([
      "a",
      "c",
    ]);
    expect(ids(filterByRating(rows, new Set(["no", "none"]), ctx))).toEqual([
      "b",
      "d",
      "e",
    ]);
  });
});

describe("groupRows (Stage E)", () => {
  const rows = reviewRows({
    items,
    papers,
    ...ctx,
    include: { ratedOrAttended: true, disliked: true },
  });
  const shape = (groups) => groups.map((g) => [g.label, ids(g.rows)]);
  it("none: one group", () => {
    expect(shape(groupRows(rows, "none", ctx))).toEqual([
      ["", ["a", "b", "c", "e", "d"]],
    ]);
  });
  it("day: in order", () => {
    expect(shape(groupRows(rows, "day", ctx))).toEqual([
      ["Tue Nov 10", ["a"]],
      ["Wed Nov 11", ["b", "c", "e", "d"]],
    ]);
  });
  it("rating: 5★ … 1★, 👎, Not rated", () => {
    expect(shape(groupRows(rows, "rating", ctx))).toEqual([
      ["5★", ["a"]],
      ["4★", ["c"]],
      ["👎 Not for me", ["d"]],
      ["Not rated", ["b", "e"]],
    ]);
  });
  it("attended, award, topic, session", () => {
    expect(shape(groupRows(rows, "attended", ctx))).toEqual([
      ["✓ Attended", ["b", "e"]],
      ["Not attended", ["a", "c", "d"]],
    ]);
    expect(shape(groupRows(rows, "award", ctx))).toEqual([
      ["🏆 Best", ["a"]],
      ["No award", ["b", "c", "e", "d"]],
    ]);
    // by count, then label; the empty group last
    expect(shape(groupRows(rows, "topic", ctx))).toEqual([
      ["Color", ["a", "b"]],
      ["Text", ["c"]],
      ["No topic", ["e", "d"]],
    ]);
    expect(shape(groupRows(rows, "session", ctx))).toEqual([
      ["S1", ["a", "b"]],
      ["S2", ["c", "d"]],
      ["No session", ["e"]],
    ]);
  });
  it("reason: your own reasons, rules, and Not in My Papers; unknown text is Added by hand", () => {
    const withOdd = [
      ...rows,
      {
        ...paper("z"),
        manual: true,
        reasons: ["something imported"],
        ruleIds: [],
      },
    ];
    // fixed order: your own reasons, then rules, then Not in My Papers
    expect(shape(groupRows(withOdd, "reason", ctx))).toEqual([
      ["★ Added by hand", ["z"]],
      ["★ Rated", ["a"]],
      ["👥 Friend: Ann", ["b"]],
      ["Not in My Papers", ["c", "e", "d"]],
    ]);
  });
});
