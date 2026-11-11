import { describe, expect, it } from "vitest";
import { compare } from "../src/lib/sync/clock.js";
import { identity } from "../src/lib/sync/entries.js";
import {
  mergeTransfer,
  newestForAll,
  resolveClash,
} from "../src/lib/sync/merge.js";

const T1 = "2026-11-10T10:00:00.000Z";
const T2 = "2026-11-10T12:00:00.000Z";

const rec = (key, value, v, t = T1) => ({ v, t, h: identity(key, value) });
const tomb = (v, t = T1) => ({ v, t, h: "", deleted: true });

/** Builds `local` from `{key: [value, v, t?]}` (value undefined = tombstone). */
function makeLocal(spec) {
  const entries = {};
  const meta = {};
  for (const [k, [value, v, t]] of Object.entries(spec)) {
    if (value === undefined) meta[k] = tomb(v, t);
    else {
      entries[k] = value;
      meta[k] = rec(k, value, v, t);
    }
  }
  return { entries, meta };
}

function makeIncoming(spec, device = "P") {
  const entries = {};
  const sync = {};
  for (const [k, [value, v, t = T1]] of Object.entries(spec)) {
    if (value === undefined) sync[k] = { v, t, deleted: true };
    else {
      entries[k] = value;
      sync[k] = { v, t };
    }
  }
  return { entries, sync, device };
}

describe("mergeTransfer", () => {
  it("applies a rating changed only on the phone", () => {
    const local = makeLocal({ "rating/p1": [3, { L: 1 }] });
    const incoming = makeIncoming({ "rating/p1": [5, { L: 1, P: 1 }, T2] });
    const r = mergeTransfer(local, incoming);
    expect(r.apply).toEqual({
      "rating/p1": { value: 5, v: { L: 1, P: 1 }, t: T2 },
    });
    expect(r.clashes).toEqual([]);
    expect(r.counts).toEqual({ added: 0, changed: 1, removed: 0, same: 0 });
  });

  it("applies a paper removed only on the phone as deleted", () => {
    const local = makeLocal({
      "followed/p1": [{ reason: "", addedOn: T1 }, { L: 1 }],
    });
    const incoming = makeIncoming({
      "followed/p1": [undefined, { L: 1, P: 1 }, T2],
    });
    const r = mergeTransfer(local, incoming);
    expect(r.apply).toEqual({
      "followed/p1": { deleted: true, v: { L: 1, P: 1 }, t: T2 },
    });
    expect(r.clashes).toEqual([]);
    expect(r.counts.removed).toBe(1);
  });

  it("adds an entry the laptop doesn't have, or its tombstone", () => {
    const local = makeLocal({});
    const incoming = makeIncoming({
      "note/p1": ["hi", { P: 1 }],
      "rating/p2": [undefined, { P: 2 }],
    });
    const r = mergeTransfer(local, incoming);
    expect(r.apply["note/p1"]).toEqual({ value: "hi", v: { P: 1 }, t: T1 });
    expect(r.apply["rating/p2"]).toEqual({
      deleted: true,
      v: { P: 2 },
      t: T1,
    });
    expect(r.counts.added).toBe(1);
  });

  it("skips keys where local dominates or the vectors are equal, and keys only local has", () => {
    const local = makeLocal({
      "rating/a": [4, { L: 2, P: 1 }],
      "rating/b": [2, { L: 1 }],
      "rating/c": [1, { L: 1 }],
    });
    const incoming = makeIncoming({
      "rating/a": [3, { L: 1, P: 1 }],
      "rating/b": [2, { L: 1 }],
    });
    const r = mergeTransfer(local, incoming);
    expect(r.apply).toEqual({});
    expect(r.clashes).toEqual([]);
    expect(r.counts).toEqual({ added: 0, changed: 0, removed: 0, same: 2 });
  });

  it("gives one clash for two different concurrent ratings, not applied", () => {
    const local = makeLocal({ "rating/p1": [2, { L: 2, P: 1 }] });
    const incoming = makeIncoming({ "rating/p1": [5, { L: 1, P: 2 }, T2] });
    const r = mergeTransfer(local, incoming);
    expect(r.apply).not.toHaveProperty("rating/p1");
    expect(r.clashes).toEqual([
      {
        key: "rating/p1",
        local: { value: 2, v: { L: 2, P: 1 }, t: T1 },
        incoming: { value: 5, v: { L: 1, P: 2 }, t: T2 },
      },
    ]);
  });

  describe("first trip ({L:1} vs {P:1})", () => {
    it("joins equal values silently", () => {
      const local = makeLocal({ "rating/p1": [4, { L: 1 }, T2] });
      const incoming = makeIncoming({ "rating/p1": [4, { P: 1 }, T1] });
      const r = mergeTransfer(local, incoming);
      expect(r.apply).toEqual({
        "rating/p1": { value: 4, v: { L: 1, P: 1 }, t: T2 },
      });
      expect(r.clashes).toEqual([]);
      expect(r.counts).toEqual({ added: 0, changed: 0, removed: 0, same: 1 });
    });

    it("joins equal objects regardless of key order (hashes both sides)", () => {
      const local = makeLocal({
        "rule/author:x": [{ type: "author", value: "X" }, { L: 1 }],
      });
      local.meta["rule/author:x"].h = "stale";
      const incoming = makeIncoming({
        "rule/author:x": [{ value: "X", type: "author" }, { P: 1 }],
      });
      const r = mergeTransfer(local, incoming);
      expect(r.clashes).toEqual([]);
      expect(r.apply["rule/author:x"].v).toEqual({ L: 1, P: 1 });
    });

    it("a paper both follow keeps this device's reason, also when the file's version is newer", () => {
      const local = makeLocal({
        "followed/p1": [{ reason: "mine", addedOn: T1 }, { L: 1 }],
        "attended/p1": [{ at: T1, how: "manual" }, { L: 1 }],
      });
      const incoming = makeIncoming({
        "followed/p1": [{ reason: "theirs", addedOn: T2 }, { L: 1, P: 1 }, T2],
        "attended/p1": [{ at: T2, how: "auto" }, { L: 1, P: 1 }, T2],
      });
      const r = mergeTransfer(local, incoming);
      expect(r.clashes).toEqual([]);
      expect(r.apply).toEqual({
        "followed/p1": {
          value: { reason: "mine", addedOn: T1 },
          v: { L: 1, P: 1 },
          t: T2,
        },
        "attended/p1": {
          value: { at: T1, how: "manual" },
          v: { L: 1, P: 1 },
          t: T2,
        },
      });
      expect(r.counts).toEqual({ added: 0, changed: 0, removed: 0, same: 2 });
    });

    it("joins two tombstones silently", () => {
      const local = makeLocal({ "rating/p1": [undefined, { L: 1 }] });
      const incoming = makeIncoming({ "rating/p1": [undefined, { P: 1 }] });
      const r = mergeTransfer(local, incoming);
      expect(r.apply).toEqual({
        "rating/p1": { deleted: true, v: { L: 1, P: 1 }, t: T1 },
      });
      expect(r.clashes).toEqual([]);
    });

    it("takes the longer note when one starts with the other, silently", () => {
      const local = makeLocal({ "note/p1": ["Good", { L: 1 }] });
      const incoming = makeIncoming({
        "note/p1": ["Good. Ask about X", { P: 1 }, T2],
      });
      const r = mergeTransfer(local, incoming);
      expect(r.apply).toEqual({
        "note/p1": { value: "Good. Ask about X", v: { L: 1, P: 1 }, t: T2 },
      });
      expect(r.clashes).toEqual([]);
      expect(r.counts.changed).toBe(1);
    });

    it("keeps the longer local note (prefix compared trimmed)", () => {
      const local = makeLocal({ "note/p1": ["Good. Ask about X", { L: 1 }] });
      const incoming = makeIncoming({ "note/p1": ["Good  ", { P: 1 }, T2] });
      const r = mergeTransfer(local, incoming);
      expect(r.apply["note/p1"].value).toBe("Good. Ask about X");
      expect(r.clashes).toEqual([]);
      expect(r.counts.same).toBe(1);
    });

    it("makes 'Good' vs 'Bad' a clash", () => {
      const local = makeLocal({ "note/p1": ["Good", { L: 1 }] });
      const incoming = makeIncoming({ "note/p1": ["Bad", { P: 1 }] });
      const r = mergeTransfer(local, incoming);
      expect(r.apply).toEqual({});
      expect(r.clashes.map((c) => c.key)).toEqual(["note/p1"]);
    });
  });

  it("applies a removal on the phone and a note added on the laptop without a clash", () => {
    const local = makeLocal({
      "followed/p1": [{ reason: "", addedOn: T1 }, { L: 1 }],
      "note/p1": ["new note", { L: 1 }],
    });
    const incoming = makeIncoming({
      "followed/p1": [undefined, { L: 1, P: 1 }],
    });
    const r = mergeTransfer(local, incoming);
    expect(r.clashes).toEqual([]);
    expect(r.apply).toEqual({
      "followed/p1": { deleted: true, v: { L: 1, P: 1 }, t: T1 },
    });
    expect(local.entries["note/p1"]).toBe("new note");
  });

  it("makes a note removed on one side and edited on the other a clash", () => {
    const local = makeLocal({ "note/p1": [undefined, { L: 2 }] });
    const incoming = makeIncoming({ "note/p1": ["edited", { L: 1, P: 1 }] });
    const r = mergeTransfer(local, incoming);
    expect(r.apply).toEqual({});
    expect(r.clashes).toEqual([
      {
        key: "note/p1",
        local: { deleted: true, v: { L: 2 }, t: T1 },
        incoming: { value: "edited", v: { L: 1, P: 1 }, t: T1 },
      },
    ]);
  });

  describe("a local change the meta hasn't recorded is never silently dominated", () => {
    const noPseudo = (r) => {
      for (const x of [
        ...Object.values(r.apply),
        ...r.clashes.flatMap((c) => [c.local, c.incoming]),
      ])
        expect(Object.keys(x.v).some((d) => d.startsWith("~"))).toBe(false);
    };

    it("no meta record: different values clash, equal values join silently", () => {
      const local = { entries: { "rating/p1": 3, "rating/p2": 4 }, meta: {} };
      const incoming = makeIncoming({
        "rating/p1": [5, { P: 1 }],
        "rating/p2": [4, { P: 1 }],
      });
      const r = mergeTransfer(local, incoming);
      expect(r.clashes).toEqual([
        {
          key: "rating/p1",
          local: { value: 3, v: {}, t: "" },
          incoming: { value: 5, v: { P: 1 }, t: T1 },
        },
      ]);
      expect(r.apply).toEqual({
        "rating/p2": { value: 4, v: { P: 1 }, t: T1 },
      });
      noPseudo(r);
    });

    it("a note with no meta vs a dominating incoming note clashes (no text lost)", () => {
      const local = { entries: { "note/p1": "my unsaved thought" }, meta: {} };
      const incoming = makeIncoming({ "note/p1": ["theirs", { P: 3 }] });
      const r = mergeTransfer(local, incoming);
      expect(r.apply).toEqual({});
      expect(r.clashes.map((c) => c.key)).toEqual(["note/p1"]);
      const [res] = newestForAll(r.clashes, "L");
      expect(res.value).toBe("my unsaved thought\n\ntheirs");
      expect(res.v).toEqual({ P: 3, L: 1 });
      noPseudo(r);
    });

    it("stale meta (hash mismatch) vs a dominating incoming value clashes", () => {
      const local = makeLocal({ "rating/p1": [3, { L: 1 }] });
      local.entries["rating/p1"] = 2; // edited after the meta was written
      const incoming = makeIncoming({ "rating/p1": [5, { L: 1, P: 1 }] });
      const r = mergeTransfer(local, incoming);
      expect(r.apply).toEqual({});
      expect(r.clashes).toEqual([
        {
          key: "rating/p1",
          local: { value: 2, v: { L: 1 }, t: T1 },
          incoming: { value: 5, v: { L: 1, P: 1 }, t: T1 },
        },
      ]);
      const res = resolveClash(r.clashes[0], "local", "L");
      expect(res.v).toEqual({ L: 2, P: 1 });
      expect(compare(res.v, r.clashes[0].local.v)).toBe("a");
      expect(compare(res.v, r.clashes[0].incoming.v)).toBe("a");
    });

    it("meta.deleted with a live local value vs an incoming edit clashes", () => {
      const local = makeLocal({ "note/p1": [undefined, { L: 2 }] });
      local.entries["note/p1"] = "re-added";
      const incoming = makeIncoming({ "note/p1": ["edited", { L: 2, P: 1 }] });
      const r = mergeTransfer(local, incoming);
      expect(r.apply).toEqual({});
      expect(r.clashes[0].local).toEqual({
        value: "re-added",
        v: { L: 2 },
        t: T1,
      });
      noPseudo(r);
    });

    it("an unrecorded longer local note is a clash, not a silent keep", () => {
      const local = { entries: { "note/p1": "Good. Ask about X" }, meta: {} };
      const incoming = makeIncoming({ "note/p1": ["Good", { P: 1 }] });
      const r = mergeTransfer(local, incoming);
      expect(r.clashes.map((c) => c.key)).toEqual(["note/p1"]);
    });

    it("an unrecorded shorter local note silently takes the longer incoming one", () => {
      const local = { entries: { "note/p1": "Good" }, meta: {} };
      const incoming = makeIncoming({
        "note/p1": ["Good. Ask about X", { P: 1 }],
      });
      const r = mergeTransfer(local, incoming);
      expect(r.clashes).toEqual([]);
      expect(r.apply["note/p1"]).toEqual({
        value: "Good. Ask about X",
        v: { P: 1 },
        t: T1,
      });
    });
  });

  describe("odd input", () => {
    it("never throws on missing or garbage arguments", () => {
      const empty = {
        apply: {},
        clashes: [],
        counts: { added: 0, changed: 0, removed: 0, same: 0 },
        unmatched: 0,
      };
      expect(mergeTransfer()).toEqual(empty);
      expect(mergeTransfer(null, null)).toEqual(empty);
      expect(mergeTransfer({}, { sync: "x", entries: 5 })).toEqual(empty);
      expect(mergeTransfer({ entries: 3, meta: [] }, { sync: [] })).toEqual(
        empty,
      );
    });

    it("skips incoming records with a bad v or t, or a missing value", () => {
      const local = makeLocal({ "rating/a": [1, { L: 1 }] });
      const incoming = {
        device: "P",
        entries: { "rating/a": 5, "rating/b": 5, "rating/c": 5, "rating/d": 5 },
        sync: {
          "rating/a": { v: { L: 2, P: 0 }, t: T1 },
          "rating/b": { v: { P: 1.5 }, t: T1 },
          "rating/c": { v: { P: 1 }, t: 7 },
          "rating/d": { v: [1], t: T1 },
          "rating/e": { v: { P: 1 }, t: T1 },
          "rating/f": null,
          "rating/g": { v: { P: "1" }, t: T1 },
        },
      };
      const r = mergeTransfer(local, incoming);
      expect(r).toEqual({
        apply: {},
        clashes: [],
        counts: { added: 0, changed: 0, removed: 0, same: 0 },
        // left out, and said so
        unmatched: 4,
      });
    });

    it("skips incoming vectors naming __proto__, constructor, prototype or the pseudo device", () => {
      const sync = JSON.parse(
        '{"rating/a": {"v": {"__proto__": 1}, "t": "x"},' +
          ' "rating/b": {"v": {"constructor": 1}, "t": "x"},' +
          ' "rating/c": {"v": {"prototype": 1}, "t": "x"},' +
          ' "rating/d": {"v": {"~unrecorded": 1}, "t": "x"}}',
      );
      const entries = {
        "rating/a": 1,
        "rating/b": 1,
        "rating/c": 1,
        "rating/d": 1,
      };
      const r = mergeTransfer(
        { entries: {}, meta: {} },
        { device: "P", entries, sync },
      );
      expect(r.apply).toEqual({});
      expect(r.counts.added).toBe(0);
    });

    it("skips keys that aren't <store>/<id> of a known store", () => {
      const incoming = {
        device: "P",
        entries: JSON.parse('{"__proto__": 1, "bogus/x": 1}'),
        sync: JSON.parse(
          '{"__proto__": {"v": {"P": 1}, "t": "x"}, "bogus/x": {"v": {"P": 1}, "t": "x"}}',
        ),
      };
      const r = mergeTransfer({ entries: {}, meta: {} }, incoming);
      expect(Object.keys(r.apply)).toEqual([]);
      expect(Object.getPrototypeOf(r.apply)).toBe(Object.prototype);
    });
  });
});

const noteClash = (mine, theirs) => ({
  key: "note/p1",
  local: { value: mine, v: { L: 2, P: 1 }, t: T1 },
  incoming: { value: theirs, v: { L: 1, P: 2 }, t: T2 },
});

describe("resolveClash", () => {
  it("joins notes as 'mine\\n\\ntheirs' with a vector dominating both", () => {
    const c = noteClash("mine", "theirs");
    const r = resolveClash(c, "both", "L");
    expect(r).toEqual({
      key: "note/p1",
      value: "mine\n\ntheirs",
      v: { L: 3, P: 2 },
      t: T2,
    });
    expect(compare(r.v, c.local.v)).toBe("a");
    expect(compare(r.v, c.incoming.v)).toBe("a");
  });

  it("keeps one side, including a deletion", () => {
    const c = {
      key: "rating/p1",
      local: { deleted: true, v: { L: 2 }, t: T2 },
      incoming: { value: 4, v: { P: 1 }, t: T1 },
    };
    expect(resolveClash(c, "local", "L")).toEqual({
      key: "rating/p1",
      deleted: true,
      v: { L: 3, P: 1 },
      t: T2,
    });
    expect(resolveClash(c, "incoming", "L")).toEqual({
      key: "rating/p1",
      value: 4,
      v: { L: 3, P: 1 },
      t: T2,
    });
  });

  it("refuses 'both' unless both sides are note texts", () => {
    const rating = {
      key: "rating/p1",
      local: { value: 2, v: { L: 1 }, t: T1 },
      incoming: { value: 5, v: { P: 1 }, t: T1 },
    };
    expect(() => resolveClash(rating, "both", "L")).toThrow();
    const deleted = noteClash("mine", "x");
    deleted.incoming = { deleted: true, v: { P: 2 }, t: T2 };
    expect(() => resolveClash(deleted, "both", "L")).toThrow();
  });

  it("refuses an unknown choice", () => {
    expect(() => resolveClash(noteClash("a", "b"), "newest", "L")).toThrow();
  });
});

describe("newestForAll", () => {
  it("lets the later t win for non-notes", () => {
    const c = {
      key: "rating/p1",
      local: { value: 2, v: { L: 2, P: 1 }, t: T2 },
      incoming: { value: 5, v: { L: 1, P: 2 }, t: T1 },
    };
    expect(newestForAll([c], "L")[0].value).toBe(2);
    const swapped = {
      ...c,
      local: { ...c.local, t: T1 },
      incoming: { ...c.incoming, t: T2 },
    };
    expect(newestForAll([swapped], "L")[0].value).toBe(5);
  });

  it("never returns a resolution that drops note text", () => {
    const clashes = [
      noteClash("mine", "theirs"),
      {
        key: "note/p2",
        local: { value: "kept", v: { L: 2 }, t: T1 },
        incoming: { deleted: true, v: { P: 1 }, t: T2 },
      },
      {
        key: "note/p3",
        local: { deleted: true, v: { L: 2 }, t: T2 },
        incoming: { value: "edit", v: { P: 1 }, t: T1 },
      },
    ];
    const out = newestForAll(clashes, "L");
    expect(out.map((r) => [r.key, r.value, !!r.deleted])).toEqual([
      ["note/p1", "mine\n\ntheirs", false],
      ["note/p2", "kept", false],
      ["note/p3", "edit", false],
    ]);
    for (const [i, r] of out.entries()) {
      for (const side of ["local", "incoming"]) {
        const text = clashes[i][side].value;
        if (typeof text === "string") expect(r.value).toContain(text);
        expect(compare(r.v, clashes[i][side].v)).toBe("a");
      }
    }
  });
});

describe("newestForAll and My research rules", () => {
  const research = (abstracts, extra = {}) => ({
    type: "topic",
    value: "My research",
    threshold: 0.5,
    level: "good",
    research: abstracts,
    ...extra,
  });

  it("keeps this device's research rule, even when the file's is newer", () => {
    const c = {
      key: "rule/research:my research",
      local: { value: research(["my abstract"]), v: { L: 2 }, t: T1 },
      incoming: {
        value: research(["their abstract"], { level: "strong" }),
        v: { P: 1 },
        t: T2,
      },
    };
    const [r] = newestForAll([c], "L");
    expect(r.value.research).toEqual(["my abstract"]);
    expect(compare(r.v, c.incoming.v)).toBe("a");
  });

  it("never drops abstracts for a deletion", () => {
    const c = {
      key: "rule/research:my research",
      local: { deleted: true, v: { L: 2 }, t: T2 },
      incoming: { value: research(["their abstract"]), v: { P: 1 }, t: T1 },
    };
    expect(newestForAll([c], "L")[0].value.research).toEqual([
      "their abstract",
    ]);
  });
});

describe("file values without a version record", () => {
  it("counts them as unmatched instead of skipping them silently", () => {
    const local = makeLocal({ "note/a": ["same", { L: 1 }] });
    const incoming = makeIncoming({ "rating/r": [4, { P: 1 }] });
    incoming.entries["note/x"] = "no record";
    incoming.entries["note/a"] = "same"; // identical here: nothing lost
    incoming.entries["rating/bad"] = 3;
    incoming.sync["rating/bad"] = { v: { P: 0 }, t: T1 };
    const r = mergeTransfer(local, incoming);
    expect(r.unmatched).toBe(2);
    expect(r.apply["rating/r"].value).toBe(4);
    expect(r.apply["note/x"]).toBeUndefined();
  });
});
