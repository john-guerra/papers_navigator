import { describe, expect, it } from "vitest";
import { stableHash } from "../src/lib/sync/clock.js";
import { identity } from "../src/lib/sync/entries.js";
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

  describe("records made before identity hashes (no hv: 2)", () => {
    const F = { reason: "r", addedOn: "2026-10-01T00:00:00.000Z" };
    const A = { at: "2026-10-01T10:00:00.000Z", how: "auto" };
    const old = () => ({
      device: "dev",
      entries: {
        "followed/a": { v: { dev: 1 }, t: "t0", h: stableHash(F) },
        "attended/b": { v: { dev: 1 }, t: "t0", h: stableHash(A) },
        "note/c": { v: { dev: 1 }, t: "t0", h: stableHash("x") },
        "rating/d": { v: { dev: 2 }, t: "t0", h: "", deleted: true },
      },
    });
    const now = () => ({ "followed/a": F, "attended/b": A, "note/c": "x" });

    it("re-derives h from identity without bumping unchanged entries", () => {
      const s = fakeStorage();
      s.setItem(KEY, JSON.stringify(old()));
      const meta = createSyncMeta("conf", s, () => "other");
      expect(meta.reconcile(now(), T)).toEqual([]);
      const doc = JSON.parse(s.getItem(KEY));
      expect(doc.hv).toBe(2);
      expect(doc.device).toBe("dev");
      expect(doc.entries["followed/a"]).toEqual({
        v: { dev: 1 },
        t: "t0",
        h: identity("followed/a", F),
      });
      expect(doc.entries["attended/b"].h).toBe(identity("attended/b", A));
      expect(doc.entries["note/c"].h).toBe(stableHash("x"));
      expect(doc.entries["rating/d"]).toEqual(old().entries["rating/d"]);
      // a reason change afterwards is no change
      expect(
        meta.reconcile({ ...now(), "followed/a": { ...F, reason: "z" } }, T),
      ).toEqual([]);
    });

    it("still bumps an entry changed while unrecorded", () => {
      const s = fakeStorage();
      s.setItem(KEY, JSON.stringify(old()));
      const meta = createSyncMeta("conf", s, () => "dev");
      const changed = {
        ...now(),
        "note/c": "edited",
        "attended/b": { off: true },
      };
      expect(meta.reconcile(changed, T).sort()).toEqual([
        "attended/b",
        "note/c",
      ]);
      expect(meta.read()["note/c"].v).toEqual({ dev: 2 });
      expect(JSON.parse(s.getItem(KEY)).hv).toBe(2);
    });

    it("write keeps the format marker", () => {
      const s = fakeStorage();
      const meta = createSyncMeta("conf", s, () => "dev");
      meta.reconcile(now(), T);
      meta.write(meta.read());
      expect(JSON.parse(s.getItem(KEY)).hv).toBe(2);
      expect(meta.reconcile(now(), T)).toEqual([]);
    });

    it("a new device starts with the marker", () => {
      const s = fakeStorage();
      createSyncMeta("conf", s, () => "dev");
      expect(JSON.parse(s.getItem(KEY)).hv).toBe(2);
    });
  });
});
