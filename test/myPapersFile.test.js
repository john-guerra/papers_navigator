import { describe, expect, it } from "vitest";
import { exportMyPapers, parseMyPapersFile } from "../src/lib/myPapersFile.js";

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
    expect(parsed).toEqual({ version: 2, followed, rules, exceptions: ["x"] });
  });
  it("reads the new format and the old plain list", () => {
    expect(
      parseMyPapersFile(exportMyPapers({ followed, rules, exceptions: [] })),
    ).toEqual({ followed, rules, exceptions: [] });
    expect(parseMyPapersFile(JSON.stringify(followed))).toEqual({
      followed,
      rules: [],
      exceptions: [],
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
