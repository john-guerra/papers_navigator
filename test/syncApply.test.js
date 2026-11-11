import { beforeEach, describe, expect, it } from "vitest";
import { createAttendedStore } from "../src/lib/attended.js";
import { createDislikedStore } from "../src/lib/disliked.js";
import { createFollowedStore } from "../src/lib/followed.js";
import { exportMyPapers, parseMyPapersFile } from "../src/lib/myPapersFile.js";
import { createNotesStore } from "../src/lib/notes.js";
import { createRatingsStore } from "../src/lib/ratings.js";
import { createRulesStore } from "../src/lib/rules.js";
import { resetStorageHealth, storageHealth } from "../src/lib/storageHealth.js";
import {
  applyTransfer,
  lastImport,
  listSnapshots,
  restorePayload,
  restoreSnapshot,
  undoLastImport,
} from "../src/lib/sync/apply.js";
import { toEntries } from "../src/lib/sync/entries.js";
import { mergeTransfer } from "../src/lib/sync/merge.js";
import { createSyncMeta } from "../src/lib/sync/meta.js";
import { readState } from "../src/lib/sync/state.js";

const T0 = new Date("2026-10-01T00:00:00Z");
const T1 = new Date("2026-10-02T00:00:00Z");
const DAY = 24 * 3600_000;
const SNAPSHOTS = "papersNavigator:conf:syncSnapshots";
const META = "papersNavigator:conf:sync";

function fakeStorage() {
  const m = new Map();
  const s = {
    m,
    fail: () => false,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (s.fail(k, String(v))) throw new Error("QuotaExceededError");
      m.set(k, String(v));
    },
    removeItem: (k) => m.delete(k),
  };
  return s;
}

function makeStores(storage) {
  return {
    followed: createFollowedStore("conf", storage, null),
    rules: createRulesStore("conf", storage, null),
    notes: createNotesStore("conf", storage, null),
    ratings: createRatingsStore("conf", storage, null),
    disliked: createDislikedStore("conf", storage, null),
    attended: createAttendedStore("conf", storage, null),
  };
}

/** A device with some data, its meta reconciled at T0 (device "me"). */
function device(storage = fakeStorage(), now = T1) {
  const stores = makeStores(storage);
  stores.followed.add([{ id: "a" }, { id: "b" }], "r", T0);
  stores.rules.add({ type: "author", value: "Ann" }, T0);
  stores.notes.set("n1", "my own note");
  stores.ratings.set("r1", 2);
  stores.disliked.set("d1", true);
  stores.attended.set("at1", true, T0);
  const meta = createSyncMeta("conf", storage, () => "me");
  meta.reconcile(toEntries(readState("conf", storage)), T0);
  return { stores, meta, conferenceId: "conf", storage, now };
}

/** Entries as the page's own store objects hold them (not re-read from storage). */
const storeEntries = ({ stores }) =>
  toEntries({
    followed: stores.followed.value,
    ...stores.rules.value,
    notes: stores.notes.value,
    ratings: stores.ratings.value,
    disliked: stores.disliked.value,
    attended: stores.attended.value,
  });

const V = { other: 1 };
const t = "2026-10-01T12:00:00.000Z";
const RESOLUTIONS = () => [
  { key: "followed/a", deleted: true, v: V, t },
  { key: "followed/c", value: { reason: "from phone", addedOn: t }, v: V, t },
  {
    key: "rule/affiliation:mit",
    value: { type: "affiliation", value: "MIT" },
    v: V,
    t,
  },
  { key: "exception/p9", value: true, v: V, t },
  { key: "note/n1", deleted: true, v: V, t },
  { key: "note/n2", value: "hello", v: V, t },
  { key: "rating/r1", value: 4, v: V, t },
  { key: "disliked/d2", value: true, v: V, t },
  { key: "disliked/d1", deleted: true, v: V, t },
  { key: "attended/at2", value: { at: t, how: "manual" }, v: V, t },
];

beforeEach(() => resetStorageHealth());

describe("applyTransfer", () => {
  it("updates every store and leaves nothing for reconcile to bump", () => {
    const ctx = device();
    const { applied } = applyTransfer(ctx, RESOLUTIONS(), {
      from: "phone",
      label: "Import from phone",
    });
    expect(applied.sort()).toEqual(
      RESOLUTIONS()
        .map((r) => r.key)
        .sort(),
    );
    const { stores } = ctx;
    expect(stores.followed.value.map((d) => d.id)).toEqual(["b", "c"]);
    expect(stores.rules.value.rules.map((r) => r.id)).toEqual([
      "author:ann",
      "affiliation:mit",
    ]);
    expect(stores.rules.value.exceptions).toEqual(["p9"]);
    expect(stores.notes.value).toEqual({ n2: "hello" });
    expect(stores.ratings.value).toEqual({ r1: 4 });
    expect(stores.disliked.value).toEqual({ d2: true });
    expect(stores.attended.get("at2")).toEqual({ at: t, how: "manual" });
    // meta carries the file's versions, and the tombstones
    const meta = ctx.meta.read();
    expect(meta["rating/r1"].v).toEqual(V);
    expect(meta["followed/a"]).toMatchObject({ v: V, deleted: true, h: "" });
    // no spurious bump, read from storage or from the live stores
    expect(
      ctx.meta.reconcile(toEntries(readState("conf", ctx.storage)), T1),
    ).toEqual([]);
    expect(ctx.meta.reconcile(storeEntries(ctx), T1)).toEqual([]);
  });

  it("skips values no store can hold, and keeps long notes whole", () => {
    const ctx = device();
    const long = "x".repeat(20000);
    const { applied, skipped } = applyTransfer(
      ctx,
      [
        { key: "rating/r1", value: 9, v: V, t },
        {
          key: "rule/author:bob",
          value: { type: "author", value: "Carl" },
          v: V,
          t,
        },
        { key: "note/n3", value: long, v: V, t },
      ],
      { from: "p", label: "x" },
    );
    expect(skipped.sort()).toEqual(["rating/r1", "rule/author:bob"]);
    expect(applied).toEqual(["note/n3"]);
    expect(ctx.stores.ratings.get("r1")).toBe(2);
    expect(ctx.stores.notes.get("n3")).toBe(long);
  });

  it("returns the same shape when there is nothing to apply", () => {
    const { undo, ...rest } = applyTransfer(device(), [], {
      from: "p",
      label: "x",
    });
    expect(rest).toEqual({
      applied: [],
      failed: [],
      skipped: [],
      rollbackFailed: false,
    });
    expect(undo()).toEqual({ reverted: [], skipped: [] });
  });

  it("records the meta before the stores (the two-tab order)", () => {
    const ctx = device();
    const order = [];
    const setItem = ctx.storage.setItem;
    ctx.storage.setItem = (k, v) => (
      order.push(k.split(":").pop()),
      setItem(k, v)
    );
    applyTransfer(ctx, RESOLUTIONS(), { from: "phone", label: "x" });
    expect(order[0]).toBe("syncSnapshots");
    expect(order[1]).toBe("sync");
    expect(order.at(-1)).toBe("syncUndo");
    // one write per store
    const stores = order.slice(2, -1);
    expect(stores.sort()).toEqual(
      ["attended", "disliked", "followed", "notes", "ratings", "rules"].sort(),
    );
  });
});

describe("undoLastImport", () => {
  it("reverts every key except one edited since, and restores the meta", () => {
    const ctx = device();
    const before = ctx.meta.read();
    applyTransfer(ctx, RESOLUTIONS(), { from: "phone", label: "x" });
    ctx.stores.ratings.set("r1", 1); // a later local edit
    const { reverted, skipped } = undoLastImport(ctx);
    expect(skipped).toEqual(["rating/r1"]);
    expect(reverted.sort()).toEqual(
      RESOLUTIONS()
        .map((r) => r.key)
        .filter((k) => k !== "rating/r1")
        .sort(),
    );
    const s = readState("conf", ctx.storage);
    expect(s.followed.map((d) => d.id)).toEqual(["b", "a"]);
    expect(s.rules.map((r) => r.id)).toEqual(["author:ann"]);
    expect(s.exceptions).toEqual([]);
    expect(s.notes).toEqual({ n1: "my own note" });
    expect(s.ratings).toEqual({ r1: 1 });
    expect(s.disliked).toEqual({ d1: true });
    expect(s.attended.at2).toBeUndefined();
    const meta = ctx.meta.read();
    expect(meta["followed/a"]).toEqual(before["followed/a"]);
    expect(meta["note/n1"]).toEqual(before["note/n1"]);
    expect(meta["note/n2"]).toBeUndefined();
    // only the later edit is left to record
    expect(ctx.meta.reconcile(toEntries(s), T1)).toEqual(["rating/r1"]);
    // the live stores followed along
    expect(ctx.stores.notes.value).toEqual({ n1: "my own note" });
  });

  it("works after a reload and keeps a discarded note's text", () => {
    const ctx = device();
    applyTransfer(ctx, [{ key: "note/n1", value: "their note", v: V, t }], {
      from: "phone",
      label: "x",
    });
    const raw = ctx.storage.getItem("papersNavigator:conf:syncUndo");
    expect(raw).toContain("my own note");
    // reload: new meta and stores on the same storage, six days later
    const storage = ctx.storage;
    const reloaded = {
      stores: makeStores(storage),
      meta: createSyncMeta("conf", storage, () => "new"),
      conferenceId: "conf",
      storage,
      now: new Date(T1.getTime() + 6 * DAY),
    };
    expect(reloaded.meta.device).toBe("me");
    expect(undoLastImport(reloaded).reverted).toEqual(["note/n1"]);
    expect(reloaded.stores.notes.get("n1")).toBe("my own note");
    // single use
    expect(undoLastImport(reloaded)).toEqual({ reverted: [], skipped: [] });
  });

  it("ignores an undo record older than 7 days", () => {
    const ctx = device();
    applyTransfer(ctx, RESOLUTIONS(), { from: "phone", label: "x" });
    const later = { ...ctx, now: new Date(T1.getTime() + 8 * DAY) };
    expect(undoLastImport(later)).toEqual({ reverted: [], skipped: [] });
    expect(readState("conf", ctx.storage).notes).toEqual({ n2: "hello" });
  });

  it("the undo returned by applyTransfer undoes that import", () => {
    const ctx = device();
    const { undo } = applyTransfer(ctx, RESOLUTIONS(), {
      from: "p",
      label: "x",
    });
    expect(undo().skipped).toEqual([]);
    expect(readState("conf", ctx.storage).followed.map((d) => d.id)).toEqual([
      "b",
      "a",
    ]);
  });
});

describe("snapshots", () => {
  it("saves one before each import: at most 3, newest first", () => {
    const ctx = device();
    for (const n of [1, 2, 3, 4])
      applyTransfer(ctx, [{ key: `rating/x${n}`, value: n, v: V, t }], {
        from: "p",
        label: `import ${n}`,
      });
    const list = listSnapshots(ctx);
    expect(list.map((s) => s.label)).toEqual([
      "import 4",
      "import 3",
      "import 2",
    ]);
    expect(list[0].at).toBe(T1.toISOString());
    // the snapshot is the state before that import, as a v3 file
    const payload = parseMyPapersFile(list[0].payload);
    expect(payload.version).toBe(3);
    expect(payload.ratings).toEqual({ r1: 2, x1: 1, x2: 2, x3: 3 });
    expect(payload.sync["rating/x3"].v).toEqual(V);
  });

  it("restoreSnapshot brings back a removed paper and can be undone", () => {
    const ctx = device();
    applyTransfer(ctx, RESOLUTIONS(), {
      from: "p",
      label: "Import from phone",
    });
    const metaBefore = ctx.meta.read();
    const undo = restoreSnapshot(ctx, 0);
    let s = readState("conf", ctx.storage);
    expect(s.followed.map((d) => d.id)).toEqual(["b", "a"]);
    expect(s.notes).toEqual({ n1: "my own note" });
    expect(s.exceptions).toEqual([]);
    // the restore is a new change on this device, consistent with the stores
    expect(ctx.meta.read()["followed/a"]).toMatchObject({
      v: { other: 1, me: 1 },
    });
    expect(ctx.meta.read()["followed/a"].deleted).toBeUndefined();
    expect(ctx.meta.reconcile(toEntries(s), T1)).toEqual([]);
    // restoring snapshotted the state it replaced
    expect(listSnapshots(ctx)).toHaveLength(2);
    expect(parseMyPapersFile(listSnapshots(ctx)[0].payload).notes).toEqual({
      n2: "hello",
    });
    undo();
    s = readState("conf", ctx.storage);
    expect(s.followed.map((d) => d.id)).toEqual(["b", "c"]);
    expect(s.notes).toEqual({ n2: "hello" });
    expect(ctx.meta.read()).toEqual(metaBefore);
    expect(ctx.meta.reconcile(toEntries(s), T1)).toEqual([]);
  });

  it("a key added after the snapshot becomes this device's tombstone", () => {
    const ctx = device();
    applyTransfer(ctx, RESOLUTIONS(), { from: "p", label: "x" });
    restoreSnapshot(ctx, 0);
    expect(ctx.meta.read()["note/n2"]).toEqual({
      v: { other: 1, me: 1 },
      t: T1.toISOString(),
      h: "",
      deleted: true,
    });
  });

  it("a restored value is never silently lost to the other device's later edit", () => {
    const ctx = device();
    // B's value arrives, then the person restores the copy from before it
    applyTransfer(
      ctx,
      [{ key: "rating/r1", value: 4, v: { me: 1, B: 1 }, t }],
      { from: "B", label: "x" },
    );
    restoreSnapshot(ctx, 0);
    expect(ctx.stores.ratings.get("r1")).toBe(2);
    const local = () => ({
      entries: toEntries(readState("conf", ctx.storage)),
      meta: ctx.meta.read(),
    });
    // B sends its value again: the restore wins
    const again = mergeTransfer(local(), {
      entries: { "rating/r1": 4 },
      sync: { "rating/r1": { v: { me: 1, B: 1 }, t } },
    });
    expect(again.apply).toEqual({});
    // B edited it since: a clash, never an overwrite
    const edited = mergeTransfer(local(), {
      entries: { "rating/r1": 5 },
      sync: { "rating/r1": { v: { me: 1, B: 2 }, t } },
    });
    expect(edited.apply).toEqual({});
    expect(edited.clashes.map((c) => c.key)).toEqual(["rating/r1"]);
  });
});

describe("storage failures", () => {
  it("aborts before touching the stores when the snapshot can't be saved", () => {
    const ctx = device();
    const before = readState("conf", ctx.storage);
    const meta = ctx.storage.getItem(META);
    ctx.storage.fail = (k) => k === SNAPSHOTS;
    expect(() =>
      applyTransfer(ctx, RESOLUTIONS(), { from: "p", label: "x" }),
    ).toThrow(/nothing was changed/i);
    expect(readState("conf", ctx.storage)).toEqual(before);
    expect(ctx.storage.getItem(META)).toBe(meta);
    expect(storageHealth.failed).toBe(true);
  });

  it("aborts before touching the stores when the meta can't be saved", () => {
    const ctx = device();
    const before = readState("conf", ctx.storage);
    ctx.storage.fail = (k) => k === META;
    expect(() =>
      applyTransfer(ctx, RESOLUTIONS(), { from: "p", label: "x" }),
    ).toThrow(/nothing was changed/i);
    expect(readState("conf", ctx.storage)).toEqual(before);
    expect(storageHealth.failed).toBe(true);
  });

  it("a store that can't save keeps its value and its meta", () => {
    const ctx = device();
    const before = ctx.meta.read();
    ctx.storage.fail = (k) => k === "papersNavigator:conf:notes";
    const { applied, failed } = applyTransfer(ctx, RESOLUTIONS(), {
      from: "p",
      label: "x",
    });
    expect(failed.sort()).toEqual(["note/n1", "note/n2"]);
    expect(applied).toContain("rating/r1");
    const meta = ctx.meta.read();
    expect(meta["note/n1"]).toEqual(before["note/n1"]);
    expect(meta["note/n2"]).toBeUndefined();
    ctx.storage.fail = () => false;
    expect(readState("conf", ctx.storage).notes).toEqual({ n1: "my own note" });
    expect(
      ctx.meta.reconcile(toEntries(readState("conf", ctx.storage)), T1),
    ).toEqual([]);
  });

  it("a failed notes write leaves the live store as storage has it", () => {
    const ctx = device();
    ctx.storage.fail = (k) => k === "papersNavigator:conf:notes";
    applyTransfer(ctx, RESOLUTIONS(), { from: "p", label: "x" });
    expect(ctx.stores.notes.value).toEqual({ n1: "my own note" });
    ctx.storage.fail = () => false;
    ctx.stores.notes.set("n5", "later");
    const saved = JSON.parse(ctx.storage.getItem("papersNavigator:conf:notes"));
    expect(saved).toEqual({ n1: "my own note", n5: "later" });
    expect(ctx.stores.notes.value).toEqual(saved);
  });

  it("says so when the meta can't be put back after a store failure", () => {
    const ctx = device();
    let metaWrites = 0;
    ctx.storage.fail = (k) =>
      k === "papersNavigator:conf:notes" || (k === META && ++metaWrites > 1);
    const result = applyTransfer(ctx, RESOLUTIONS(), { from: "p", label: "x" });
    expect(result.failed.sort()).toEqual(["note/n1", "note/n2"]);
    expect(result.rollbackFailed).toBe(true);
    expect(storageHealth.failed).toBe(true);
  });

  it("a failed meta write doesn't rotate snapshots out", () => {
    const ctx = device();
    applyTransfer(ctx, [{ key: "rating/x1", value: 1, v: V, t }], {
      from: "p",
      label: "import 1",
    });
    const saved = ctx.storage.getItem(SNAPSHOTS);
    ctx.storage.fail = (k) => k === META;
    expect(() =>
      applyTransfer(ctx, RESOLUTIONS(), { from: "p", label: "x" }),
    ).toThrow(/nothing was changed/i);
    expect(ctx.storage.getItem(SNAPSHOTS)).toBe(saved);
  });

  it("drops the oldest snapshot when three don't fit", () => {
    const ctx = device();
    for (const n of [1, 2])
      applyTransfer(ctx, [{ key: `rating/x${n}`, value: n, v: V, t }], {
        from: "p",
        label: `import ${n}`,
      });
    ctx.storage.fail = (k, v) => k === SNAPSHOTS && JSON.parse(v).length > 2;
    applyTransfer(ctx, [{ key: "rating/x3", value: 3, v: V, t }], {
      from: "p",
      label: "import 3",
    });
    expect(listSnapshots(ctx).map((s) => s.label)).toEqual([
      "import 3",
      "import 2",
    ]);
    expect(readState("conf", ctx.storage).ratings.x3).toBe(3);
  });
});

describe("restorePayload (a backup from this device)", () => {
  it("replaces the data with the file's as a new local change, and can be undone", () => {
    const ctx = device();
    const backup = parseMyPapersFile(
      exportMyPapers(readState("conf", ctx.storage), {
        device: "me",
        sync: ctx.meta.read(),
      }),
    );
    // after the backup: a paper removed, a note edited, a rating added
    ctx.stores.followed.remove(["a"]);
    ctx.stores.notes.set("n1", "edited");
    ctx.stores.ratings.set("r9", 4);
    ctx.meta.reconcile(toEntries(readState("conf", ctx.storage)), T0);
    const metaBefore = ctx.meta.read();
    const undo = restorePayload(ctx, backup, {
      label: "Before restoring a backup",
    });
    let s = readState("conf", ctx.storage);
    expect(s.followed.map((d) => d.id).sort()).toEqual(["a", "b"]);
    expect(s.notes).toEqual({ n1: "my own note" });
    expect(s.ratings).toEqual({ r1: 2 });
    // a new change here: bumped past what was recorded, consistent with the stores
    expect(ctx.meta.read()["followed/a"].v.me).toBeGreaterThan(
      metaBefore["followed/a"].v.me,
    );
    expect(ctx.meta.read()["rating/r9"].deleted).toBe(true);
    expect(ctx.meta.reconcile(toEntries(s), T1)).toEqual([]);
    // the data it replaced was saved first
    expect(listSnapshots(ctx)[0].label).toBe("Before restoring a backup");
    expect(lastImport(ctx)).toMatchObject({ from: "backup" });
    undo();
    s = readState("conf", ctx.storage);
    expect(s.followed.map((d) => d.id)).toEqual(["b"]);
    expect(s.notes).toEqual({ n1: "edited" });
    expect(s.ratings).toEqual({ r1: 2, r9: 4 });
    expect(ctx.meta.read()).toEqual(metaBefore);
  });

  it("changes nothing when the data already is the backup's", () => {
    const ctx = device();
    const backup = parseMyPapersFile(
      exportMyPapers(readState("conf", ctx.storage), {
        device: "me",
        sync: {},
      }),
    );
    const undo = restorePayload(ctx, backup, { label: "x" });
    expect(listSnapshots(ctx)).toEqual([]);
    expect(undo()).toEqual({ reverted: [], skipped: [] });
  });

  it("throws, having changed nothing, when the copy of the data can't be saved", () => {
    const ctx = device();
    const backup = parseMyPapersFile(
      exportMyPapers({ followed: [] }, { device: "me", sync: {} }),
    );
    const before = readState("conf", ctx.storage);
    ctx.storage.fail = (k) => k === SNAPSHOTS;
    expect(() => restorePayload(ctx, backup, { label: "x" })).toThrow(
      expect.objectContaining({ code: "storage" }),
    );
    expect(readState("conf", ctx.storage)).toEqual(before);
  });
});

describe("lastImport", () => {
  it("describes the undo record for 7 days, then nothing", () => {
    const ctx = device();
    expect(lastImport(ctx)).toBeNull();
    applyTransfer(ctx, RESOLUTIONS(), { from: "iPhone", label: "x" });
    expect(lastImport(ctx)).toEqual({
      at: T1.toISOString(),
      from: "iPhone",
      count: RESOLUTIONS().length,
    });
    expect(
      lastImport({ ...ctx, now: new Date(T1.getTime() + 8 * DAY) }),
    ).toBeNull();
    undoLastImport(ctx);
    expect(lastImport(ctx)).toBeNull();
  });
});
