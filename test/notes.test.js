import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  MAX_NOTE_LENGTH,
  cleanNotes,
  createNotesStore,
  importedNotesText,
  mergeNotes,
  notesCount,
} from "../src/lib/notes.js";

const KEY = "papersNavigator:conf:notes";
const memoryStorage = () => {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
};

describe("cleanNotes", () => {
  it("keeps non-empty string notes, trimmed and capped", () => {
    expect(
      cleanNotes({
        a: "  hello\nworld  ",
        b: "   ",
        c: 3,
        d: "x".repeat(MAX_NOTE_LENGTH + 5),
      }),
    ).toEqual({ a: "hello\nworld", d: "x".repeat(MAX_NOTE_LENGTH) });
  });
  it("returns {} for anything that isn't an object of notes", () => {
    expect(cleanNotes(null)).toEqual({});
    expect(cleanNotes(["a"])).toEqual({});
    expect(cleanNotes("a")).toEqual({});
  });
});

describe("mergeNotes", () => {
  it("adds new notes and never drops an existing one", () => {
    const { notes, added, combined } = mergeNotes(
      { a: "mine", b: "same", c: "short" },
      { a: "theirs", b: "same", c: "short and longer", d: "new" },
    );
    expect(notes).toEqual({
      // both differ: both kept, the existing note first
      a: "mine\n\ntheirs",
      b: "same",
      // the imported note already contains this one
      c: "short and longer",
      d: "new",
    });
    expect(added).toBe(1);
    expect(combined).toBe(2);
  });
  it("leaves a note that already contains the imported one", () => {
    expect(mergeNotes({ a: "long note" }, { a: "long" })).toEqual({
      notes: { a: "long note" },
      added: 0,
      combined: 0,
    });
  });
});

describe("import wording", () => {
  it("counts notes with the right noun", () => {
    expect(notesCount(1)).toBe("1 note");
    expect(notesCount(3)).toBe("3 notes");
  });
  it("says what an import did to your notes", () => {
    expect(importedNotesText({ added: 0, combined: 0 })).toBe("");
    expect(importedNotesText({ added: 2, combined: 0 })).toBe(
      " 2 notes added.",
    );
    expect(importedNotesText({ added: 1, combined: 1 })).toBe(
      " 1 note added; 1 note combined with yours (no text lost).",
    );
  });
});

describe("createNotesStore", () => {
  it("saves notes per conference and emits input", () => {
    const storage = memoryStorage();
    const notes = createNotesStore("conf", storage, null);
    const seen = vi.fn();
    notes.addEventListener("input", seen);
    expect(notes.set("a", "  Ask about the user study ")).toBe(true);
    expect(notes.get("a")).toBe("Ask about the user study");
    expect(notes.has("a")).toBe(true);
    expect(JSON.parse(storage.data.get(KEY))).toEqual({
      a: "Ask about the user study",
    });
    expect(seen).toHaveBeenCalledTimes(1);
    // same text: nothing to save
    notes.set("a", "Ask about the user study");
    expect(seen).toHaveBeenCalledTimes(1);
    expect(createNotesStore("conf", storage, null).value).toEqual({
      a: "Ask about the user study",
    });
    expect(createNotesStore("other", storage, null).value).toEqual({});
  });
  it("treats an empty note as no note", () => {
    const storage = memoryStorage();
    const notes = createNotesStore("conf", storage, null);
    notes.set("a", "x");
    notes.set("a", "  \n ");
    expect(notes.has("a")).toBe(false);
    expect(notes.get("a")).toBe("");
    expect(JSON.parse(storage.data.get(KEY))).toEqual({});
  });
  it("deletes a note with an undo", () => {
    const notes = createNotesStore("conf", memoryStorage(), null);
    notes.set("a", "keep me");
    const undo = notes.delete("a");
    expect(notes.has("a")).toBe(false);
    undo();
    expect(notes.get("a")).toBe("keep me");
  });
  it("merges imported notes, with an undo", () => {
    const notes = createNotesStore("conf", memoryStorage(), null);
    notes.set("a", "mine");
    const result = notes.merge({ a: "theirs", b: "new", c: "" });
    expect(result).toMatchObject({ added: 1, combined: 1 });
    expect(notes.value).toEqual({ a: "mine\n\ntheirs", b: "new" });
    result.undo();
    expect(notes.value).toEqual({ a: "mine" });
  });
  it("survives broken or unavailable storage", () => {
    const storage = memoryStorage();
    storage.setItem(KEY, "{not json");
    expect(createNotesStore("conf", storage, null).value).toEqual({});
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const notes = createNotesStore("conf", full, null);
    // kept in memory for this visit; set says it couldn't save on the device
    expect(notes.set("a", "x")).toBe(false);
    expect(notes.get("a")).toBe("x");
    warn.mockRestore();
    const none = createNotesStore("conf", null, null);
    expect(none.set("a", "y")).toBe(true);
    expect(none.get("a")).toBe("y");
  });
  it("adopts another tab's notes", () => {
    const storage = memoryStorage();
    const events = new EventTarget();
    const notes = createNotesStore("conf", storage, events);
    const seen = vi.fn();
    notes.addEventListener("input", seen);
    storage.setItem(KEY, '{"z":"from the other tab"}');
    const event = new Event("storage");
    event.key = KEY;
    events.dispatchEvent(event);
    expect(notes.get("z")).toBe("from the other tab");
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe("notes stay out of links and requests", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf-8");
  it("the share link and URL state code never read notes", () => {
    for (const file of [
      "../src/lib/share.js",
      "../src/lib/urlState.js",
      "../src/components/exploreUrl.js",
      "../src/components/paperRoute.js",
      "../src/components/shareDialog.js",
    ])
      expect(read(file)).not.toMatch(/notes/i);
  });
  it("the notes code never builds URLs or sends requests", () => {
    for (const file of [
      "../src/lib/notes.js",
      "../src/components/paperNote.js",
      "../src/components/noteMarkers.js",
    ])
      expect(read(file)).not.toMatch(
        /fetch\(|XMLHttpRequest|sendBeacon|location\.|history\.|URLSearchParams|new URL/,
      );
  });
});
