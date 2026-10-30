import { html } from "htl";
import { formatDay, formatTime } from "../lib/time.js";

const plural = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;
const papersOf = (n) => plural(n, "paper");

const slotCard = (slot, tz, { day } = {}) =>
  html`<div class="next">
    <strong
      >${day ? `${formatDay(day)} · ` : ""}${formatTime(slot.start, tz)} · 📍
      ${slot.recommended.room ?? "Room TBA"}</strong
    ><br />
    ${slot.recommended.sessionName} · ${papersOf(slot.recommended.items.length)}
    of yours
    ${
      slot.alternatives.length
        ? html` <span class="conflict"
            >⚠ ${plural(slot.alternatives.length, "conflict")}</span
          >`
        : ""
    }
  </div>`;

/**
 * Phone "Now / Next" view built from `nowNext()` (see lib/schedule.js).
 * `empty`: My Papers has no papers at all (the page knows; `nowNext` only sees scheduled slots).
 */
export function renderNowNext(state, { tz, empty = false }) {
  if (state?.status === "over")
    return html`<div class="now-next">
      <div class="now idle">
        The conference is over. Your itinerary is below for reference.
      </div>
    </div>`;
  if (state?.status === "nothing-today" && empty)
    return html`<div class="now-next">
      <div class="now idle">
        Nothing in My Papers yet — <a href="./">add papers in Explore</a>.
      </div>
    </div>`;
  if (state?.status === "nothing-today")
    return html`<div class="now-next">
      <div class="now idle">Nothing of yours today.</div>
      ${
        state.upcoming
          ? html`<p class="small">Next:</p>
              ${slotCard(state.upcoming.slot, tz, { day: state.upcoming.date })}`
          : html`<p class="small">Nothing more of yours at this conference.</p>`
      }
    </div>`;

  const { now, nowItem, nextItem, next } = state;
  const nowCard = now
    ? html`<div class="now">
        <div class="label">NOW · until ${formatTime(now.end, tz)}</div>
        <div class="room">📍 ${now.recommended.room ?? "Room TBA"}</div>
        <div>${now.recommended.sessionName}</div>
        <div class="small">
          ${papersOf(now.recommended.items.length)} of yours
        </div>
        ${nowItem ? html`<div class="small">now: <strong>${nowItem.title}</strong></div>` : ""}
        ${
          nextItem
            ? html`<div class="small">
                next:
                <strong>${nextItem.title}</strong>
                (${formatTime(nextItem.start, tz)})
              </div>`
            : ""
        }
        ${
          now.alternatives.length
            ? html`<div class="small conflict">
                ⚠ also ${now.alternatives.map((s) => s.room).join(", ")}
              </div>`
            : ""
        }
      </div>`
    : html`<div class="now idle">Nothing of yours right now.</div>`;

  return html`<div class="now-next">
    ${nowCard} ${next.map((slot) => slotCard(slot, tz))}
  </div>`;
}
