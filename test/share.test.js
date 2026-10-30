import { describe, expect, it } from "vitest";
import {
  decodeShareHash,
  encodeShareHash,
  resolveShortIds,
} from "../src/lib/share.js";

const papers = [
  { id: "a1b2c3d4-0000", shortId: "a1b2c3d4" },
  { id: "e5f6a7b8-1111", shortId: "e5f6a7b8" },
];

describe("share hash", () => {
  it("round-trips short ids", () => {
    const ids = ["a1b2c3d4", "e5f6a7b8"];
    expect(encodeShareHash(ids)).toBe("#follow=a1b2c3d4.e5f6a7b8");
    expect(decodeShareHash(encodeShareHash(ids))).toEqual(ids);
  });

  it("encodes nothing for an empty list", () => {
    expect(encodeShareHash([])).toBe("");
  });

  it("ignores empty, unrelated, or garbled hashes", () => {
    expect(decodeShareHash("")).toEqual([]);
    expect(decodeShareHash("#")).toEqual([]);
    expect(decodeShareHash("#other=1")).toEqual([]);
    expect(decodeShareHash("#follow=..a1b2c3d4..")).toEqual(["a1b2c3d4"]);
    expect(decodeShareHash("#follow=a1b2c3d4.<script>")).toEqual(["a1b2c3d4"]);
  });

  it("keeps 50 papers short enough for a QR code", () => {
    const ids = Array.from({ length: 50 }, (_, i) => `${i}`.padStart(9, "a"));
    expect(encodeShareHash(ids).length).toBeLessThanOrEqual(510);
  });
});

describe("resolveShortIds", () => {
  it("maps short ids to paper ids and reports unknown ones", () => {
    expect(resolveShortIds(["e5f6a7b8", "zzzzzzzz"], papers)).toEqual({
      ids: ["e5f6a7b8-1111"],
      unknown: ["zzzzzzzz"],
    });
  });
});

describe("resolveShortIds with older links", () => {
  it("resolves a token by unique id prefix when the short id length changed", () => {
    const longer = [
      { id: "a1b2c3d4-0000", shortId: "a1b2c3d4-0" },
      { id: "e5f6a7b8-1111", shortId: "e5f6a7b8-1" },
    ];
    expect(resolveShortIds(["a1b2c3d4"], longer)).toEqual({
      ids: ["a1b2c3d4-0000"],
      unknown: [],
    });
  });

  it("treats an ambiguous prefix as unknown", () => {
    const twins = [
      { id: "slot_1790", shortId: "slot_1790" },
      { id: "slot_1792", shortId: "slot_1792" },
    ];
    expect(resolveShortIds(["slot_179"], twins)).toEqual({
      ids: [],
      unknown: ["slot_179"],
    });
  });
});

describe("share hash with watch rules (#49)", () => {
  it("round-trips ids and watch rules, names with any characters", async () => {
    const { encodeShareHash, decodeShareHash, decodeShareWatches } =
      await import("../src/lib/share.js");
    const hash = encodeShareHash(
      ["abc12345", "def67890"],
      [
        { type: "author", value: "José Ñúñez, Jr." },
        { type: "affiliation", value: "Northeastern University" },
      ],
    );
    expect(decodeShareHash(hash)).toEqual(["abc12345", "def67890"]);
    expect(decodeShareWatches(hash)).toEqual([
      { type: "author", value: "José Ñúñez, Jr." },
      { type: "affiliation", value: "Northeastern University" },
    ]);
  });
  it("shares watch rules alone, and old links still decode", async () => {
    const { encodeShareHash, decodeShareHash, decodeShareWatches } =
      await import("../src/lib/share.js");
    const onlyWatch = encodeShareHash([], [{ type: "author", value: "Ann" }]);
    expect(decodeShareHash(onlyWatch)).toEqual([]);
    expect(decodeShareWatches(onlyWatch)).toEqual([
      { type: "author", value: "Ann" },
    ]);
    expect(decodeShareWatches("#follow=abc12345")).toEqual([]);
    expect(decodeShareWatches("#follow=a&watch=x:bad,a:")).toEqual([]);
  });
});

describe("decodeShareWatches limits (#49 review)", () => {
  it("drops duplicates and caps the number of watches a link can add", async () => {
    const { decodeShareWatches, MAX_SHARED_WATCHES } =
      await import("../src/lib/share.js");
    expect(
      decodeShareWatches("#follow=&watch=a:Ann,a:ann,a:Ann%20").map(
        (r) => r.value,
      ),
    ).toEqual(["Ann"]);
    const many = Array.from({ length: 200 }, (_, i) => `i:Inst${i}`).join(",");
    expect(decodeShareWatches(`#follow=&watch=${many}`)).toHaveLength(
      MAX_SHARED_WATCHES,
    );
  });
});
