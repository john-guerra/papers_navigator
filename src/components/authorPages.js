import { html } from "htl";
import {
  authorUrl,
  coauthors,
  conflictsWithMyPapers,
  daySummary,
  daySummaryText,
  distinctAffiliations,
  filterAuthors,
  nextPresentation,
  topics,
} from "../lib/authors.js";
import { planAdd } from "../lib/selection.js";
import { PapersList, conferenceLink } from "../widgets/papersList.js";
import { followToggles } from "./followToggles.js";

const plural = (n, word) =>
  `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;
const time = (p) => p.start ?? p.sessionStart ?? "~";

/**
 * Researchers index (#78): everyone listed as an author, most papers first, with a search over
 * names and affiliations and "Show n more" (the program has ~1,500 researchers). `state`
 * ({query, shown}) survives re-renders, so Back to the index keeps the search; `onQuery(text)`
 * hears each change (e.g. to keep it in the URL, #92).
 */
export function renderAuthorIndex(
  index,
  { state = {}, step = 100, onQuery = null } = {},
) {
  state.query ??= "";
  state.shown ??= step;
  const input = html`<input
    type="search"
    class="author-search"
    placeholder="Search names or institutions"
    aria-label="Search researchers by name or institution"
    value=${state.query}
  />`;
  const status = html`<p class="author-count muted" aria-live="polite"></p>`;
  const list = html`<ul class="author-index"></ul>`;
  const more = html`<p class="papers-more"></p>`;
  const draw = () => {
    const matching = filterAuthors(index, state.query);
    status.textContent = state.query
      ? `${plural(matching.length, "researcher")} match “${state.query}”`
      : `${plural(index.length, "researcher")} in the program, most papers first`;
    list.replaceChildren(
      ...matching.slice(0, state.shown).map(
        (a) =>
          html`<li class="author-row">
            <a class="author-link author-name" href=${authorUrl(a.name)}
              >${a.name}</a
            >
            <span class="author-affiliations"
              >${a.affiliations.map((d) => d.value).join(" · ")}</span
            >
            <span class="author-papers"
              >${plural(a.papers.length, "paper")}</span
            >
          </li>`,
      ),
    );
    const rest = matching.length - state.shown;
    more.replaceChildren();
    if (rest > 0) {
      const button = html`<button class="btn-text">
        Show ${Math.min(rest, step)} more
      </button>`;
      button.onclick = () => {
        state.shown += step;
        draw();
      };
      more.append(button, ` (${rest} not shown yet)`);
    }
  };
  input.oninput = () => {
    state.query = input.value;
    state.shown = step;
    onQuery?.(state.query);
    draw();
  };
  draw();
  return html`<div class="author-index-view">
    <h1>Researchers</h1>
    <p class="lede">
      Everyone listed as an author in the program. Open a name to see their
      papers, when they present, their topics and co-authors.
    </p>
    ${input}${status}${list}${more}
  </div>`;
}

/** "Not found" for a name nobody in the program has. */
export function renderAuthorNotFound(name) {
  return html`<div class="author-not-found">
    <h1>${name}</h1>
    <p>
      Nobody named “${name}” is listed as an author in this program. Check the
      spelling, or
      <a href="./authors.html">browse all researchers</a>.
    </p>
  </div>`;
}

/** Topics or keywords with counts, the first `limit` of them ("and n more"). */
const countChips = (all, label, limit = 20) => {
  if (!all.length) return "";
  const rest = all.length - limit;
  return html`<h3 class="label-caps">${label}</h3>
    <ul class="author-chips">
      ${all.slice(0, limit).map((d) => html`<li class="chip"><span>${d.value}</span><span class="chip-label">${d.count}</span></li>`)}
      ${rest > 0 ? html`<li class="muted">and ${rest} more</li>` : ""}
    </ul>`;
};

/**
 * A researcher's profile (#78): name and affiliations as listed, when they present (conference
 * timezone; ⚠ for conflicts with My Papers), topics and keywords, co-authors, and their papers
 * with the My Papers toggle (titles open the details). Actions: `watch` (an element, the Watch toggle) and
 * "Add N to My Papers" (`onAddAll(fresh)`). `el.update()` refreshes everything that depends on
 * My Papers in place (toggles, the add button, conflicts), keeping scroll and focus.
 */
export function renderAuthorProfile(
  author,
  {
    tz,
    tzLabel = "",
    now = new Date(),
    myPapers = () => [],
    inMyPapers,
    onToggle,
    onAddAll,
    onDetails,
    detailsHref = (p) => `?paper=${encodeURIComponent(p.shortId ?? p.id)}`,
    watch = "",
    coauthorLimit = 24,
  },
) {
  const papers = [...author.papers].sort((a, b) =>
    time(a) < time(b) ? -1 : time(a) > time(b) ? 1 : 0,
  );
  const summary = daySummary(papers, tz);
  const next = nextPresentation(papers, now, tz);
  const { topics: topicCounts, keywords } = topics(papers);
  const people = coauthors(author);
  // "ETH Zürich" and "ETH Zurich" are one affiliation spelled two ways, not a homonym hint
  const distinct = distinctAffiliations(author.affiliations);
  const homonymNote =
    distinct > 1
      ? html`<p class="muted author-homonym">
          Listed with ${distinct} affiliations: this may be more than one person
          with the same name.
        </p>`
      : "";

  // Everything below depends on My Papers and is redrawn by update()
  const addSlot = html`<span class="author-add"></span>`;
  const nextSlot = html`<p class="author-next"></p>`;
  const conflictSlots = new Map();
  let conflicts = new Map();
  const conflictNote = (paper) => {
    const list = conflicts.get(paper.id);
    return list
      ? `⚠ Same time as ${list.map((p) => `“${p.title}”`).join(", ")} in My Papers`
      : "";
  };
  const drawMine = () => {
    const ids = new Set(myPapers().map((d) => d.id));
    const plan = planAdd(papers, ids);
    const allIn = plan.total > 0 && !plan.fresh.length;
    const button = html`<button class="btn-primary" disabled=${allIn}>
      ${allIn ? `✓ All ${plan.total} in My Papers` : `Add ${plan.fresh.length} to My Papers`}
    </button>`;
    button.onclick = () => onAddAll(plan.fresh);
    addSlot.replaceChildren(
      button,
      plan.already && !allIn
        ? html` <span class="add-bar-note">${plan.already} already there</span>`
        : "",
    );
    conflicts = conflictsWithMyPapers(papers, myPapers());
    for (const [id, slot] of conflictSlots)
      slot.textContent = conflictNote({ id });
    if (next) {
      const open = html`<button class="btn-text author-next-open">
        ${next.paper.title}
      </button>`;
      open.onclick = () => onDetails(next.paper);
      const conflict = conflictNote(next.paper);
      nextSlot.replaceChildren(
        html`<span class="label-caps">${next.live ? "Now" : "Next"}</span>
          ${next.label}${tzLabel ? ` ${tzLabel}` : ""}${next.paper.room ? ` · 📍 ${next.paper.room}` : ""}
          · `,
        open,
        conflict ? html`<span class="conflict-note">${conflict}</span>` : "",
      );
    } else nextSlot.replaceChildren();
  };

  const toggles = followToggles({ inMyPapers, onToggle });
  const list = PapersList(papers, {
    tz,
    tzLabel: tzLabel || undefined,
    max: 100,
    authorHref: authorUrl,
    preamble: (p) => {
      const slot = html`<span class="conflict-note">${conflictNote(p)}</span>`;
      conflictSlots.set(p.id, slot);
      return slot;
    },
    // The title opens the paper's details; "Conference page ↗" goes to the conference site
    details: { href: detailsHref, open: onDetails },
    actions: (p) =>
      html`<span class="paper-actions"
        >${toggles.toggle(p)}${conferenceLink(p)}</span
      >`,
  });

  const anyTimed = summary.days.length > 0;
  const el = html`<article class="author-profile">
    <p class="author-back"><a href="./authors.html">← All researchers</a></p>
    <h1>${author.name}</h1>
    <p class="author-affiliation-list">
      ${
        author.affiliations.length
          ? author.affiliations.map(
              (d, i) =>
                html`${i ? " · " : ""}${d.value}${author.affiliations.length > 1 ? html` <span class="muted">(${d.count})</span>` : ""}`,
            )
          : html`<span class="muted">No affiliation listed</span>`
      }
    </p>
    ${homonymNote}
    <div class="author-actions">${watch}${addSlot}</div>
    <h2>When they present</h2>
    <p class="author-days">
      ${plural(papers.length, "paper")}${daySummaryText(summary) ? ` · ${daySummaryText(summary)}` : ""}
    </p>
    ${anyTimed ? nextSlot : ""}
    ${anyTimed && !next ? html`<p class="muted">All their presentations are over.</p>` : ""}
    ${
      topicCounts.length || keywords.length
        ? html`<h2>Topics</h2>
            ${countChips(topicCounts, "Map topics")}
            ${countChips(keywords, "Keywords")}`
        : ""
    }
    ${
      people.length
        ? html`<h2>Co-authors <small>(${people.length})</small></h2>
            <ul class="author-coauthors">
              ${people
                .slice(0, coauthorLimit)
                .map(
                  (d) =>
                    html`<li>
                      <a class="author-link" href=${authorUrl(d.name)}
                        >${d.name}</a
                      >${d.count > 1 ? html` <span class="muted">${d.count} papers</span>` : ""}
                    </li>`,
                )}
            </ul>
            ${people.length > coauthorLimit ? html`<p class="muted">and ${people.length - coauthorLimit} more on the papers below.</p>` : ""}`
        : ""
    }
    <h2>Papers <small>(${papers.length})</small></h2>
    ${list}
  </article>`;
  drawMine();
  el.update = () => {
    toggles.update();
    drawMine();
  };
  return el;
}
