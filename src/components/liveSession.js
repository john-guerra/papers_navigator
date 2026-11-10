import { html } from "htl";
import { formatTime } from "../lib/time.js";
import { rankSessions, talkAt } from "../lib/live.js";
import { awardMark, typePill } from "../widgets/paperMarks.js";
import { starRating } from "../widgets/starRating.js";
import { quickNote } from "./quickNote.js";
import { titleLink } from "./liveBreak.js";
import { inPlaceDetails } from "../widgets/compactPaperRow.js";
import { authorUrl } from "../lib/authors.js";

const ms = (iso) => (iso ? new Date(iso).getTime() : NaN);

/** "Switch room · n others": the slot's other sessions, their talk now and your next paper. */
function switchBar(session, { slot, at, tz, mineIds, onSwitch }) {
  const others = rankSessions(slot, mineIds).filter(
    (s) => s.sessionId !== session.sessionId,
  );
  if (!others.length) return "";
  const t = at.getTime();
  const options = others.map((s) => {
    const now = talkAt(s, at);
    const yours = s.items.find((p) => mineIds.has(p.id) && ms(p.start) > t);
    const b = html`<button
      type="button"
      class="live-switch-option"
      data-session-id=${s.sessionId}
    >
      <span class="live-switch-room"
        >📍 ${s.room ?? "Room TBA"} · <strong>${s.mine}</strong> of yours</span
      >
      <span class="live-switch-name">${s.sessionName}</span>
      ${now ? html`<span class="live-switch-now">Now: ${now.title}</span>` : ""}
      ${yours ? html`<span class="live-switch-yours">Yours next: ${yours.title} · ${formatTime(yours.start, tz)}</span>` : ""}
    </button>`;
    b.onclick = () => {
      // Close the list first: open, it can cover the talks on a short phone
      b.closest("details").open = false;
      onSwitch(s);
    };
    return b;
  });
  return html`<details class="live-switch">
    <summary>
      Switch room · ${others.length} ${others.length === 1 ? "other" : "others"}
    </summary>
    <div class="live-switch-options">${options}</div>
  </details>`;
}

/**
 * The Live page's session view (#203), once you're "Going here": the session's papers in talk
 * order, the talk at `at` highlighted (`is-now`; `el.setNow(at)` moves it in place,
 * `el.scrollToNow()`), each with 1–5 stars
 * (`ratings`), a quick note (`notes`) and "Add to My Papers" when it isn't there (`onAdd`);
 * "Switch room" (`onSwitch(session)`) and "Leave session" (`onLeave`). `el.dispose()` saves
 * pending notes and stops following the stores.
 */
export function renderSessionView(
  session,
  {
    slot,
    at,
    tz,
    mineIds,
    ratings,
    notes,
    onSwitch,
    onLeave,
    onAdd,
    onOpen,
    detailsHref,
  },
) {
  const now = talkAt(session, at);
  const disposers = [];
  const rows = session.items.map((p) => {
    const stars = starRating(ratings.get(p.id), {
      label: `Rate ${p.title}`,
    });
    stars.addEventListener("input", () => ratings.set(p.id, stars.value));
    const followRating = () => (stars.value = ratings.get(p.id));
    ratings.addEventListener("input", followRating);
    disposers.push(() => ratings.removeEventListener("input", followRating));
    const note = quickNote(p, { notes });
    // Details in place, collapsed (abstract, affiliations, links) and a jump to the full panel
    const details = inPlaceDetails(p, { authorHref: authorUrl, onOpen });
    disposers.push(() => note.dispose());
    let add = "";
    if (!mineIds.has(p.id)) {
      add = html`<button type="button" class="btn-text live-add">
        Add to My Papers
      </button>`;
      add.onclick = () => {
        onAdd(p);
        add.remove();
      };
    }
    return html`<li
      class=${`live-talk${p === now ? " is-now" : ""}`}
      data-paper-id=${p.id}
    >
      <div class="live-talk-time">
        ${Number.isFinite(ms(p.start)) ? formatTime(p.start, tz) : ""}
        <span class="live-now-label">Now</span>
      </div>
      <div class="paper-head">
        ${typePill(p)}${awardMark(p)}${titleLink(p, { detailsHref, onOpen })}
      </div>
      <div class="live-paper-meta">
        ${(p.authors ?? []).map((a) => a.name).join(", ")}
      </div>
      <div class="live-talk-actions">${stars}${add}${details.toggle}</div>
      ${note} ${details.panel}
    </li>`;
  });
  const leave = html`<button type="button" class="btn-text live-leave">
    Leave session
  </button>`;
  leave.onclick = onLeave;
  const el = html`<section class="live-checked-in">
    <header class="live-checked-head">
      <div>
        <h2 class="live-session-name">${session.sessionName}</h2>
        <div class="live-where">
          📍 ${session.room ?? "Room TBA"} ·
          ${formatTime(session.start, tz)}–${formatTime(session.end, tz)}
        </div>
      </div>
      ${leave}
    </header>
    ${switchBar(session, { slot, at, tz, mineIds, onSwitch })}
    <ol class="live-talks">
      ${rows}
    </ol>
  </section>`;
  // The clock ticks: move the highlight in place, so a note being typed keeps its focus
  el.setNow = (time) => {
    const current = talkAt(session, time);
    for (const row of el.querySelectorAll(".live-talk"))
      row.classList.toggle("is-now", row.dataset.paperId === current?.id);
  };
  el.scrollToNow = () =>
    el.querySelector(".is-now")?.scrollIntoView?.({ block: "center" });
  el.dispose = () => disposers.forEach((d) => d());
  return el;
}
