import { html } from "htl";
import { dayKey, formatDay, formatTime } from "../lib/time.js";

function renderItem(p, { tz, onUnfollow }) {
  const unfollow = html`<button class="unfollow" title="Unfollow">✕</button>`;
  unfollow.onclick = () => onUnfollow?.(p.id);
  return html`<li class="itinerary-item">
    <span class="time">${p.start ? formatTime(p.start, tz) : "—"}</span>
    <a href=${p.url} target="_blank" rel="noopener">${p.title}</a>
    ${p.reason ? html`<span class="reason">${p.reason}</span>` : ""}
    ${unfollow}
  </li>`;
}

function renderSession(session, options, { alternative = false } = {}) {
  return html`<details class="session ${alternative ? "alternative" : "recommended"}" open=${!alternative}>
    <summary>
      ${alternative ? html`<span class="conflict">⚠ also</span> ` : ""}<strong>📍 ${session.room ?? "Room TBA"}</strong>
      — ${session.sessionName}
      <span class="badge">${session.items.length}</span>
    </summary>
    <ul>${session.items.map((p) => renderItem(p, options))}</ul>
  </details>`;
}

function renderSlot(slot, options) {
  const { tz } = options;
  const { recommended, alternatives } = slot;
  return html`<details class="slot">
    <summary>
      <span class="slot-time">${formatTime(slot.start, tz)}–${formatTime(slot.end, tz)}</span>
      <strong>📍 ${recommended.room ?? "Room TBA"}</strong> — ${recommended.sessionName}
      <span class="badge">${recommended.items.length}</span>
      ${alternatives.length ? html`<span class="conflict">⚠ ${alternatives.length} also</span>` : ""}
    </summary>
    ${renderSession(recommended, options)}
    ${alternatives.map((s) => renderSession(s, options, { alternative: true }))}
  </details>`;
}

/**
 * Collapsible daily itinerary: one tab per day, one row per slot showing the recommended
 * room, expandable to the followed papers and conflicting sessions ("⚠ also").
 */
export function renderItinerary({ days, unscheduled }, { tz, onUnfollow, now = new Date() } = {}) {
  const options = { tz, onUnfollow };
  const today = dayKey(now, tz);
  let selected = days.find((d) => d.date === today)?.date ?? days[0]?.date;

  const panels = html`<div class="day-panels"></div>`;
  const tabs = html`<div class="day-tabs" role="tablist"></div>`;

  function render() {
    tabs.replaceChildren(
      ...days.map((d) => {
        const tab = html`<button role="tab" aria-selected=${d.date === selected} class=${d.date === selected ? "on" : ""}>${formatDay(d.date)}</button>`;
        tab.onclick = () => {
          selected = d.date;
          render();
        };
        return tab;
      }),
    );
    const day = days.find((d) => d.date === selected);
    panels.replaceChildren(...(day ? day.slots.map((s) => renderSlot(s, options)) : []));
  }
  render();

  return html`<div class="itinerary">
    ${days.length ? tabs : html`<p>Follow some papers on the Explore page to build your schedule.</p>`}
    ${panels}
    ${unscheduled.length
      ? html`<details class="unscheduled"><summary>No scheduled time (${unscheduled.length})</summary>
          <ul>${unscheduled.map((p) => renderItem(p, options))}</ul></details>`
      : ""}
  </div>`;
}
