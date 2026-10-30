import { describe, expect, it } from "vitest";
import {
  authorUrl,
  buildAuthorIndex,
  coauthors,
  conflictsWithMyPapers,
  daySummary,
  daySummaryText,
  distinctAffiliations,
  filterAuthors,
  findAuthor,
  nextPresentation,
  normalizeName,
  topics,
} from "../src/lib/authors.js";
import { matches, normalizeRule } from "../src/lib/rules.js";

const tz = "US/Eastern";
const papers = [
  {
    id: "p1",
    type: "full",
    title: "Maps",
    authors: [
      { name: "Ann Lee", affiliation: "MIT" },
      { name: "Bo Chen", affiliation: "ETH Zürich" },
    ],
    keywords: ["Maps", "Color"],
    clusterLabel: "maps, geo",
    sessionId: "s1",
    sessionName: "Geo",
    // Tue Nov 10, 10:00–10:15 ET
    start: "2026-11-10T15:00:00Z",
    end: "2026-11-10T15:15:00Z",
  },
  {
    id: "p2",
    type: "poster",
    title: "Posters",
    authors: [
      { name: "ann  LEE", affiliation: "Harvard" },
      { name: "Cy Diaz", affiliation: "MIT" },
    ],
    keywords: ["Color"],
    clusterLabel: "maps, geo",
  },
  {
    id: "p3",
    type: "workshop",
    title: "Charts",
    authors: [
      { name: "Ann Lee", affiliation: "MIT" },
      { name: "Bo Chen", affiliation: "ETH Zurich" },
    ],
    keywords: [],
    sessionId: "s2",
    sessionName: "Workshop",
    // session only: Thu Nov 12, 09:00–12:00 ET
    sessionStart: "2026-11-12T14:00:00Z",
    sessionEnd: "2026-11-12T17:00:00Z",
  },
];

describe("normalizeName", () => {
  it("is compatibility-normalized, case-folded and whitespace-collapsed", () => {
    expect(normalizeName("  Ann   LEE ")).toBe("ann lee");
    expect(normalizeName("Ａnn Lee")).toBe("ann lee");
    expect(normalizeName(null)).toBe("");
  });
  it("ignores accents, like author watch rules", () => {
    expect(normalizeName("José Núñez")).toBe(normalizeName("Jose Nunez"));
  });
});

describe("profile and Watch rule agree (#78)", () => {
  it("groups exactly the papers the author's Watch rule matches", () => {
    const program = [
      { id: "a", authors: [{ name: "José Núñez" }] },
      { id: "b", authors: [{ name: "Jose Nunez" }] },
      { id: "c", authors: [{ name: "Josefa N" }] },
    ];
    const index = buildAuthorIndex(program);
    expect(index).toHaveLength(2);
    const profile = findAuthor(index, "Jose Nunez");
    const rule = normalizeRule({ type: "author", value: profile.name });
    expect(profile.papers.map((p) => p.id)).toEqual(
      program.filter((p) => matches(rule, p)).map((p) => p.id),
    );
  });
});

describe("buildAuthorIndex", () => {
  const index = buildAuthorIndex(papers);
  it("merges spellings by normalized name, sorted by paper count then name", () => {
    expect(index.map((a) => a.key)).toEqual(["ann lee", "bo chen", "cy diaz"]);
    const ann = index[0];
    expect(ann.name).toBe("Ann Lee");
    expect(ann.papers.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });
  it("lists affiliations as written, with counts (most first)", () => {
    expect(index[0].affiliations).toEqual([
      { value: "MIT", count: 2 },
      { value: "Harvard", count: 1 },
    ]);
    expect(index[1].affiliations.map((a) => a.value)).toEqual([
      "ETH Zurich",
      "ETH Zürich",
    ]);
  });
  it("counts a paper once even if the author is listed twice", () => {
    const twice = [{ id: "x", authors: [{ name: "A" }, { name: "a" }] }];
    expect(buildAuthorIndex(twice)[0].papers).toHaveLength(1);
  });
  it("findAuthor looks up by any spelling", () => {
    expect(findAuthor(index, "ANN lee")?.key).toBe("ann lee");
    expect(findAuthor(index, "Nobody")).toBeNull();
  });
});

describe("filterAuthors", () => {
  const index = buildAuthorIndex(papers);
  it("matches every term against name and affiliations", () => {
    expect(filterAuthors(index, "mit").map((a) => a.key)).toEqual([
      "ann lee",
      "cy diaz",
    ]);
    expect(filterAuthors(index, "lee harvard").map((a) => a.key)).toEqual([
      "ann lee",
    ]);
    expect(filterAuthors(index, "zurich").map((a) => a.key)).toEqual([
      "bo chen",
    ]);
    expect(filterAuthors(index, "")).toHaveLength(3);
  });
});

describe("authorUrl", () => {
  it("links to authors.html with the name encoded", () => {
    expect(authorUrl("Ann Lee & Co")).toBe(
      "./authors.html?name=Ann+Lee+%26+Co",
    );
  });
});

describe("daySummary", () => {
  it("groups by conference day with talks and posters, counting untimed ones", () => {
    const summary = daySummary(papers, tz);
    expect(summary).toEqual({
      days: [
        {
          key: "2026-11-10",
          label: "Tue",
          kinds: [{ kind: "talk", count: 1 }],
        },
        {
          key: "2026-11-12",
          label: "Thu",
          kinds: [{ kind: "talk", count: 1 }],
        },
      ],
      untimed: [{ kind: "poster", count: 1 }],
    });
    expect(daySummaryText(summary)).toBe(
      "Tue 1 talk · Thu 1 talk · 1 poster without a time",
    );
  });
  it("uses the conference day: 02:00Z belongs to the previous Eastern day", () => {
    const late = [{ id: "n", type: "full", start: "2026-11-11T02:00:00Z" }];
    expect(daySummary(late, tz).days).toEqual([
      { key: "2026-11-10", label: "Tue", kinds: [{ kind: "talk", count: 1 }] },
    ]);
    expect(
      nextPresentation(late, new Date("2026-11-10T12:00:00Z"), tz).label,
    ).toBe("Tue Nov 10 21:00");
  });
  it("pluralizes", () => {
    const two = [papers[0], { ...papers[0], id: "q" }];
    expect(daySummaryText(daySummary(two, tz))).toBe("Tue 2 talks");
  });
});

describe("nextPresentation", () => {
  it("returns the next timed paper after now (conference timezone)", () => {
    const next = nextPresentation(papers, new Date("2026-11-09T12:00:00Z"), tz);
    expect(next.paper.id).toBe("p1");
    expect(next.label).toBe("Tue Nov 10 10:00");
    expect(next.live).toBe(false);
  });
  it("marks one in progress as live", () => {
    const next = nextPresentation(papers, new Date("2026-11-12T15:00:00Z"), tz);
    expect(next.paper.id).toBe("p3");
    expect(next.live).toBe(true);
  });
  it("is null when everything is over or untimed", () => {
    expect(
      nextPresentation(papers, new Date("2026-11-20T00:00:00Z"), tz),
    ).toBeNull();
  });
});

describe("topics", () => {
  it("counts map topics and keywords, most first", () => {
    expect(topics(papers)).toEqual({
      topics: [{ value: "maps, geo", count: 2 }],
      keywords: [
        { value: "Color", count: 2 },
        { value: "Maps", count: 1 },
      ],
    });
  });
});

describe("coauthors", () => {
  it("counts co-authors (not the author), most frequent spelling, most first", () => {
    const ann = buildAuthorIndex(papers)[0];
    expect(coauthors(ann)).toEqual([
      { key: "bo chen", name: "Bo Chen", count: 2 },
      { key: "cy diaz", name: "Cy Diaz", count: 1 },
    ]);
    expect(coauthors(ann, { limit: 1 })).toHaveLength(1);
  });
});

describe("conflictsWithMyPapers", () => {
  const mine = [
    // overlaps p1 (other session)
    {
      id: "m1",
      title: "Other",
      sessionId: "s9",
      start: "2026-11-10T15:10:00Z",
      end: "2026-11-10T15:30:00Z",
    },
    // same session as p1: not a conflict
    {
      id: "m2",
      title: "Same session",
      sessionId: "s1",
      start: "2026-11-10T15:05:00Z",
      end: "2026-11-10T15:20:00Z",
    },
    // after p1
    {
      id: "m3",
      title: "Later",
      sessionId: "s8",
      start: "2026-11-10T15:15:00Z",
      end: "2026-11-10T15:30:00Z",
    },
    // p1 itself
    papers[0],
  ];
  it("maps each paper to the My Papers papers overlapping it in other sessions", () => {
    const conflicts = conflictsWithMyPapers(papers, mine);
    expect(conflicts.get("p1").map((p) => p.id)).toEqual(["m1"]);
    expect(conflicts.has("p2")).toBe(false);
    expect(conflicts.has("p3")).toBe(false);
  });
});

describe("distinctAffiliations", () => {
  const list = (...values) => values.map((value) => ({ value, count: 1 }));
  it("ignores case, accents and punctuation", () => {
    expect(
      distinctAffiliations(list("ETH Zürich", "ETH Zurich", "eth-zurich")),
    ).toBe(1);
    expect(distinctAffiliations(list("MIT", "Harvard"))).toBe(2);
  });
});
