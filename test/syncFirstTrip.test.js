import { describe, expect, it } from "vitest";
import { stableHash } from "../src/lib/sync/clock.js";
import { identity, toEntries } from "../src/lib/sync/entries.js";
import { mergeTransfer } from "../src/lib/sync/merge.js";
import { createSyncMeta } from "../src/lib/sync/meta.js";

/**
 * A change is an entry's identity, not its metadata: a paper's reason/addedOn and an attended
 * mark's at/how travel, but never make a change or a clash.
 */

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    m,
  };
}

const NOV9 = new Date("2026-11-09T00:00:00Z");
const ids = Array.from({ length: 30 }, (_, i) => `p${i}`);

function devices() {
  const laptop = {
    followed: ids.map((id) => ({
      id,
      reason: "★ Added by hand",
      addedOn: "2026-11-05T12:00:00.000Z",
    })),
    notes: { p1: "Ask about X" },
  };
  const phone = {
    followed: ids
      .filter((id) => id !== "p29")
      .map((id) => ({
        id,
        reason: "📱 shared",
        addedOn: "2026-11-08T09:00:00.000Z",
      })),
    notes: { p1: "Ask about X", p2: "Great talk" },
    ratings: { p2: 5, p3: 3 },
    attended: {
      p2: { at: "2026-11-10T15:10:00.000Z", how: "auto" },
      p3: { at: "2026-11-10T15:30:00.000Z", how: "auto" },
    },
  };
  const L = createSyncMeta("x", fakeStorage(), () => "L");
  const P = createSyncMeta("x", fakeStorage(), () => "P");
  L.reconcile(toEntries(laptop), NOV9);
  P.reconcile(toEntries(phone), NOV9);
  return { laptop, phone, L, P };
}

const send = (from, meta, device) => ({
  entries: toEntries(from),
  sync: meta.read(),
  device,
});

describe("identity", () => {
  it("is presence for a followed paper", () => {
    expect(identity("followed/a", { reason: "x", addedOn: "1" })).toBe(
      identity("followed/a", { reason: "y", addedOn: "2" }),
    );
  });
  it("is on/off for an attended mark", () => {
    const a = identity("attended/a", {
      at: "2026-11-10T15:10:00Z",
      how: "auto",
    });
    expect(
      identity("attended/a", { at: "2026-11-10T15:12:00Z", how: "manual" }),
    ).toBe(a);
    expect(identity("attended/a", { off: true })).not.toBe(a);
  });
  it("is the whole value for other stores", () => {
    expect(identity("note/a", "x")).toBe(stableHash("x"));
    expect(identity("rating/a", 3)).not.toBe(identity("rating/a", 4));
  });
});

describe("first trip between two devices that migrated on their own", () => {
  it("doesn't clash on papers whose reason/date differ, and applies the phone's news", () => {
    const { laptop, phone, L, P } = devices();
    const r = mergeTransfer(
      { entries: toEntries(laptop), meta: L.read() },
      send(phone, P, "P"),
    );
    expect(r.clashes).toEqual([]);
    expect(r.apply["note/p2"]).toMatchObject({ value: "Great talk" });
    expect(r.apply["rating/p2"]).toMatchObject({ value: 5 });
    expect(r.apply["rating/p3"]).toMatchObject({ value: 3 });
    expect(r.apply["attended/p2"]).toMatchObject({
      value: { at: "2026-11-10T15:10:00.000Z", how: "auto" },
    });
    expect(r.apply["attended/p3"]).toBeDefined();
    // p29 was never on the phone: it stays on the laptop
    expect(r.apply["followed/p29"]).toBeUndefined();
    // the laptop keeps its own reason for the papers both have
    for (const [k, a] of Object.entries(r.apply))
      if (k.startsWith("followed/"))
        expect(a.value.reason).toBe("★ Added by hand");
  });

  it("the other direction doesn't clash either, and brings p29 with the laptop's reason", () => {
    const { laptop, phone, L, P } = devices();
    const r = mergeTransfer(
      { entries: toEntries(phone), meta: P.read() },
      send(laptop, L, "L"),
    );
    expect(r.clashes).toEqual([]);
    expect(r.apply["followed/p29"]).toMatchObject({
      value: { reason: "★ Added by hand" },
    });
    for (const [k, a] of Object.entries(r.apply))
      if (k.startsWith("followed/") && k !== "followed/p29")
        expect(a.value.reason).toBe("📱 shared");
  });

  it("two devices marking the same talk attended at different times don't clash", () => {
    const A = createSyncMeta("x", fakeStorage(), () => "A");
    const B = createSyncMeta("x", fakeStorage(), () => "B");
    const a = {
      attended: { t1: { at: "2026-11-10T15:10:00.000Z", how: "auto" } },
    };
    const b = {
      attended: { t1: { at: "2026-11-10T15:14:00.000Z", how: "manual" } },
    };
    A.reconcile(toEntries(a), NOV9);
    B.reconcile(toEntries(b), NOV9);
    const r = mergeTransfer(
      { entries: toEntries(a), meta: A.read() },
      send(b, B, "B"),
    );
    expect(r.clashes).toEqual([]);
    expect(r.counts.changed).toBe(0);
  });

  it("an attended mark unticked on one side and kept on the other still clashes", () => {
    const A = createSyncMeta("x", fakeStorage(), () => "A");
    const B = createSyncMeta("x", fakeStorage(), () => "B");
    const a = {
      attended: { t1: { at: "2026-11-10T15:10:00.000Z", how: "auto" } },
    };
    const b = { attended: { t1: { off: true } } };
    A.reconcile(toEntries(a), NOV9);
    B.reconcile(toEntries(b), NOV9);
    const r = mergeTransfer(
      { entries: toEntries(a), meta: A.read() },
      send(b, B, "B"),
    );
    expect(r.clashes.map((c) => c.key)).toEqual(["attended/t1"]);
  });
});

describe("after a trip", () => {
  /** The laptop imports the phone's data and writes the merge as an apply would. */
  function afterTrip() {
    const { laptop, phone, L, P } = devices();
    const r = mergeTransfer(
      { entries: toEntries(laptop), meta: L.read() },
      send(phone, P, "P"),
    );
    const m = L.read();
    const entries = toEntries(laptop);
    for (const [k, a] of Object.entries(r.apply)) {
      if (a.deleted) {
        delete entries[k];
        m[k] = { v: a.v, t: a.t, h: "", deleted: true };
      } else {
        entries[k] = a.value;
        m[k] = { v: a.v, t: a.t, h: identity(k, a.value) };
      }
    }
    L.write(m);
    return { entries, L, phone, P };
  }

  it("the applied keys reconcile to nothing", () => {
    const { entries, L } = afterTrip();
    expect(L.reconcile(entries, NOV9)).toEqual([]);
  });

  it("a reason change alone records no change and makes no clash", () => {
    const { entries, L, phone, P } = afterTrip();
    entries["followed/p4"] = {
      reason: "renamed",
      addedOn: "2026-11-11T00:00:00.000Z",
    };
    expect(L.reconcile(entries, NOV9)).toEqual([]);
    const r = mergeTransfer({ entries, meta: L.read() }, send(phone, P, "P"));
    expect(r.clashes).toEqual([]);
  });

  it("a paper removed on the laptop after the trip is a removal the phone applies", () => {
    const { entries, L, phone, P } = afterTrip();
    delete entries["followed/p4"];
    expect(L.reconcile(entries, NOV9)).toEqual(["followed/p4"]);
    const r = mergeTransfer(
      { entries: toEntries(phone), meta: P.read() },
      { entries, sync: L.read(), device: "L" },
    );
    expect(r.clashes).toEqual([]);
    expect(r.apply["followed/p4"]).toMatchObject({ deleted: true });
    expect(r.counts.removed).toBe(1);
  });

  it("removed on the laptop and re-reasoned on the phone: the removal applies (the reason is no change)", () => {
    const { entries, L, phone, P } = afterTrip();
    delete entries["followed/p4"];
    L.reconcile(entries, NOV9);
    const phoneNow = {
      ...phone,
      followed: phone.followed.map((f) =>
        f.id === "p4" ? { ...f, reason: "edited on phone" } : f,
      ),
    };
    expect(P.reconcile(toEntries(phoneNow), NOV9)).toEqual([]);
    const r = mergeTransfer(
      { entries: toEntries(phoneNow), meta: P.read() },
      { entries, sync: L.read(), device: "L" },
    );
    expect(r.clashes).toEqual([]);
    expect(r.apply["followed/p4"]).toMatchObject({ deleted: true });
  });

  it("removed on one side, removed-and-re-added on the other: still a clash", () => {
    const { entries, L, phone, P } = afterTrip();
    delete entries["followed/p4"];
    L.reconcile(entries, NOV9);
    // the phone removes and re-adds it (two identity changes) without seeing the laptop's
    const without = toEntries(phone);
    delete without["followed/p4"];
    P.reconcile(without, NOV9);
    P.reconcile(toEntries(phone), NOV9);
    const r = mergeTransfer(
      { entries: toEntries(phone), meta: P.read() },
      { entries, sync: L.read(), device: "L" },
    );
    expect(r.clashes.map((c) => c.key)).toEqual(["followed/p4"]);
  });
});
