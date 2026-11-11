import { html } from "htl";
import { formatDay } from "../lib/time.js";
import { awardMark, typePill } from "../widgets/paperMarks.js";
import { titleLink } from "./liveBreak.js";

const when = (p) => p.start ?? p.sessionStart ?? "~";

/**
 * "Papers I rated" (#203): every rated paper, best first then by time, with its stars, pill,
 * award, title (opening the details) and note; nothing else, to keep the list short (John: no
 * My Papers toggle, Post or Discussion here; they're on the talks and in the details). Filters:
 * a day and "4★ and up"; changes go to `onFilter({minRating, day})` (the page keeps them and
 * redraws).
 */
export function renderRatedPapers(
  papers,
  {
    ratings,
    notes,
    minRating = 0,
    day = null,
    onFilter,
    onOpen,
    detailsHref,
    // 👎 Not for me (#208): listed after the starred papers
    dislikedIds = [],
  },
) {
  const rated = papers
    .filter((p) => ratings[p.id])
    .sort(
      (a, b) => ratings[b.id] - ratings[a.id] || (when(a) < when(b) ? -1 : 1),
    );
  const disliked = papers
    .filter((p) => dislikedIds.includes(p.id) && !ratings[p.id])
    .sort((a, b) => (when(a) < when(b) ? -1 : 1));
  if (!rated.length && !disliked.length)
    return Object.assign(
      html`<section class="rated-papers">
        <p class="muted">Rate papers in a session and they show up here.</p>
      </section>`,
      { update() {} },
    );
  const shown = rated.filter(
    (p) => ratings[p.id] >= minRating && (!day || p.day === day),
  );
  const days = [
    ...new Set([...rated, ...disliked].map((p) => p.day).filter(Boolean)),
  ].sort();
  // The 4★-and-up filter hides Not for me; the day filter applies to it too
  const shownDisliked = minRating
    ? []
    : disliked.filter((p) => !day || p.day === day);
  const select = html`<select>
    <option value="">All days</option>
    ${days.map((d) => html`<option value=${d}>${formatDay(d)}</option>`)}
  </select>`;
  select.value = day ?? "";
  const box = html`<input type="checkbox" />`;
  box.checked = minRating >= 4;
  const report = () =>
    onFilter({ minRating: box.checked ? 4 : 0, day: select.value || null });
  select.onchange = report;
  box.onchange = report;
  const rows = shown.map((p) => {
    const n = ratings[p.id];
    return html`<li class="rated-paper" data-paper-id=${p.id}>
      <div class="rated-stars" aria-hidden="true">
        ${"★".repeat(n)}${"☆".repeat(5 - n)}
      </div>
      <span class="sr-only">Rated ${n} of 5</span>
      <div class="paper-head">
        ${typePill(p)}${awardMark(p)}${titleLink(p, { detailsHref, onOpen })}
      </div>
      ${notes[p.id] ? html`<p class="rated-note">📝 ${notes[p.id]}</p>` : ""}
    </li>`;
  });
  const el = html`<section class="rated-papers">
    <p>
      <a class="review-all" href="my-papers.html#review=rating"
        >Review all in My Papers →</a
      >
    </p>
    <div class="rated-filters">
      <label class="rated-day">Day ${select}</label>
      <label class="rated-min">${box} 4★ and up</label>
    </div>
    ${
      shown.length
        ? html`<ol class="rated-list">
            ${rows}
          </ol>`
        : html`<p class="muted">No rated papers match.</p>`
    }
    ${
      shownDisliked.length
        ? html`<section class="rated-disliked">
            <h3 class="rated-disliked-title">👎 Not for me</h3>
            <ol class="rated-list">
              ${shownDisliked.map(
                (p) =>
                  html`<li class="rated-paper" data-paper-id=${p.id}>
                    <div class="paper-head">
                      ${typePill(p)}${awardMark(p)}${titleLink(p, { detailsHref, onOpen })}
                    </div>
                    ${notes[p.id] ? html`<p class="rated-note">📝 ${notes[p.id]}</p>` : ""}
                  </li>`,
              )}
            </ol>
          </section>`
        : ""
    }
  </section>`;
  return el;
}
