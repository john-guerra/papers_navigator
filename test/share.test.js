import { describe, expect, it } from "vitest";
import { decodeShareHash, encodeShareHash, resolveShortIds } from "../src/lib/share.js";

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
