/**
 * Paper notes (#152): a private note on any paper, whether or not it is in My Papers.
 *
 * Privacy: notes live only in this browser's localStorage, per conference
 * (`papersNavigator:<id>:notes`), and in the My Papers export file so they can move devices.
 * They never go in a URL (query or fragment), a share link or a request.
 */

/** Characters kept per note (a long page of text; keeps localStorage use bounded). */
export const MAX_NOTE_LENGTH = 10000;

/** A note as stored: trimmed and capped; "" means no note. */
export function cleanNote(text) {
  return typeof text === "string" ? text.trim().slice(0, MAX_NOTE_LENGTH) : "";
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
      notes[id] = text.includes(mine) ? text : cleanNote(`${mine}\n\n${text}`);
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
 * `merge(notes)` return an undo.
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
    }
    store.dispatchEvent(new Event("input"));
    return saved;
  };
  // Another tab wrote or deleted a note
  events?.addEventListener?.("storage", (event) => {
    if (event.key !== key) return;
    value = load();
    store.dispatchEvent(new Event("input"));
  });
  store.get = (id) => value[id] ?? "";
  store.has = (id) => Boolean(value[id]);
  store.set = (id, text) => {
    const note = cleanNote(text);
    if ((value[id] ?? "") === note) return true;
    const next = { ...value };
    if (note) next[id] = note;
    else delete next[id];
    return save(next);
  };
  store.delete = (id) => {
    const previous = value[id];
    if (previous) store.set(id, "");
    return () => previous && store.set(id, previous);
  };
  store.merge = (incoming) => {
    const before = value;
    const { notes, added, combined } = mergeNotes(value, incoming);
    if (added || combined) save(notes);
    return { added, combined, undo: () => (added || combined) && save(before) };
  };
  Object.defineProperty(store, "value", { get: () => value });
  return store;
}
