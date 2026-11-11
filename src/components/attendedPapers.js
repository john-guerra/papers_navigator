import { html } from "htl";
import { formatDay, formatTime } from "../lib/time.js";
import { awardMark, typePill } from "../widgets/paperMarks.js";
import { titleLink } from "./liveBreak.js";

/**
 * "Mark attended" / "✓ Attended" (#208; in details "I was there" / "✓ I was there"): a toggle
 * bound to the attended store (by hand: on, or unticked so the automatic rule leaves it alone).
 * The two states read differently, not only by weight. Follows the store; `dispose()` stops that.
 */
export function attendedToggle(
  paper,
  attended,
  [off, on] = ["Mark attended", "✓ Attended"],
) {
  const b = html`<button
    type="button"
    class="btn-text attended-toggle"
    aria-pressed="false"
  ></button>`;
  const show = () => {
    const yes = attended.isAttended(paper.id);
    b.setAttribute("aria-pressed", String(yes));
    b.textContent = yes ? on : off;
  };
  b.onclick = () => {
    attended.set(paper.id, !attended.isAttended(paper.id));
    show();
  };
  attended.addEventListener("input", show);
  show();
  b.dispose = () => attended.removeEventListener("input", show);
  return b;
}

const when = (p) => p.start ?? p.sessionStart ?? "~";
const isOn = (e) => e && !e.off;

/**
 * "Papers I attended" (#208): by day, in time order, each with its time, pill, award, title (the
 * details), your rating ("★4"), "👎" or "Rate it?" (a link to its details), and your note.
 * `attended`, `ratings`, `disliked`, `notes` are the stores' values.
 */
export function renderAttendedPapers(
  papers,
  {
    attended,
    ratings = {},
    disliked = {},
    notes = {},
    tz,
    onOpen,
    detailsHref,
  },
) {
  const list = papers
    .filter((p) => isOn(attended[p.id]))
    .sort((a, b) => (when(a) < when(b) ? -1 : 1));
  if (!list.length)
    return html`<section class="attended-papers">
      <p class="muted">
        Papers you attend show up here: check in with Going here, or tap I was
        there.
      </p>
    </section>`;
  const days = [...new Set(list.map((p) => p.day ?? ""))];
  const verdictOf = (p) => {
    if (ratings[p.id])
      return html`<span
        class="attended-verdict"
        title=${`Your rating: ${ratings[p.id]} of 5`}
        >★${ratings[p.id]}</span
      >`;
    if (disliked[p.id])
      return html`<span class="attended-verdict" title="Not for me">👎</span>`;
    const rate = html`<a class="attended-rate" href=${detailsHref(p)}
      >Rate it?</a
    >`;
    rate.onclick = (event) => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey)
        return;
      event.preventDefault();
      onOpen(p);
    };
    return rate;
  };
  const el = html`<section class="attended-papers">
    <p>
      <a class="review-all" href="my-papers.html#review=attended"
        >Review all in My Papers →</a
      >
    </p>
    ${days.map(
      (day) =>
        html`<section class="attended-day">
          <h3>${day ? formatDay(day) : "No date"}</h3>
          <ol class="attended-list">
            ${list
              .filter((p) => (p.day ?? "") === day)
              .map(
                (p) =>
                  html`<li class="attended-paper" data-paper-id=${p.id}>
                    <span class="muted attended-time"
                      >${p.start ? formatTime(p.start, tz) : ""}</span
                    >
                    <span class="paper-head"
                      >${typePill(p)}${awardMark(p)}${titleLink(p, { detailsHref, onOpen })}</span
                    >
                    ${verdictOf(p)}
                    ${notes[p.id] ? html`<p class="rated-note">📝 ${notes[p.id]}</p>` : ""}
                  </li>`,
              )}
          </ol>
        </section>`,
    )}
  </section>`;
  return el;
}
