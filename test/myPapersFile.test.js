import { describe, expect, it } from "vitest";
import {
  exportMyPapers,
  exportNote,
  parseMyPapersFile,
  deviceLabel,
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
      disliked: {},
      attended: {},
    });
  });
  it("reads the new format and the old plain list", () => {
    expect(
      parseMyPapersFile(exportMyPapers({ followed, rules, exceptions: [] })),
    ).toEqual({
      followed,
      rules,
      exceptions: [],
      notes: {},
      ratings: {},
      disliked: {},
      attended: {},
    });
    expect(parseMyPapersFile(JSON.stringify(followed))).toEqual({
      followed,
      rules: [],
      exceptions: [],
      notes: {},
      ratings: {},
      disliked: {},
      attended: {},
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

describe("disliked and attended in the My Papers file (#208)", () => {
  it("round-trips and cleans them; old files have none", () => {
    const text = exportMyPapers({
      followed: [],
      disliked: { a: true },
      attended: { b: { at: "2026-11-11T15:00:00.000Z", how: "auto" } },
    });
    const parsed = parseMyPapersFile(text);
    expect(parsed.disliked).toEqual({ a: true });
    expect(parsed.attended).toEqual({
      b: { at: "2026-11-11T15:00:00.000Z", how: "auto" },
    });
    expect(parseMyPapersFile(JSON.stringify([{ id: "p" }])).attended).toEqual(
      {},
    );
    expect(
      parseMyPapersFile(JSON.stringify({ followed: [], disliked: { x: 2 } }))
        .disliked,
    ).toEqual({});
  });
});

describe("My Papers file v3", () => {
  const sync = {
    "followed/a": { v: { d1: 2 }, t: "2026-11-01T00:00:00.000Z", h: "x" },
    "note/a": {
      v: { d1: 1, d2: 3 },
      t: "2026-11-02T00:00:00.000Z",
      deleted: true,
    },
  };
  const state = { followed, notes: { a: "hi" } };
  const exp = (over) =>
    JSON.stringify({ version: 3, followed, device: "d1", sync: {}, ...over });

  it("round-trips versions without h", () => {
    const text = exportMyPapers(state, {
      device: "d1",
      deviceName: "Mac",
      sync,
    });
    const raw = JSON.parse(text);
    expect(raw.version).toBe(3);
    expect(raw.sync["followed/a"]).toEqual({
      v: { d1: 2 },
      t: sync["followed/a"].t,
    });
    const back = parseMyPapersFile(text);
    expect(back).toMatchObject({
      version: 3,
      device: "d1",
      deviceName: "Mac",
      notes: { a: "hi" },
    });
    expect(back.sync["note/a"]).toEqual(sync["note/a"]);
  });

  it("still writes v2 without sync", () => {
    expect(JSON.parse(exportMyPapers(state)).version).toBe(2);
    expect(parseMyPapersFile(exportMyPapers(state)).sync).toBeUndefined();
  });

  it("rejects a newer version with the exact message", () => {
    expect(() => parseMyPapersFile('{"version":4,"followed":[]}')).toThrow(
      "This file was made by a newer version of Papers Navigator. Reload the page and try again.",
    );
  });

  it("throws on truncated JSON", () => {
    expect(() => parseMyPapersFile('{"version":3,"foll')).toThrow();
  });

  it("parses v2 and plain lists as before", () => {
    expect(parseMyPapersFile(JSON.stringify(followed)).followed).toEqual(
      followed,
    );
    expect(
      parseMyPapersFile(JSON.stringify({ version: 2, followed })).sync,
    ).toBeUndefined();
  });

  const damaged = "This file's change history is damaged.";
  const t = "2026-11-01T00:00:00.000Z";
  it.each([
    ["array sync", []],
    ["string sync", "x"],
    ["record not object", { "followed/a": 1 }],
    ["missing v", { "followed/a": { t } }],
    ["missing t", { "followed/a": { v: { d: 1 } } }],
    ["zero counter", { "followed/a": { v: { d: 0 }, t } }],
    ["fraction counter", { "followed/a": { v: { d: 1.5 }, t } }],
    ["string counter", { "followed/a": { v: { d: "1" }, t } }],
    ["array v", { "followed/a": { v: [1], t } }],
    ["deleted not true", { "followed/a": { v: { d: 1 }, t, deleted: "yes" } }],
    [
      "one bad among good",
      { "note/a": { v: { d: 1 }, t }, "followed/a": { t } },
    ],
  ])("rejects %s", (_n, s) => {
    expect(() => parseMyPapersFile(exp({ sync: s }))).toThrow(damaged);
  });

  it.each(["__proto__", "constructor", "prototype"])(
    "rejects device key %s",
    (k) => {
      const s = JSON.parse(`{"followed/a":{"v":{"${k}":1},"t":"${t}"}}`);
      expect(() => parseMyPapersFile(exp({ sync: s }))).toThrow(damaged);
    },
  );

  it("rejects a long or non-string device", () => {
    expect(() => parseMyPapersFile(exp({ device: "x".repeat(41) }))).toThrow(
      damaged,
    );
    expect(() => parseMyPapersFile(exp({ device: 5 }))).toThrow(damaged);
  });

  it("drops unknown stores silently and keeps the rest", () => {
    const r = parseMyPapersFile(
      exp({
        sync: {
          "future/a": { v: { d: 1 }, t },
          "followed/a": { v: { d: 1 }, t },
        },
      }),
    );
    expect(Object.keys(r.sync)).toEqual(["followed/a"]);
  });

  it("drops keys without a store separator", () => {
    expect(
      parseMyPapersFile(exp({ sync: { followed: { v: { d: 1 }, t } } })).sync,
    ).toEqual({});
  });
});

describe("deviceLabel", () => {
  const nav = (userAgent, platform = "", maxTouchPoints = 0) => ({
    userAgent,
    platform,
    maxTouchPoints,
  });
  it("names devices", () => {
    expect(deviceLabel(nav("Mozilla (iPhone; CPU iPhone OS)"))).toBe("iPhone");
    expect(deviceLabel(nav("Mozilla (iPad; CPU OS)"))).toBe("iPad");
    expect(deviceLabel(nav("Mozilla (Macintosh)", "MacIntel", 5))).toBe("iPad");
    expect(deviceLabel(nav("Mozilla (Macintosh)", "MacIntel", 0))).toBe("Mac");
    expect(
      deviceLabel(nav("Mozilla (Linux; Android 14)", "Linux armv8l", 5)),
    ).toBe("Android");
    expect(deviceLabel(nav("Mozilla (Windows NT 10.0)", "Win32"))).toBe(
      "Windows",
    );
    expect(deviceLabel(nav("Mozilla (X11; Linux)", "Linux x86_64"))).toBe(
      "other device",
    );
    expect(deviceLabel({})).toBe("other device");
  });
});
