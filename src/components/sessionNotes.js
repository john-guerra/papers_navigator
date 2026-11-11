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
  // By instant (the program mixes "Z" and "+00:00"); a missing or bad time goes last
  const instant = (id) => {
    const t = Date.parse(byId.get(id)?.start ?? "");
    return Number.isFinite(t) ? t : Infinity;
  };
  ids.sort((a, b) => {
    const [x, y] = [instant(a), instant(b)];
    return x === y ? 0 : x < y ? -1 : 1;
  });
  const fields = [];
  const rows = ids.map((id) => {
    const s = byId.get(id);
    const name = s?.title ?? id;
    const field = quickNote({ id: PREFIX + id, title: name }, { notes });
    fields.push(field);
    const t = instant(id);
    const when = Number.isFinite(t)
      ? `${formatDay(dayKey(new Date(t), tz))} ${formatTime(new Date(t), tz)}`
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
