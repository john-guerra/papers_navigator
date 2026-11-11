import { describe, expect, it } from "vitest";
import { createSyncMeta } from "../src/lib/sync/meta.js";

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    m,
  };
}
const KEY = "papersNavigator:conf:sync";
const T = new Date("2026-10-01T00:00:00Z");
const E = () => ({ "note/a": "x", "note/b": "y", "rating/c": 4 });

describe("createSyncMeta", () => {
  it("versions entries on first reconcile and ignores unchanged ones", () => {
    const s = fakeStorage();
    const meta = createSyncMeta("conf", s, () => "dev");
    expect(meta.reconcile(E(), T).sort()).toEqual(Object.keys(E()).sort());
    const entries = meta.read();
    for (const k of Object.keys(E())) {
      expect(entries[k].v).toEqual({ dev: 1 });
      expect(entries[k].t).toBe(T.toISOString());
    }
    expect(meta.reconcile(E(), T)).toEqual([]);
  });

  it("bumps only the edited entry", () => {
    const meta = createSyncMeta("conf", fakeStorage(), () => "dev");
    meta.reconcile(E(), T);
    expect(meta.reconcile({ ...E(), "note/a": "z" }, T)).toEqual(["note/a"]);
    expect(meta.read()["note/a"].v).toEqual({ dev: 2 });
    expect(meta.read()["note/b"].v).toEqual({ dev: 1 });
  });

  it("tombstones removals and revives re-adds", () => {
    const meta = createSyncMeta("conf", fakeStorage(), () => "dev");
    meta.reconcile(E(), T);
    const rest = E();
    delete rest["note/a"];
    expect(meta.reconcile(rest, T)).toEqual(["note/a"]);
    expect(meta.read()["note/a"]).toMatchObject({
      v: { dev: 2 },
      h: "",
      deleted: true,
    });
    expect(meta.reconcile(rest, T)).toEqual([]);
    meta.reconcile(E(), T);
    const e = meta.read()["note/a"];
    expect(e.v).toEqual({ dev: 3 });
    expect(e.deleted).toBeUndefined();
  });

  it("persists the device id", () => {
    const s = fakeStorage();
    const a = createSyncMeta("conf", s);
    const b = createSyncMeta("conf", s);
    expect(a.device).toMatch(/^[0-9a-z-]{8}$/);
    expect(b.device).toBe(a.device);
  });

  it("treats corrupt JSON as empty", () => {
    const s = fakeStorage();
    s.setItem(KEY, "{nope");
    const meta = createSyncMeta("conf", s, () => "dev");
    expect(meta.read()).toEqual({});
    expect(() => meta.reconcile(E(), T)).not.toThrow();
    expect(meta.read()["note/a"].v).toEqual({ dev: 1 });
  });

  it("two tabs: the second finds nothing to change", () => {
    const s = fakeStorage();
    const a = createSyncMeta("conf", s, () => "dev");
    const b = createSyncMeta("conf", s);
    expect(a.reconcile(E(), T).length).toBe(3);
    expect(b.reconcile(E(), T)).toEqual([]);
  });
});
