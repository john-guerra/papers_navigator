import { describe, expect, it } from "vitest";
import {
  STORES,
  fromEntries,
  keyOf,
  splitKey,
  toEntries,
} from "../src/lib/sync/entries.js";

const rule = {
  id: "topic:x",
  type: "topic",
  value: "x",
  threshold: 0.3,
  level: "good",
  matches: { p: 1 },
  evaluatedOn: "2026-10-01T00:00:00.000Z",
  addedOn: "2026-10-01T00:00:00.000Z",
};

const state = {
  followed: [
    { id: "p1", reason: "Watch", addedOn: "2026-10-02T00:00:00.000Z" },
    { id: "p2", reason: "", addedOn: "2026-10-03T00:00:00.000Z" },
  ],
  rules: [rule],
  exceptions: ["p9"],
  notes: { p1: "good", "session:x": "room 3" },
  ratings: { p1: 4 },
  disliked: { p3: true },
  attended: {
    p1: { at: "2026-10-05T10:00:00.000Z", how: "manual" },
    p2: { off: true },
  },
};

describe("entries", () => {
  it("lists the stores and builds keys", () => {
    expect(STORES).toEqual([
      "followed",
      "rule",
      "exception",
      "note",
      "rating",
      "disliked",
      "attended",
    ]);
    expect(keyOf("note", "session:x")).toBe("note/session:x");
    expect(splitKey("note/session:a/b")).toEqual(["note", "session:a/b"]);
  });

  it("maps a rule without its derived fields", () => {
    const e = toEntries(state);
    expect(e["rule/topic:x"]).toEqual({
      type: "topic",
      value: "x",
      threshold: 0.3,
      level: "good",
    });
    expect(e["followed/p1"]).toEqual({
      reason: "Watch",
      addedOn: "2026-10-02T00:00:00.000Z",
    });
    expect(e["exception/p9"]).toBe(true);
    expect(e["note/session:x"]).toBe("room 3");
  });

  it("treats missing parts as empty", () => {
    expect(toEntries({})).toEqual({});
    expect(toEntries()).toEqual({});
    expect(fromEntries({})).toEqual({
      followed: [],
      rules: [],
      exceptions: [],
      notes: {},
      ratings: {},
      disliked: {},
      attended: {},
    });
  });

  it("defaults a followed reason to empty", () => {
    expect(
      toEntries({ followed: [{ id: "p", addedOn: "d" }] })["followed/p"],
    ).toEqual({
      reason: "",
      addedOn: "d",
    });
  });

  it("round-trips", () => {
    const back = fromEntries(toEntries(state));
    expect(back.followed).toEqual(state.followed);
    expect(back.rules).toEqual([
      {
        id: "topic:x",
        type: "topic",
        value: "x",
        threshold: 0.3,
        level: "good",
      },
    ]);
    expect(back.exceptions).toEqual(["p9"]);
    expect(back.notes).toEqual(state.notes);
    expect(back.ratings).toEqual(state.ratings);
    expect(back.disliked).toEqual(state.disliked);
    expect(back.attended).toEqual(state.attended);
  });
});
