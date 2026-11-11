import { describe, expect, it, vi } from "vitest";
import { createFollowedStore } from "../src/lib/followed.js";
import { createNotesStore } from "../src/lib/notes.js";
import { applyTransfer } from "../src/lib/sync/apply.js";
import { createSyncMeta } from "../src/lib/sync/meta.js";
import { startSyncTracking } from "../src/lib/sync/track.js";

function fakeStorage() {
  const m = new Map();
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
const META = "papersNavigator:conf:sync";
const devOf = (s) => JSON.parse(s.m.get(META)).device;
const metaOf = (s) => JSON.parse(s.m.get(META)).entries;

/** A manual scheduler: tasks run when flush() is called. */
function manual() {
  const q = [];
  return {
    schedule: (fn) => q.push(fn),
    flush() {
      for (const fn of q.splice(0)) fn();
    },
    size: () => q.length,
  };
}

describe("startSyncTracking", () => {
  it("migrates existing data on start: every key gets v={dev:1}", () => {
    const s = fakeStorage();
    const notes = createNotesStore("conf", s, null);
    notes.set("x", "hello");
    createFollowedStore("conf", s, null).add([{ id: "p1" }], "r");
    const stop = startSyncTracking("conf", { notes }, { storage: s });
    const e = metaOf(s);
    expect(Object.keys(e).sort()).toEqual(["followed/p1", "note/x"]);
    for (const r of Object.values(e)) expect(r.v).toEqual({ [devOf(s)]: 1 });
    stop();
  });

  it("versions a change made after start", () => {
    const s = fakeStorage();
    const notes = createNotesStore("conf", s, null);
    const m = manual();
    startSyncTracking("conf", { notes }, { storage: s, schedule: m.schedule });
    notes.set("x", "hi");
    expect(metaOf(s)["note/x"]).toBeUndefined();
    m.flush();
    expect(metaOf(s)["note/x"].v).toEqual({ [devOf(s)]: 1 });
    notes.set("x", "hi2");
    m.flush();
    expect(metaOf(s)["note/x"].v).toEqual({ [devOf(s)]: 2 });
  });

  it("coalesces quick changes into one reconcile", () => {
    const s = fakeStorage();
    const notes = createNotesStore("conf", s, null);
    const m = manual();
    startSyncTracking("conf", { notes }, { storage: s, schedule: m.schedule });
    const spy = vi.spyOn(s, "setItem");
    notes.set("a", "1");
    notes.set("b", "2");
    const writesBefore = spy.mock.calls.filter((c) => c[0] === META).length;
    expect(m.size()).toBe(1);
    m.flush();
    const writes = spy.mock.calls.filter((c) => c[0] === META).length;
    expect(writes - writesBefore).toBe(1);
    expect(Object.keys(metaOf(s)).sort()).toEqual(["note/a", "note/b"]);
  });

  it("stop() stops listening", () => {
    const s = fakeStorage();
    const notes = createNotesStore("conf", s, null);
    const m = manual();
    const stop = startSyncTracking(
      "conf",
      { notes },
      { storage: s, schedule: m.schedule },
    );
    stop();
    notes.set("x", "hi");
    m.flush();
    expect(metaOf(s)["note/x"]).toBeUndefined();
  });

  it("a reconcile scheduled during an apply runs after it", () => {
    const s = fakeStorage();
    const notes = createNotesStore("conf", s, null);
    const m = manual();
    const followed = createFollowedStore("conf", s, null);
    startSyncTracking(
      "conf",
      { notes, followed },
      { storage: s, schedule: m.schedule },
    );
    const meta = createSyncMeta("conf", s);
    const ctx = {
      stores: { notes, followed },
      meta,
      conferenceId: "conf",
      storage: s,
    };
    followed.addEventListener("input", () => m.flush(), { once: true });
    const res = applyTransfer(
      ctx,
      [
        {
          key: "note/a",
          value: "A",
          v: { other: 3 },
          t: "2026-10-01T00:00:00Z",
        },
        {
          key: "followed/p",
          value: { reason: "r", addedOn: "2026-10-01" },
          v: { other: 1 },
          t: "2026-10-01T00:00:00Z",
        },
      ],
      { label: "t" },
    );
    expect(res.applied.length).toBe(2);
    // flushed mid-apply: must not have bumped the import's versions
    expect(metaOf(s)["note/a"].v).toEqual({ other: 3 });
    m.flush();
    expect(metaOf(s)["note/a"].v).toEqual({ other: 3 });
    expect(
      meta.reconcile(
        {
          "note/a": "A",
          "followed/p": { reason: "r", addedOn: "2026-10-01" },
        },
        new Date(),
      ),
    ).toEqual([]);
  });

  it("never throws out of a failing reconcile", () => {
    const s = fakeStorage();
    const notes = createNotesStore("conf", s, null);
    const m = manual();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    startSyncTracking("conf", { notes }, { storage: s, schedule: m.schedule });
    s.getItem = () => {
      throw new Error("boom");
    };
    notes.set("x", "y");
    expect(() => m.flush()).not.toThrow();
    warn.mockRestore();
  });
});

describe("expired transfer copies", () => {
  it("removes an expired undo record and saved copies older than 14 days on start", () => {
    const s = fakeStorage();
    const old = new Date(Date.now() - 15 * 24 * 3600_000).toISOString();
    const recent = new Date(Date.now() - 24 * 3600_000).toISOString();
    s.setItem(
      "papersNavigator:conf:syncUndo",
      JSON.stringify({
        id: "x",
        at: new Date(Date.now() - 8 * 24 * 3600_000).toISOString(),
        changes: [{ key: "note/a", had: true, before: "secret" }],
      }),
    );
    s.setItem(
      "papersNavigator:conf:syncSnapshots",
      JSON.stringify([
        { at: recent, label: "new", payload: "{}" },
        { at: old, label: "old", payload: "secret" },
      ]),
    );
    const stop = startSyncTracking("conf", {}, { storage: s });
    expect(s.m.has("papersNavigator:conf:syncUndo")).toBe(false);
    expect(
      JSON.parse(s.m.get("papersNavigator:conf:syncSnapshots")).map(
        (x) => x.label,
      ),
    ).toEqual(["new"]);
    stop();
  });
});
