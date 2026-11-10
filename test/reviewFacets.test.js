// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  REVIEW_DEFAULT,
  listFromStorage,
  reviewFacets,
  reviewRows,
} from "../src/lib/review.js";
import { facetFilter, facetStrip } from "../src/widgets/facetStrip.js";

const papers = [
  {
    id: "a",
    day: "2026-11-11",
    typeShort: "Full",
    awardTier: "best",
    clusterLabel: "Color",
    sessionName: "S1",
  },
  { id: "b", day: "2026-11-11", typeShort: "Short" },
  { id: "c", day: "2026-11-12", typeShort: "Full" },
  { id: "d", day: "2026-11-12", typeShort: "Full" },
];
const ctx = {
  ratings: { a: 5, c: 4 },
  disliked: { d: true },
  attended: { b: { at: "x", how: "auto" } },
};
const universe = reviewRows({
  items: [papers[0], papers[1]],
  papers,
  ...ctx,
  include: { ratedOrAttended: true, disliked: true },
});

describe("review facets (facet strip on My Papers)", () => {
  it("each row knows its list: mine, rated or attended outside, or 👎", () => {
    expect(universe.map((r) => [r.id, r.list])).toEqual([
      ["a", "mine"],
      ["b", "mine"],
      ["c", "rated"],
      ["d", "disliked"],
    ]);
  });
  it("the default shows only your list", () => {
    const facets = reviewFacets(ctx);
    expect(
      facetFilter(universe, facets, REVIEW_DEFAULT).map((r) => r.id),
    ).toEqual(["a", "b"]);
  });
  it("Rating, Attended, Day, Type, Award, Topic, Session filter by the paper's values", () => {
    const facets = reviewFacets(ctx);
    const pick = (value) =>
      facetFilter(universe, facets, value).map((r) => r.id);
    expect(pick({ rating: ["5", "4"] })).toEqual(["a", "c"]);
    expect(pick({ rating: ["no"] })).toEqual(["d"]);
    expect(pick({ rating: ["none"] })).toEqual(["b"]);
    expect(pick({ attended: ["yes"] })).toEqual(["b"]);
    expect(pick({ days: ["2026-11-12"] })).toEqual(["c", "d"]);
    expect(pick({ types: ["Short"] })).toEqual(["b"]);
    expect(pick({ awards: ["best"] })).toEqual(["a"]);
    expect(pick({ topics: ["Color"] })).toEqual(["a"]);
    expect(pick({ sessions: ["S1"] })).toEqual(["a"]);
    expect(facets.map((f) => f.label)).toEqual([
      "List",
      "Rating",
      "Attended",
      "Day",
      "Type",
      "Award",
      "Topic",
      "Session",
    ]);
  });
  it("labels and orders Rating and List in a fixed order", () => {
    const [list, rating] = reviewFacets(ctx);
    expect(["disliked", "mine", "rated"].map(list.format)).toEqual([
      "👎 Not for me",
      "In My Papers",
      "Rated or attended, not in My Papers",
    ]);
    const order = ["none", "no", "1", "5"]
      .map((value) => ({ value }))
      .sort(rating.sort)
      .map((d) => d.value);
    expect(order).toEqual(["5", "1", "no", "none"]);
    expect(rating.format("4")).toBe("4★");
  });
  it("works in the facet strip, starting at your list", () => {
    const el = facetStrip(universe, {
      facets: reviewFacets(ctx),
      value: REVIEW_DEFAULT,
      defaultValue: REVIEW_DEFAULT,
    });
    document.body.append(el);
    expect(el.value.list).toEqual(["mine"]);
    el.remove();
  });
  it("reads the remembered list, old Include format too", () => {
    expect(listFromStorage(null)).toEqual(["mine"]);
    expect(listFromStorage(["mine", "rated"])).toEqual(["mine", "rated"]);
    expect(listFromStorage({ ratedOrAttended: true, disliked: false })).toEqual(
      ["mine", "rated"],
    );
    expect(listFromStorage(["bogus"])).toEqual(["mine"]);
  });
});
