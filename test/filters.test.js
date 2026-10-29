import { describe, expect, it } from "vitest";
import { applyFilters, facetValues } from "../src/lib/filters.js";

const papers = [
  {
    id: "1",
    type: "full",
    authors: [{ name: "Ann", affiliation: "MIT" }],
    keywords: ["DR"],
    sessionName: "S1",
  },
  {
    id: "2",
    type: "short",
    authors: [
      { name: "Ann", affiliation: "Northeastern" },
      { name: "Bo", affiliation: "MIT" },
    ],
    keywords: ["LLM", "DR"],
    sessionName: "S2",
  },
  {
    id: "3",
    type: "full",
    authors: [{ name: "Cy", affiliation: "Stanford" }],
    keywords: [],
    sessionName: null,
  },
];

describe("facetValues", () => {
  it("counts a paper once per author", () => {
    expect(facetValues(papers, "authors")).toEqual([
      { value: "Ann", count: 2 },
      { value: "Bo", count: 1 },
      { value: "Cy", count: 1 },
    ]);
  });

  it("counts affiliations once per paper even with two authors from it", () => {
    const twoMit = [
      { authors: [{ affiliation: "MIT" }, { affiliation: "MIT" }] },
    ];
    expect(facetValues(twoMit, "affiliations")).toEqual([
      { value: "MIT", count: 1 },
    ]);
  });

  it("skips null values", () => {
    expect(facetValues(papers, "sessionName").map((d) => d.value)).toEqual([
      "S1",
      "S2",
    ]);
  });
});

describe("applyFilters", () => {
  it("ANDs across facets and ORs within one", () => {
    const result = applyFilters(papers, {
      types: ["full"],
      affiliations: ["MIT"],
    });
    expect(result.map((d) => d.id)).toEqual(["1"]);
    const either = applyFilters(papers, {
      affiliations: ["Stanford", "Northeastern"],
    });
    expect(either.map((d) => d.id)).toEqual(["2", "3"]);
  });

  it("treats empty or missing facets as no filter", () => {
    expect(applyFilters(papers, {})).toHaveLength(3);
    expect(
      applyFilters(papers, { types: [], keywords: ["DR"] }).map((d) => d.id),
    ).toEqual(["1", "2"]);
  });
});

describe("typeNames", () => {
  it("uses the label when a type has one, the override or the type otherwise", async () => {
    const { typeNames } = await import("../src/lib/filters.js");
    const names = typeNames(
      [
        { type: "full", typeLabel: "Full VIS Paper" },
        { type: "workshop", typeLabel: "BELIV Workshop Paper" },
        { type: "workshop", typeLabel: "EduVis Workshop Paper" },
        { type: "panel", typeLabel: "Panel A" },
        { type: "panel", typeLabel: "Panel B" },
      ],
      { workshop: "Workshop Paper" },
    );
    expect(names.get("full")).toBe("Full VIS Paper");
    expect(names.get("workshop")).toBe("Workshop Paper");
    expect(names.get("panel")).toBe("panel");
  });
});
