import { reportStorageFailure } from "./storageHealth.js";
/**
 * Paper notes (#152): a private note on any paper, whether or not it is in My Papers. The same
 * store keeps notes on Live's sessions without papers (plenaries, panels…) under
 * `session:<sessionId>` (src/lib/live.js sessionNoteId), so ids are paper ids or that prefix.
 *
 * Privacy: notes live only in this browser's localStorage, per conference
 * (`papersNavigator:<id>:notes`), and in the My Papers export file so they can move devices.
 * They never go in a URL (query or fragment), a share link or a request.
 */

/**
 * Characters you can type in one note (a long page; keeps localStorage use bounded). Only
 * typing is capped: imported and merged notes are kept whole, so an import never loses text.
 */
export const MAX_NOTE_LENGTH = 10000;

/** A note as stored: trimmed; "" means no note. */
export function cleanNote(text) {
  return typeof text === "string" ? text.trim() : "";
}

/** Validated notes from storage or an imported file: `{paperId: text}`, empty notes dropped. */
export function cleanNotes(notes) {
  if (!notes || typeof notes !== "object" || Array.isArray(notes)) return {};
  const out = {};
  for (const [id, text] of Object.entries(notes)) {
    const note = cleanNote(text);
    if (id && note) out[id] = note;
  }
  return out;
}

/**
 * Imported notes merged into `current` without losing any text: a new paper's note is added;
 * when both have a different note, the one that contains the other wins, else both are kept
 * (yours first, a blank line between). Returns `{notes, added, combined}` (counts for the
 * import message).
 */
export function mergeNotes(current, incoming) {
  const notes = { ...current };
  let added = 0;
  let combined = 0;
  for (const [id, text] of Object.entries(cleanNotes(incoming))) {
    const mine = notes[id];
    if (!mine) {
      notes[id] = text;
      added++;
    } else if (mine.includes(text)) continue;
    else {
      notes[id] = text.includes(mine) ? text : `${mine}\n\n${text}`;
      combined++;
    }
  }
  return { notes, added, combined };
}

/** "1 note", "3 notes". */
export function notesCount(n) {
  return `${n} ${n === 1 ? "note" : "notes"}`;
}

/** What an import did to your notes, as a sentence to append (" 2 notes added."); "" if nothing. */
export function importedNotesText({ added, combined }) {
  const parts = [
    added && `${notesCount(added)} added`,
    combined && `${notesCount(combined)} combined with yours (no text lost)`,
  ].filter(Boolean);
  return parts.length ? ` ${parts.join("; ")}.` : "";
}

/**
 * Notes, persisted per conference in localStorage. Reactive store: `.value` is `{paperId:
 * text}` and it emits `input` on every change (also another tab's). `set(id, text)` returns
 * false when the browser couldn't save it (the note is kept for this visit); `delete(id)` and
 * `merge(notes)` return an undo, which leaves alone any note changed since. `dispose()` stops
 * following other tabs.
 */
export function createNotesStore(
  conferenceId,
  storage = globalThis.localStorage,
  events = globalThis,
) {
  const key = `papersNavigator:${conferenceId}:notes`;
  const store = new EventTarget();
  const load = () => {
    if (!storage) return value;
    try {
      return cleanNotes(JSON.parse(storage.getItem(key) ?? "{}"));
    } catch {
      return {};
    }
  };
  let value = {};
  value = load();
  const save = (next) => {
    value = next;
    let saved = true;
    try {
      storage?.setItem(key, JSON.stringify(next));
    } catch (error) {
      saved = false;
      console.warn("Could not save notes on this device", error);
      reportStorageFailure();
    }
    store.dispatchEvent(new Event("input"));
    return saved;
  };
  // Another tab wrote or deleted a note
  const onStorage = (event) => {
    if (event.key !== key) return;
    value = load();
    store.dispatchEvent(new Event("input"));
  };
  events?.addEventListener?.("storage", onStorage);
  store.dispose = () => events?.removeEventListener?.("storage", onStorage);
  // One note set as is ("" deletes it). Starts from what is saved: a note that couldn't be
  // saved stays on screen for this visit, but is never written later in another's place.
  const write = (id, note) => {
    const saved = load();
    if ((saved[id] ?? "") === note && (value[id] ?? "") === note) return true;
    const next = { ...saved };
    if (note) next[id] = note;
    else delete next[id];
    return save(next);
  };
  store.get = (id) => value[id] ?? "";
  store.has = (id) => Boolean(value[id]);
  store.set = (id, text) =>
    write(id, cleanNote(text).slice(0, MAX_NOTE_LENGTH));
  // Undo only if you haven't written a new note since
  store.delete = (id) => {
    const previous = value[id];
    if (previous) write(id, "");
    return () => previous && !value[id] && write(id, previous);
  };
  store.merge = (incoming) => {
    value = load();
    const before = value;
    const { notes, added, combined } = mergeNotes(value, incoming);
    if (added || combined) save(notes);
    // Undo puts back each note the import changed, unless you edited it since
    const undo = () => {
      value = load();
      const next = { ...value };
      let changed = false;
      for (const id of Object.keys(notes)) {
        if (notes[id] === before[id] || value[id] !== notes[id]) continue;
        if (before[id]) next[id] = before[id];
        else delete next[id];
        changed = true;
      }
      if (changed) save(next);
    };
    return { added, combined, undo };
  };
  /**
   * Two-way transfer: sets `put` (`{id: text}`, kept whole: only typing is capped) and drops
   * `remove`, in one write.
   */
  store.applyEntries = ({ put = {}, remove = [] } = {}) => {
    const next = { ...load() };
    for (const id of remove) delete next[id];
    Object.assign(next, cleanNotes(put));
    if (save(next)) return true;
    // Not saved: show what is saved, so nothing writes these notes later by accident
    value = load();
    store.dispatchEvent(new Event("input"));
    return false;
  };
  Object.defineProperty(store, "value", { get: () => value });
  return store;
}
