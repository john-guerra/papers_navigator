// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderPaperNote } from "../src/components/paperNote.js";
import { createNotesStore } from "../src/lib/notes.js";

const paper = { id: "id-a", title: "A paper" };
const setup = (initial = {}) => {
  const notes = createNotesStore("conf", null, null);
  for (const [id, text] of Object.entries(initial)) notes.set(id, text);
  const toast = vi.fn();
  const el = renderPaperNote(paper, { notes, toast, delay: 300 });
  document.body.append(el);
  const input = el.querySelector("textarea");
  const type = (text) => {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return { el, notes, toast, input, type };
};
const deleteButton = (el) => el.querySelector(".paper-note-delete");

describe("renderPaperNote", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("has a labelled textarea that says where the note is kept", () => {
    const { el, input } = setup();
    expect(el.querySelector("label").textContent).toMatch(/My note/);
    expect(input.labels[0]).toBe(el.querySelector("label"));
    expect(el.textContent).toMatch(/only on this device/i);
    expect(deleteButton(el).hidden).toBe(true);
  });

  it("autosaves while typing, without a Save button", () => {
    const { el, notes, type } = setup();
    expect(el.querySelector("button:not(.paper-note-delete)")).toBeNull();
    type("Ask about the dataset");
    expect(notes.get("id-a")).toBe("");
    vi.advanceTimersByTime(300);
    expect(notes.get("id-a")).toBe("Ask about the dataset");
    expect(el.querySelector(".paper-note-status").textContent).toMatch(
      /Saved on this device/,
    );
    expect(deleteButton(el).hidden).toBe(false);
  });

  it("saves right away on blur and on flush (closing the panel)", () => {
    const { el, notes, input, type } = setup();
    type("on blur");
    input.dispatchEvent(new Event("blur"));
    expect(notes.get("id-a")).toBe("on blur");
    type("on close");
    el.flush();
    expect(notes.get("id-a")).toBe("on close");
  });

  it("shows the saved note and treats an emptied note as no note", () => {
    const { input, notes, type, el } = setup({ "id-a": "Existing" });
    expect(input.value).toBe("Existing");
    type("   ");
    vi.advanceTimersByTime(300);
    expect(notes.has("id-a")).toBe(false);
    expect(deleteButton(el).hidden).toBe(true);
  });

  it("deletes the note with an Undo toast", () => {
    const { el, input, notes, toast } = setup({ "id-a": "Existing" });
    deleteButton(el).click();
    expect(notes.has("id-a")).toBe(false);
    expect(input.value).toBe("");
    expect(toast).toHaveBeenCalledWith(
      "Note deleted",
      expect.objectContaining({ actionLabel: "Undo" }),
    );
    toast.mock.calls[0][1].onAction();
    expect(notes.get("id-a")).toBe("Existing");
    expect(input.value).toBe("Existing");
  });

  it("follows changes from elsewhere (another tab) unless you're typing", () => {
    const { input, notes } = setup({ "id-a": "Old" });
    notes.set("id-a", "From another tab");
    expect(input.value).toBe("From another tab");
    input.focus();
    notes.set("id-a", "Ignored while typing");
    expect(input.value).toBe("From another tab");
  });

  it("says when the browser couldn't save the note", () => {
    const notes = createNotesStore(
      "conf",
      {
        getItem: () => null,
        setItem: () => {
          throw new Error("full");
        },
      },
      null,
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = renderPaperNote(paper, { notes, toast: vi.fn(), delay: 0 });
    const input = el.querySelector("textarea");
    input.value = "x";
    input.dispatchEvent(new Event("input"));
    vi.advanceTimersByTime(0);
    expect(el.querySelector(".paper-note-status").textContent).toMatch(
      /couldn't save/i,
    );
    warn.mockRestore();
  });

  it("stops listening after dispose", () => {
    const { el, input, notes } = setup({ "id-a": "Old" });
    el.dispose();
    notes.set("id-a", "New");
    expect(input.value).toBe("Old");
  });
});
