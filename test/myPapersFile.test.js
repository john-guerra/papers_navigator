import { describe, expect, it } from "vitest";
import {
  exportMyPapers,
  exportNote,
  parseMyPapersFile,
} from "../src/lib/myPapersFile.js";

const followed = [
  { id: "a", reason: "r", addedOn: "2026-10-30T00:00:00.000Z" },
];
const rules = [
  {
    id: "author:ann",
    type: "author",
    value: "Ann",
    addedOn: "2026-10-30T00:00:00.000Z",
  },
];

describe("My Papers file", () => {
  it("exports hand-added papers, rules and exceptions together", () => {
    const parsed = JSON.parse(
      exportMyPapers({ followed, rules, exceptions: ["x"] }),
    );
    expect(parsed).toEqual({
      version: 2,
      followed,
      rules,
      exceptions: ["x"],
      notes: {},
      ratings: {},
    });
  });
  it("reads the new format and the old plain list", () => {
    expect(
      parseMyPapersFile(exportMyPapers({ followed, rules, exceptions: [] })),
    ).toEqual({ followed, rules, exceptions: [], notes: {}, ratings: {} });
    expect(parseMyPapersFile(JSON.stringify(followed))).toEqual({
      followed,
      rules: [],
      exceptions: [],
      notes: {},
      ratings: {},
    });
  });
  it("rejects files that are not My Papers", () => {
    expect(() => parseMyPapersFile("{}")).toThrow();
    expect(() => parseMyPapersFile("not json")).toThrow();
  });
});

describe("parseMyPapersFile validates entries (#65 review)", () => {
  it("rejects a list whose entries aren't papers", () => {
    expect(() => parseMyPapersFile("[{}]")).toThrow();
    expect(() =>
      parseMyPapersFile(
        JSON.stringify({ version: 2, followed: [{ nope: 1 }] }),
      ),
    ).toThrow();
  });
});

describe("My Papers file with research topics (#24)", () => {
  it("keeps a topic's level, threshold and cached matches", () => {
    const topic = {
      id: "topic:llm",
      type: "topic",
      value: "llm",
      level: "good",
      threshold: 0.3,
      matches: { a: 0.5 },
      evaluatedOn: "2026-10-30T00:00:00.000Z",
      addedOn: "2026-10-30T00:00:00.000Z",
    };
    const text = exportMyPapers({ followed, rules: [topic], exceptions: [] });
    expect(parseMyPapersFile(text).rules).toEqual([topic]);
  });
});

describe("exportNote", () => {
  it("says the file includes the abstracts of My research topics, only when there are some", () => {
    expect(exportNote(rules)).toBe("");
    const mine = { type: "topic", value: "Mine", research: ["A"] };
    expect(exportNote([...rules, mine])).toBe(
      "Includes the abstracts of your research topics",
    );
  });
});

describe("My Papers file with notes (#152)", () => {
  it("exports notes on any paper and reads them back, cleaned", () => {
    const notes = { a: "Ask about the study", z: "Not in My Papers" };
    const text = exportMyPapers({ followed, rules, exceptions: [], notes });
    expect(JSON.parse(text).notes).toEqual(notes);
    expect(parseMyPapersFile(text).notes).toEqual(notes);
    expect(
      parseMyPapersFile(
        JSON.stringify({
          version: 2,
          followed,
          notes: { a: " x ", b: 1, c: "" },
        }),
      ).notes,
    ).toEqual({ a: "x" });
  });
  it("reads a notes-only file (notes on papers not in My Papers)", () => {
    expect(
      parseMyPapersFile(
        JSON.stringify({ version: 2, followed: [], notes: { z: "n" } }),
      ),
    ).toMatchObject({ followed: [], notes: { z: "n" } });
  });
});

describe("exportNote with notes (#152)", () => {
  it("says the file includes your notes", () => {
    const mine = { type: "topic", value: "Mine", research: ["A"] };
    expect(exportNote(rules, { a: "x" })).toBe("Includes your notes");
    expect(exportNote([mine], { a: "x" })).toBe(
      "Includes your notes and the abstracts of your research topics",
    );
    expect(exportNote(rules, {})).toBe("");
  });
});

describe("ratings in the My Papers file (#203 Stage B)", () => {
  it("round-trips ratings", () => {
    const text = exportMyPapers({ followed: [], ratings: { a: 4 } });
    expect(JSON.parse(text).ratings).toEqual({ a: 4 });
    expect(parseMyPapersFile(text).ratings).toEqual({ a: 4 });
  });

  it("drops bad ratings and keeps the rest of the import", () => {
    const parsed = parseMyPapersFile(
      JSON.stringify({
        version: 2,
        followed: [{ id: "p" }],
        ratings: { x: 6, y: 3, z: "5", w: { n: 1 } },
      }),
    );
    expect(parsed.ratings).toEqual({ y: 3 });
    expect(parsed.followed).toEqual([{ id: "p" }]);
  });

  it("old files have no ratings", () => {
    expect(parseMyPapersFile(JSON.stringify([{ id: "p" }])).ratings).toEqual(
      {},
    );
    expect(
      parseMyPapersFile(JSON.stringify({ followed: [{ id: "p" }] })).ratings,
    ).toEqual({});
  });

  it("the export note mentions ratings", () => {
    expect(exportNote([], {}, { a: 1 })).toBe("Includes your ratings");
    expect(exportNote([], { a: "x" }, { a: 1 })).toBe(
      "Includes your notes and your ratings",
    );
  });
});
