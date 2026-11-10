import { html } from "htl";
import { formatTime } from "../lib/time.js";
import { talkAt } from "../lib/live.js";
import { awardMark, typePill } from "../widgets/paperMarks.js";
import { verdict } from "./verdict.js";
import { followToggles } from "./followToggles.js";
import { attendedToggle } from "./attendedPapers.js";
import { quickNote } from "./quickNote.js";
import { soonWidget } from "./soonWidget.js";
import { titleLink } from "./liveBreak.js";
import { discussionLink, postToggle } from "./livePost.js";
import { inPlaceDetails } from "../widgets/compactPaperRow.js";
import { authorUrl } from "../lib/authors.js";

const ms = (iso) => (iso ? new Date(iso).getTime() : NaN);

/**
 * The Live page's session view (#203), once you're "Going here": the session's papers in talk
 * order, the talk at `at` highlighted (`is-now`; `el.setNow(at)` moves it in place,
 * `el.scrollToNow()`), each with 1–5 stars
 * (`ratings`), a quick note (`notes`) and "Add to My Papers" when it isn't there (`onAdd`);
 * "Soon" (worth moving for; `onSwitch(session)`) and "Leave session" (`onLeave`). `el.dispose()` saves
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
    // My Papers toggle (John): whether a paper is in My Papers now, and add/remove it
    inMyPapers,
    onToggle,
    onOpen,
    detailsHref,
    // (paper) => the Bluesky post panel (#203 Stage C), or null for no "Post"
    postPanel = null,
    onClosePost,
    // My Papers entries by id (why each is there), for Soon (#208)
    mine = new Map(),
    // 👎 Not for me (#208) and what a star rating does (adds to My Papers)
    disliked = null,
    onRated,
    // Attended papers (#208): "✓ Attended" on each talk
    attended = null,
  },
) {
  const now = talkAt(session, at);
  // "Soon" (#208): worth moving for, over the view; replaces the Switch room list
  const soon = soonWidget({
    slot,
    session,
    at,
    mine,
    tz,
    onSwitch,
    onOpen,
    detailsHref,
  });
  const disposers = [];
  const toggles = followToggles({
    inMyPapers: inMyPapers ?? ((id) => mineIds.has(id)),
    onToggle: onToggle ?? onAdd,
  });
  const rows = session.items.map((p) => {
    // Stars or 👎 Not for me (#208); stars add the paper to My Papers (onRated)
    const stars = verdict(p, { ratings, disliked, onRated });
    disposers.push(() => stars.dispose());
    const was = attended ? attendedToggle(p, attended) : "";
    if (was) disposers.push(() => was.dispose());
    const note = quickNote(p, { notes });
    // Details in place, collapsed (abstract, affiliations, links) and a jump to the full panel
    const details = inPlaceDetails(p, { authorHref: authorUrl, onOpen });
    const post = postToggle(p, postPanel, { onClose: onClosePost });
    disposers.push(() => note.dispose());
    // "Add to My Papers" / "In My Papers" (John): the same toggle as everywhere, in place
    const add = toggles.toggle(p);
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
      <div class="live-talk-actions">
        ${stars}${was}${add}${details.toggle}${post.button}
        <span class="live-discussion-slot"></span>
      </div>
      ${post.slot} ${note} ${details.panel}
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
    ${soon}
    <ol class="live-talks">
      ${rows}
    </ol>
  </section>`;
  // The clock ticks: move the highlight in place, so a note being typed keeps its focus
  el.setNow = (time) => {
    soon.update(time);
    const current = talkAt(session, time);
    for (const row of el.querySelectorAll(".live-talk"))
      row.classList.toggle("is-now", row.dataset.paperId === current?.id);
  };
  el.scrollToNow = () =>
    el.querySelector(".is-now")?.scrollIntoView?.({ block: "center" });
  disposers.push(() => soon.dispose());
  /** My Papers changed (#208): Soon's reasons follow, without rebuilding the view. */
  el.setMine = (next) => {
    soon.update(undefined, next);
    // The My Papers toggles follow (John)
    toggles.update();
  };
  el.dispose = () => disposers.forEach((d) => d());
  /** "💬 Discussion" links (#203 Stage C), once the official account's posts are known. */
  el.setDiscussion = (map) => {
    for (const row of el.querySelectorAll(".live-talk")) {
      const url = map?.get(row.dataset.paperId);
      const slot = row.querySelector(".live-discussion-slot");
      if (url && !slot.firstChild) slot.append(discussionLink(url));
    }
  };
  return el;
}
