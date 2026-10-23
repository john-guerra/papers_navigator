import { describe, expect, it } from "vitest";
import { createFollowedStore, resolveFollowed } from "../src/lib/followed.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    data,
  };
}

const KEY = "papersNavigator:conf:followed";
const T1 = new Date("2026-10-01T00:00:00Z");
const T2 = new Date("2026-10-02T00:00:00Z");

describe("createFollowedStore", () => {
  it("merges reasons when the same paper is added twice", () => {
    const store = createFollowedStore("conf", memoryStorage());
    store.add([{ id: "a" }], "🔍 llm", T1);
    store.add([{ id: "a" }], "Authors: X", T2);
    store.add([{ id: "a" }], "Authors: X", T2);
    expect(store.value).toEqual([
      { id: "a", reason: "🔍 llm · Authors: X", addedOn: T1.toISOString() },
    ]);
  });

  it("persists removals", () => {
    const storage = memoryStorage();
    const store = createFollowedStore("conf", storage);
    store.add([{ id: "a" }, { id: "b" }], "r", T1);
    store.remove(["a"]);
    expect(createFollowedStore("conf", storage).value.map((d) => d.id)).toEqual(["b"]);
  });

  it("emits input on every change", () => {
    const store = createFollowedStore("conf", memoryStorage());
    let fired = 0;
    store.addEventListener("input", () => fired++);
    store.add([{ id: "a" }], "r", T1);
    store.remove(["a"]);
    expect(fired).toBe(2);
  });

  it("loads corrupt storage as an empty list", () => {
    const store = createFollowedStore("conf", memoryStorage({ [KEY]: "{not json" }));
    expect(store.value).toEqual([]);
  });

  it("rejects an invalid import without touching the list", () => {
    const store = createFollowedStore("conf", memoryStorage());
    store.add([{ id: "a" }], "r", T1);
    expect(() => store.importJSON('[{"nope":1}]')).toThrow(/invalid/);
    expect(() => store.importJSON("not json")).toThrow(/invalid/);
    expect(store.value.map((d) => d.id)).toEqual(["a"]);
  });

  it("round-trips through export and import", () => {
    const store = createFollowedStore("conf", memoryStorage());
    store.add([{ id: "a" }], "r", T1);
    const other = createFollowedStore("conf", memoryStorage());
    other.importJSON(store.exportJSON());
    expect(other.value).toEqual(store.value);
  });

  it("merges lists by id, concatenating reasons", () => {
    const store = createFollowedStore("conf", memoryStorage());
    store.add([{ id: "a" }], "one", T1);
    store.merge([
      { id: "a", reason: "two", addedOn: T2.toISOString() },
      { id: "b", reason: "three", addedOn: T2.toISOString() },
    ]);
    expect(store.value).toEqual([
      { id: "a", reason: "one · two", addedOn: T1.toISOString() },
      { id: "b", reason: "three", addedOn: T2.toISOString() },
    ]);
  });

  it("replaces the whole list", () => {
    const store = createFollowedStore("conf", memoryStorage());
    store.add([{ id: "a" }], "one", T1);
    store.replace([{ id: "b", reason: "x", addedOn: T2.toISOString() }]);
    expect(store.value.map((d) => d.id)).toEqual(["b"]);
  });
});

describe("resolveFollowed", () => {
  it("joins followed entries with papers and reports missing ones", () => {
    const papers = [{ id: "a", title: "A" }];
    const followed = [
      { id: "a", reason: "r", addedOn: "x" },
      { id: "gone", reason: "r", addedOn: "x" },
    ];
    const { items, missing } = resolveFollowed(followed, papers);
    expect(items).toEqual([{ id: "a", title: "A", reason: "r", addedOn: "x" }]);
    expect(missing.map((d) => d.id)).toEqual(["gone"]);
  });
});
