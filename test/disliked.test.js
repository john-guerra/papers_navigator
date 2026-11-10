import { describe, expect, it } from "vitest";
import { cleanDisliked, createDislikedStore } from "../src/lib/disliked.js";

const KEY = "papersNavigator:ieeevis2026:disliked";
const memoryStorage = () => {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
};

describe("disliked store (#208)", () => {
  it("cleanDisliked keeps only true", () => {
    expect(cleanDisliked({ a: true, b: false, c: 1, "": true })).toEqual({
      a: true,
    });
    expect(cleanDisliked(null)).toEqual({});
  });

  it("sets, clears, persists, emits; a stale tab doesn't drop newer entries", () => {
    const storage = memoryStorage();
    const a = createDislikedStore("ieeevis2026", storage, new EventTarget());
    const b = createDislikedStore("ieeevis2026", storage, new EventTarget());
    let n = 0;
    a.addEventListener("input", () => n++);
    a.set("p1", true);
    b.set("p2", true);
    expect(JSON.parse(storage.data.get(KEY))).toEqual({ p1: true, p2: true });
    a.set("p1", false);
    expect(a.has("p1")).toBe(false);
    expect(n).toBe(2);
  });

  it("merge adds, yours win, undo removes only what it added", () => {
    const s = createDislikedStore(
      "ieeevis2026",
      memoryStorage(),
      new EventTarget(),
    );
    s.set("a", true);
    const { added, undo } = s.merge({ a: true, b: true, c: 7 });
    expect(added).toBe(1);
    expect(s.value).toEqual({ a: true, b: true });
    undo();
    expect(s.value).toEqual({ a: true });
  });
});
