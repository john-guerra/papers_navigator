import { html } from "htl";
import { formatDay, formatTime } from "../lib/time.js";
import { rankSessions, sessionSummary } from "../lib/live.js";
import { awardMark, typePill } from "../widgets/paperMarks.js";

/** Papers an expanded session shows before "Show all n" (#203). */
export const SESSION_ROWS = 10;

const plural = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** A real link to the paper's details; a plain click opens them in place. */
export function titleLink(p, { detailsHref, onOpen }) {
  const a = html`<a class="live-title" href=${detailsHref(p)}>${p.title}</a>`;
  a.onclick = (event) => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey)
      return;
    event.preventDefault();
    onOpen(p);
  };
  return a;
}

/** One compact paper row: pill, award, title, authors · topic; yours marked. */
export function livePaperRow(p, { mineIds, detailsHref, onOpen }) {
  const mine = mineIds.has(p.id);
  const authors = (p.authors ?? []).map((a) => a.name).join(", ");
  return html`<li
    class=${`live-paper${mine ? " is-mine" : ""}`}
    data-paper-id=${p.id}
  >
    <div class="paper-head">
      ${typePill(p)}${awardMark(p)}${titleLink(p, { detailsHref, onOpen })}
    </div>
    <div class="live-paper-meta">
      ${[authors, p.clusterLabel].filter(Boolean).join(" · ")}${mine ? html` · <span class="live-in-mine">In My Papers</span>` : ""}
    </div>
  </li>`;
}

function sessionCard(session, { tz, mineIds, onGoing, detailsHref, onOpen }) {
  const list = html`<ol class="live-papers"></ol>`;
  const show = (n) => {
    list.replaceChildren(
      ...session.items
        .slice(0, n)
        .map((p) => livePaperRow(p, { mineIds, detailsHref, onOpen })),
    );
    if (session.items.length > n) {
      const all = html`<li>
        <button type="button" class="btn-text live-show-all">
          Show all ${session.items.length}
        </button>
      </li>`;
      all.querySelector("button").onclick = () => show(Infinity);
      list.append(all);
    }
  };
  show(SESSION_ROWS);
  const going = html`<button type="button" class="live-going">
    Going here
  </button>`;
  going.onclick = () => onGoing(session);
  return html`<article
    class=${`live-session${session.recommended ? " is-recommended" : ""}`}
    data-session-id=${session.sessionId}
  >
    <header class="live-session-head">
      <div>
        ${session.recommended ? html`<span class="live-recommended">Recommended</span>` : ""}
        <h3 class="live-session-name">${session.sessionName}</h3>
        <div class="live-where">
          📍 ${session.room ?? "Room TBA"} ·
          ${formatTime(session.start, tz)}–${formatTime(session.end, tz)}
        </div>
      </div>
      <div class=${`live-mine${session.mine ? "" : " is-zero"}`}>
        <strong>${session.mine}</strong> of yours
      </div>
    </header>
    <p class="live-summary">${sessionSummary(session)}</p>
    <details class="live-expand">
      <summary>Papers</summary>
      ${list}
    </details>
    ${going}
  </article>`;
}

function slotSection(slot, label, options) {
  const sessions = rankSessions(slot, options.mineIds);
  return html`<section
    class=${`live-slot ${label === "Now" ? "live-now" : "live-next"}`}
  >
    <h2 class="live-slot-title">
      ${label} ·
      ${formatTime(slot.start, options.tz)}–${formatTime(slot.end, options.tz)}
      <span class="muted">· ${plural(sessions.length, "session")}</span>
    </h2>
    ${sessions.map((s) => sessionCard(s, options))}
  </section>`;
}

/**
 * The Live page's break view (#203): the running slot ("Now", if any) and the next one, each
 * session a card ranked by how many of your papers it has (rankSessions), with its summary,
 * an expandable list of compact paper rows and "Going here" (`onGoing(session)`); then
 * "Later today" (`onPickSlot(slot)` moves the time there). With nothing left today it says so
 * and offers the next day's first slot.
 */
export function renderBreakView(
  { now, next, later, nextDay },
  { tz, mineIds, onGoing, onPickSlot, onOpen, detailsHref },
) {
  const options = { tz, mineIds, onGoing, onOpen, detailsHref };
  const mineIn = (slot) =>
    slot.sessions.reduce(
      (n, s) => n + s.items.filter((p) => mineIds.has(p.id)).length,
      0,
    );
  const laterButtons = later.map((slot) => {
    const b = html`<button type="button">
      <strong>${formatTime(slot.start, tz)}</strong> ·
      ${plural(slot.sessions.length, "session")} · ${mineIn(slot)} of yours
    </button>`;
    b.onclick = () => onPickSlot(slot);
    return html`<li>${b}</li>`;
  });
  let tail = "";
  if (!next) {
    const button = nextDay
      ? html`<button type="button" class="live-next-day">
          Next: ${formatDay(nextDay.date)} ·
          ${formatTime(nextDay.slot.start, tz)}
        </button>`
      : "";
    if (button) button.onclick = () => onPickSlot(nextDay.slot);
    tail = html`<p class="live-empty">
      ${now ? "Nothing after this today." : "No more sessions today."} ${button}
    </p>`;
  }
  return html`<div class="live-break">
    ${now ? slotSection(now, "Now", options) : ""}
    ${next ? slotSection(next, "Next", options) : ""} ${tail}
    ${
      laterButtons.length
        ? html`<section class="live-later">
            <h2 class="live-slot-title">Later today</h2>
            <ul>
              ${laterButtons}
            </ul>
          </section>`
        : ""
    }
  </div>`;
}
