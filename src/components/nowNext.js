import { html } from "htl";
import { formatTime } from "../lib/time.js";

/** Mobile "Now / Next" cards built from `nowNext()` (see lib/schedule.js). */
export function renderNowNext({ now, nowItem, next }, { tz }) {
  const nowCard = now
    ? html`<div class="now">
        <div class="label">NOW · until ${formatTime(now.end, tz)}</div>
        <div class="room">📍 ${now.recommended.room ?? "Room TBA"}</div>
        <div>${now.recommended.sessionName}</div>
        <div class="small">
          ${now.recommended.items.length} of your
          papers${nowItem ? html` · next up: <strong>${nowItem.title}</strong> (${formatTime(nowItem.start, tz)})` : ""}
        </div>
        ${now.alternatives.length ? html`<div class="small conflict">⚠ also ${now.alternatives.map((s) => s.room).join(", ")}</div>` : ""}
      </div>`
    : html`<div class="now idle">Nothing you follow right now.</div>`;

  return html`<div class="now-next">
    ${nowCard}
    ${next.map(
      (slot) =>
        html`<div class="next">
          <strong
            >${formatTime(slot.start, tz)} · 📍
            ${slot.recommended.room ?? "Room TBA"}</strong
          ><br />
          ${slot.recommended.sessionName} · ${slot.recommended.items.length}
          papers
          ${slot.alternatives.length ? html` <span class="conflict">⚠ ${slot.alternatives.length} conflict</span>` : ""}
        </div>`,
    )}
  </div>`;
}
