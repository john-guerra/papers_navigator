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

describe("decodeShareWatches with hostile input", () => {
  it("stays fast on a huge hash and dedupes like rule ids (accents ignored)", async () => {
    const { decodeShareWatches, MAX_SHARED_WATCHES } =
      await import("../src/lib/share.js");
    const huge =
      "#follow=&watch=" +
      Array.from({ length: 200_000 }, (_, i) => `a:N${i}`).join(",");
    const t0 = performance.now();
    const rules = decodeShareWatches(huge);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(rules).toHaveLength(MAX_SHARED_WATCHES);
    expect(
      decodeShareWatches("#follow=&watch=a:Jos%C3%A9,a:Jose").map(
        (r) => r.value,
      ),
    ).toEqual(["José"]);
  });
});

describe("decodeShareHash with hostile input", () => {
  it("caps the number of paper ids read from a link", async () => {
    const { decodeShareHash, MAX_SHARED_PAPERS } =
      await import("../src/lib/share.js");
    const huge =
      "#follow=" + Array.from({ length: 50_000 }, (_, i) => `id${i}`).join(".");
    expect(decodeShareHash(huge)).toHaveLength(MAX_SHARED_PAPERS);
  });
});

describe("share link length caps", () => {
  it("drops overlong watch names and paper ids", async () => {
    const { decodeShareWatches, decodeShareHash } =
      await import("../src/lib/share.js");
    const long = "x".repeat(201);
    expect(
      decodeShareWatches(`#follow=&watch=a:${long},a:Ann`).map((r) => r.value),
    ).toEqual(["Ann"]);
    expect(
      decodeShareWatches(`#follow=&watch=a:${"%C3%A9".repeat(201)}`),
    ).toEqual([]);
    expect(decodeShareHash(`#follow=${"a".repeat(65)}.abc12345`)).toEqual([
      "abc12345",
    ]);
  });
});

describe("share hash with research topics (#24)", () => {
  it("round-trips a topic's query, level and threshold, not its cached matches", async () => {
    const { encodeShareHash, decodeShareWatches } =
      await import("../src/lib/share.js");
    const hash = encodeShareHash(
      ["a1b2c3d4"],
      [
        { type: "author", value: "Ann" },
        {
          type: "topic",
          value: "LLM agents, for: science & 100%",
          level: "strong",
          threshold: 0.4321,
          matches: { x: 0.9 },
        },
      ],
    );
    expect(hash).toBe(
      "#follow=a1b2c3d4&watch=a:Ann,t:s0.4321:LLM%20agents%2C%20for%3A%20science%20%26%20100%25",
    );
    expect(decodeShareWatches(hash)).toEqual([
      { type: "author", value: "Ann" },
      {
        type: "topic",
        value: "LLM agents, for: science & 100%",
        level: "strong",
        threshold: 0.4321,
      },
    ]);
  });

  it("drops malformed topic entries", async () => {
    const { decodeShareWatches } = await import("../src/lib/share.js");
    expect(
      decodeShareWatches(
        "#follow=&watch=t:x0.3:a,t:g:a,t:g0.3,t:g2:a,t:g0.3:,t:gNaN:a,t:g0.25:ok",
      ),
    ).toEqual([{ type: "topic", value: "ok", level: "good", threshold: 0.25 }]);
  });
});
