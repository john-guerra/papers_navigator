import { describe, expect, it } from "vitest";
import {
  cleanRatings,
  createRatingsStore,
  importedRatingsText,
  mergeRatings,
} from "../src/lib/ratings.js";

const KEY = "papersNavigator:ieeevis2026:ratings";
const memoryStorage = () => {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
};
const fakeEvents = () => {
  const target = new EventTarget();
  return target;
};

describe("cleanRatings", () => {
  it("keeps only integer ratings 1–5 under non-empty ids", () => {
    expect(cleanRatings({ a: 4, b: 0, c: 6, d: "5", e: 2.5, "": 3 })).toEqual({
      a: 4,
    });
  });

  it("returns {} for anything that isn't an object", () => {
    expect(cleanRatings(null)).toEqual({});
    expect(cleanRatings([4])).toEqual({});
    expect(cleanRatings("x")).toEqual({});
  });
});

describe("createRatingsStore", () => {
  it("sets, saves and emits input once per change", () => {
    const storage = memoryStorage();
    const store = createRatingsStore("ieeevis2026", storage, fakeEvents());
    let events = 0;
    store.addEventListener("input", () => events++);
    store.set("p1", 4);
    expect(store.get("p1")).toBe(4);
    expect(storage.data.get(KEY)).toBe('{"p1":4}');
    expect(events).toBe(1);
    // same value: no event
    store.set("p1", 4);
    expect(events).toBe(1);
  });

  it("deletes with 0 and ignores values outside 1–5", () => {
    const storage = memoryStorage();
    const store = createRatingsStore("ieeevis2026", storage, fakeEvents());
    store.set("p1", 3);
    let events = 0;
    store.addEventListener("input", () => events++);
    store.set("p1", 7);
    store.set("p1", 2.5);
    expect(store.get("p1")).toBe(3);
    expect(events).toBe(0);
    store.set("p1", 0);
    expect(store.get("p1")).toBe(0);
    expect(store.value).toEqual({});
    expect(events).toBe(1);
  });

  it("survives corrupt storage", () => {
    const storage = memoryStorage();
    storage.setItem(KEY, "{not json");
    const store = createRatingsStore("ieeevis2026", storage, fakeEvents());
    expect(store.value).toEqual({});
    storage.setItem(KEY, JSON.stringify({ a: 9, b: 2 }));
    expect(
      createRatingsStore("ieeevis2026", storage, fakeEvents()).value,
    ).toEqual({ b: 2 });
  });

  it("follows another tab through storage events for its key", () => {
    const storage = memoryStorage();
    const events = fakeEvents();
    const store = createRatingsStore("ieeevis2026", storage, events);
    let n = 0;
    store.addEventListener("input", () => n++);
    storage.setItem(KEY, JSON.stringify({ x: 5 }));
    events.dispatchEvent(Object.assign(new Event("storage"), { key: "other" }));
    expect(store.value).toEqual({});
    events.dispatchEvent(Object.assign(new Event("storage"), { key: KEY }));
    expect(store.value).toEqual({ x: 5 });
    expect(n).toBe(1);
    store.dispose();
  });
});

describe("merging imported ratings (#203 Stage B)", () => {
  it("adds ratings for new papers; yours win", () => {
    expect(mergeRatings({ a: 2 }, { a: 5, b: 4, c: 9 })).toEqual({
      ratings: { a: 2, b: 4 },
      added: 1,
    });
  });

  it("store.merge adds and its undo removes only unchanged added ratings", () => {
    const store = createRatingsStore(
      "ieeevis2026",
      memoryStorage(),
      fakeEvents(),
    );
    store.set("a", 2);
    const { added, undo } = store.merge({ a: 5, b: 4, c: 3 });
    expect(added).toBe(2);
    expect(store.value).toEqual({ a: 2, b: 4, c: 3 });
    store.set("c", 1);
    undo();
    expect(store.value).toEqual({ a: 2, c: 1 });
  });

  it("importedRatingsText", () => {
    expect(importedRatingsText(0)).toBe("");
    expect(importedRatingsText(1)).toBe(" · 1 rating added");
    expect(importedRatingsText(3)).toBe(" · 3 ratings added");
  });
});
