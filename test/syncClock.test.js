import { describe, expect, it } from "vitest";
import { bump, compare, join, stableHash } from "../src/lib/sync/clock.js";

describe("vector clocks", () => {
  it("compares", () => {
    expect(compare({ a: 2 }, { a: 1 })).toBe("a");
    expect(compare({ a: 1 }, { a: 1, b: 1 })).toBe("b");
    expect(compare({ a: 2 }, { a: 1, b: 1 })).toBe("concurrent");
    expect(compare({}, {})).toBe("equal");
    expect(compare({ a: 1, b: 0 }, { a: 1 })).toBe("equal");
  });

  it("joins by taking the max per device", () => {
    expect(join({ a: 2, b: 1 }, { a: 1, c: 3 })).toEqual({ a: 2, b: 1, c: 3 });
  });

  it("bumps into a new object", () => {
    const v = { a: 1 };
    expect(bump(v, "a")).toEqual({ a: 2 });
    expect(bump(v, "b")).toEqual({ a: 1, b: 1 });
    expect(v).toEqual({ a: 1 });
  });

  it("hashes independently of key order, but not of content or array order", () => {
    expect(stableHash({ b: 1, a: { d: 1, c: 2 } })).toBe(
      stableHash({ a: { c: 2, d: 1 }, b: 1 }),
    );
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
    expect(stableHash([1, 2])).not.toBe(stableHash([2, 1]));
    expect(stableHash({ a: 1, b: undefined })).toBe(stableHash({ a: 1 }));
    expect(typeof stableHash("x")).toBe("string");
  });
});
