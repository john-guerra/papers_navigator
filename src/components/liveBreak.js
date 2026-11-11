import { html } from "htl";
import { formatDay, formatTime } from "../lib/time.js";
import {
  rankSessions,
  sessionNoteId,
  sessionSummary,
  sessionTypeColor,
} from "../lib/live.js";
import { awardMark, typePill } from "../widgets/paperMarks.js";
import { followToggles } from "./followToggles.js";

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

/** One compact paper row: pill, award, title, authors · topic, and the My Papers toggle. */
export function livePaperRow(p, { mineIds, detailsHref, onOpen, toggles }) {
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
      ${[authors, p.clusterLabel].filter(Boolean).join(" · ")}${!toggles && mine ? html` · <span class="live-in-mine">In My Papers</span>` : ""}
    </div>
    ${toggles ? html`<div class="live-paper-actions">${toggles.toggle(p)}</div>` : ""}
  </li>`;
}

/** "Details on ieeevis.org ↗" for a session without papers (plenary, panel, meetup). */
export function eventLink(session) {
  return /^https?:\/\//i.test(session.event?.url ?? "")
    ? html`<p class="live-event-note">
        <a
          class="live-event-link"
          href=${session.event.url}
          target="_blank"
          rel="noopener"
          >Details on ieeevis.org ↗</a
        >
      </p>`
    : "";
}

function sessionCard(
  session,
  { tz, mineIds, onGoing, detailsHref, onOpen, toggles, sessionColors, notes },
) {
  // Your note on a session without papers (written when checked in to it)
  const myNote = session.event
    ? (notes?.get(sessionNoteId(session)) ?? "")
    : "";
  const list = html`<ol class="live-papers"></ol>`;
  const show = (n) => {
    list.replaceChildren(
      ...session.items
        .slice(0, n)
        .map((p) => livePaperRow(p, { mineIds, detailsHref, onOpen, toggles })),
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
    data-type-color=${sessionTypeColor(session, sessionColors)}
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
      ${
        session.event
          ? ""
          : html`<div class=${`live-mine${session.mine ? "" : " is-zero"}`}>
              <strong>${session.mine}</strong> of yours
            </div>`
      }
    </header>
    <p class="live-summary">${sessionSummary(session)}</p>
    ${myNote ? html`<p class="live-event-mynote">📝 ${myNote}</p>` : ""}
    ${
      session.event
        ? eventLink(session)
        : html`<details class="live-expand">
            <summary>Papers</summary>
            ${list}
          </details>`
    }
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
  {
    tz,
    mineIds,
    onGoing,
    onPickSlot,
    onOpen,
    detailsHref,
    inMyPapers,
    onToggle,
    // The conference's session type → color (config sessionTypeColors), for each card's corner shadow
    sessionColors,
    // Notes (get(id)): an event card shows yours (session:<id>)
    notes,
  },
) {
  // "Add to My Papers" / "In My Papers" on each paper (John), refreshed in place by setMine
  const toggles = onToggle
    ? followToggles({
        inMyPapers: inMyPapers ?? ((id) => mineIds.has(id)),
        onToggle,
      })
    : null;
  const options = {
    tz,
    mineIds,
    onGoing,
    onOpen,
    detailsHref,
    toggles,
    sessionColors,
    notes,
  };
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
  const el = html`<div class="live-break">
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
  /**
   * My Papers changed (John): the toggles, "n of yours" and the marks follow in place, so an
   * expanded session stays open.
   */
  el.setMine = (ids) => {
    toggles?.update();
    for (const card of el.querySelectorAll(".live-session")) {
      const session = [now, next]
        .filter(Boolean)
        .flatMap((slot) => slot.sessions)
        .find((x) => x.sessionId === card.dataset.sessionId);
      if (!session) continue;
      const n = session.items.filter((p) => ids.has(p.id)).length;
      const box = card.querySelector(".live-mine");
      // A plenary or panel has no papers, so no "of yours"
      if (!box) continue;
      box.querySelector("strong").textContent = String(n);
      box.classList.toggle("is-zero", !n);
    }
    for (const row of el.querySelectorAll(".live-paper"))
      row.classList.toggle("is-mine", ids.has(row.dataset.paperId));
  };
  return el;
}
