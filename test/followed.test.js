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
    expect(createFollowedStore("conf", storage).value.map((d) => d.id)).toEqual(
      ["b"],
    );
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
    const store = createFollowedStore(
      "conf",
      memoryStorage({ [KEY]: "{not json" }),
    );
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

describe("followed store across tabs", () => {
  it("does not overwrite changes another tab saved", () => {
    const storage = memoryStorage();
    const tabA = createFollowedStore("conf", storage);
    const tabB = createFollowedStore("conf", storage);
    tabB.add([{ id: "new" }], "explore", T1);
    tabA.add([{ id: "mine" }], "my papers", T2);
    expect(
      createFollowedStore("conf", storage)
        .value.map((d) => d.id)
        .sort(),
    ).toEqual(["mine", "new"]);
  });

  it("removals in one tab keep the other tab's additions", () => {
    const storage = memoryStorage();
    const tabA = createFollowedStore("conf", storage);
    tabA.add([{ id: "a" }], "r", T1);
    const tabB = createFollowedStore("conf", storage);
    tabB.add([{ id: "b" }], "r", T1);
    tabA.remove(["a"]);
    expect(createFollowedStore("conf", storage).value.map((d) => d.id)).toEqual(
      ["b"],
    );
  });

  it("reloads and emits input on a storage event for its key", () => {
    const storage = memoryStorage();
    const target = new EventTarget();
    const store = createFollowedStore("conf", storage, target);
    let fired = 0;
    store.addEventListener("input", () => fired++);
    storage.setItem(
      KEY,
      JSON.stringify([{ id: "x", reason: "r", addedOn: T1.toISOString() }]),
    );
    target.dispatchEvent(Object.assign(new Event("storage"), { key: KEY }));
    expect(store.value.map((d) => d.id)).toEqual(["x"]);
    expect(fired).toBe(1);
  });
});

describe("followed import", () => {
  it("merges an imported file by default, keeping local papers", () => {
    const store = createFollowedStore("conf", memoryStorage());
    store.add([{ id: "local" }], "mine", T1);
    store.importJSON(
      JSON.stringify([
        { id: "other", reason: "theirs", addedOn: T2.toISOString() },
      ]),
    );
    expect(store.value.map((d) => d.id)).toEqual(["local", "other"]);
  });

  it("replaces when asked", () => {
    const store = createFollowedStore("conf", memoryStorage());
    store.add([{ id: "local" }], "mine", T1);
    store.importJSON(JSON.stringify([{ id: "other" }]), { replace: true });
    expect(store.value.map((d) => d.id)).toEqual(["other"]);
  });

  it("coerces odd field types instead of crashing later", () => {
    const store = createFollowedStore("conf", memoryStorage());
    store.importJSON(
      JSON.stringify([{ id: "a", reason: 5, addedOn: "not a date" }]),
    );
    store.add([{ id: "a" }], "more", T1);
    expect(store.value[0].reason).toBe("5 · more");
    expect(Number.isNaN(Date.parse(store.value[0].addedOn))).toBe(false);
  });
});

describe("replace keeps a backup and returns an undo", () => {
  it("replace saves the previous list under :backup and undo restores it", () => {
    const storage = memoryStorage();
    const store = createFollowedStore("conf", storage);
    store.add(
      [{ id: "a" }, { id: "b" }],
      "mine",
      new Date("2026-10-30T00:00:00Z"),
    );
    const before = structuredClone(store.value);
    const undo = store.replace([
      { id: "x", reason: "📱 shared", addedOn: "2026-10-30T01:00:00Z" },
    ]);
    expect(store.value.map((d) => d.id)).toEqual(["x"]);
    expect(
      JSON.parse(storage.getItem("papersNavigator:conf:followed:backup")),
    ).toEqual(before);
    undo();
    expect(store.value).toEqual(before);
  });

  it("importJSON with replace also returns an undo", () => {
    const store = createFollowedStore("conf", memoryStorage());
    store.add([{ id: "a" }], "mine");
    const undo = store.importJSON(
      JSON.stringify([
        { id: "z", reason: "r", addedOn: "2026-10-30T00:00:00Z" },
      ]),
      { replace: true },
    );
    expect(store.value.map((d) => d.id)).toEqual(["z"]);
    undo();
    expect(store.value.map((d) => d.id)).toEqual(["a"]);
  });
});

describe("backup restore (#52)", () => {
  it("exposes the backup and restores it with an undo", () => {
    const storage = memoryStorage();
    const store = createFollowedStore("conf", storage);
    store.add([{ id: "a" }], "mine");
    expect(store.backup()).toBeNull();
    store.replace([{ id: "x", reason: "r", addedOn: "2026-10-30T00:00:00Z" }]);
    expect(store.backup().map((d) => d.id)).toEqual(["a"]);
    const undo = store.restoreBackup();
    expect(store.value.map((d) => d.id)).toEqual(["a"]);
    undo();
    expect(store.value.map((d) => d.id)).toEqual(["x"]);
  });
});
