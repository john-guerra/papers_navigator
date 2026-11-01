// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { bindNoteMarkers } from "../src/components/noteMarkers.js";
import { PapersList } from "../src/widgets/papersList.js";
import { createNotesStore } from "../src/lib/notes.js";

const papers = [
  { id: "a", title: "A", authors: [] },
  { id: "b", title: "B", authors: [] },
];
const flush = () => new Promise((resolve) => setTimeout(resolve));
const setup = (options) => {
  const notes = createNotesStore("conf", null, null);
  notes.set("a", "Ask about <b>the</b> study");
  const root = document.createElement("section");
  root.append(PapersList(papers, { tz: "US/Eastern" }));
  document.body.append(root);
  const dispose = bindNoteMarkers(root, notes, options);
  const row = (id) => root.querySelector(`.paper[data-paper-id="${id}"]`);
  return { notes, root, dispose, row };
};

describe("bindNoteMarkers", () => {
  afterEach(() => document.body.replaceChildren());

  it("marks rows of papers with a note with “📝 Note”", () => {
    const { row } = setup();
    expect(row("a").querySelector(".note-marker").textContent).toBe("📝 Note");
    expect(row("b").querySelector(".note-marker")).toBeNull();
  });

  it("follows the store: new, deleted and changed notes", () => {
    const { row, notes } = setup();
    notes.set("b", "Later");
    notes.delete("a");
    expect(row("a").querySelector(".note-marker")).toBeNull();
    expect(row("b").querySelector(".note-marker")).not.toBeNull();
  });

  it("marks rows added later (a re-rendered list, Show more)", async () => {
    const { root, notes } = setup();
    notes.set("c", "x");
    root.replaceChildren(
      PapersList([{ id: "c", title: "C", authors: [] }], { tz: "US/Eastern" }),
    );
    await flush();
    expect(
      root.querySelector('[data-paper-id="c"] .note-marker'),
    ).not.toBeNull();
  });

  it("with text: shows the note itself as text (never as HTML)", () => {
    const { row, notes } = setup({ text: true });
    const note = row("a").querySelector(".paper-note-text");
    expect(note.textContent).toBe("📝 Ask about <b>the</b> study");
    expect(note.querySelector("b")).toBeNull();
    expect(row("a").querySelector(".note-marker")).toBeNull();
    notes.set("a", "Changed");
    expect(row("a").querySelector(".paper-note-text").textContent).toBe(
      "📝 Changed",
    );
  });

  it("adds no dangling separator when the meta line is empty", () => {
    const { row } = setup();
    const where = row("a").querySelector(".paper-where");
    expect(where.textContent.trim()).toBe("📝 Note");
  });

  it("with text: a row without “More” shows the whole note (not clamped)", () => {
    const notes = createNotesStore("conf", null, null);
    notes.set("a", "long note");
    notes.set("b", "long note");
    const root = document.createElement("section");
    root.append(
      PapersList(
        [
          { id: "a", title: "A", authors: [] },
          { id: "b", title: "B", authors: [], abstract: "Has More" },
        ],
        { tz: "US/Eastern" },
      ),
    );
    bindNoteMarkers(root, notes, { text: true });
    const note = (id) =>
      root.querySelector(`[data-paper-id="${id}"] .paper-note-text`);
    expect(note("a").classList).toContain("paper-note-full");
    expect(note("b").classList).not.toContain("paper-note-full");
  });

  it("marks itinerary items too", () => {
    const notes = createNotesStore("conf", null, null);
    notes.set("a", "x");
    const root = document.createElement("ul");
    root.innerHTML = `<li class="itinerary-item" data-paper-id="a"><a>A</a></li>`;
    bindNoteMarkers(root, notes);
    expect(root.querySelector(".note-marker").textContent).toBe("📝 Note");
  });

  it("stops after dispose", () => {
    const { row, notes, dispose } = setup();
    dispose();
    notes.set("b", "x");
    expect(row("b").querySelector(".note-marker")).toBeNull();
  });
});
