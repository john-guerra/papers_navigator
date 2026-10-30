import { html } from "htl";
import { formatDay, formatTime } from "../lib/time.js";

const paperLine = (p) =>
  html`<div class="where-paper">
    <a href="${p.url}" target="_blank" rel="noopener">${p.title}</a>
    ${(p.score * 100).toFixed(1)}%
  </div>`;

const group = (label, papers) =>
  html`<details class="where-group">
    <summary>${label} (${papers.length})</summary>
    ${papers.map(paperLine)}
  </details>`;

/** Collapsible "Rooms to go" / "Sessions you should attend" from `whereToGo()`. */
export function renderWhereToGo({ days, unscheduled }, { tz }) {
  const section = (title, render) =>
    html`<details class="where-section">
      <summary><h3>${title}</h3></summary>
      ${days.map(
        (d) =>
          html`<details class="where-day">
            <summary>${formatDay(d.day)} (${d.count})</summary>
            ${render(d)}
          </details>`,
      )}
      ${unscheduled.length ? group("No scheduled time", unscheduled) : ""}
    </details>`;
  return html`<div class="where-to-go">
    ${section("Rooms to go", (d) =>
      d.rooms.map((r) => group(r.room, r.papers)),
    )}
    ${section("Sessions you should attend", (d) =>
      d.sessions.map((s) =>
        group(
          `${formatTime(s.start, tz)} ${s.room} - ${s.sessionName}`,
          s.papers,
        ),
      ),
    )}
  </div>`;
}
