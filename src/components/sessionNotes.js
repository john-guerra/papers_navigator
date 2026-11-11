import { html } from "htl";
import { dayKey, formatDay, formatTime } from "../lib/time.js";
import { quickNote } from "./quickNote.js";

const PREFIX = "session:";

/**
 * "Session notes" (Live page): your notes on sessions without papers (plenaries, panels,
 * meetups…; written while checked in, key `session:<sessionId>` in the notes store), so they stay
 * reachable after their slot: by time, each with its name, type, 📍 room · day time and its note
 * to edit (the same quick note). A note whose session left the program is kept, under its id.
 * `sessions` is sessions.json; `notes` the notes store (`.value`, `get`, `set`).
 * `el.dispose()` saves pending typing and stops following the store.
 */
export function renderSessionNotes(sessions, { notes, tz }) {
  const byId = new Map(sessions.map((s) => [s.sessionId, s]));
  const ids = Object.keys(notes.value ?? {})
    .filter((key) => key.startsWith(PREFIX) && notes.get(key))
    .map((key) => key.slice(PREFIX.length));
  const start = (id) => byId.get(id)?.start ?? "~";
  ids.sort((a, b) => (start(a) < start(b) ? -1 : start(a) > start(b) ? 1 : 0));
  const fields = [];
  const rows = ids.map((id) => {
    const s = byId.get(id);
    const name = s?.title ?? id;
    const field = quickNote({ id: PREFIX + id, title: name }, { notes });
    fields.push(field);
    const when = s?.start
      ? `${formatDay(dayKey(new Date(s.start), tz))} ${formatTime(new Date(s.start), tz)}`
      : "";
    return html`<li class="session-note" data-session-id=${id}>
      <div class="session-note-name">${name}</div>
      <div class="live-where">
        ${[s?.typeLabel, s?.room && `📍 ${s.room}`, when].filter(Boolean).join(" · ")}
      </div>
      ${field}
    </li>`;
  });
  const el = html`<section class="session-notes">
    ${
      rows.length
        ? html`<ol class="session-notes-list">
            ${rows}
          </ol>`
        : html`<p class="muted">
            Notes you take in plenaries, panels and meetups (check in with Going
            here) show up here.
          </p>`
    }
  </section>`;
  el.dispose = () => fields.forEach((f) => f.dispose());
  return el;
}
