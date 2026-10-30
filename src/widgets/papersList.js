import { html } from "htl";
import { formatWhen } from "../lib/time.js";

/** Awards as DESIGN.md markers, always followed by their name (Emoji & Iconography). */
export const AWARDS = {
  best: "🏆 Best paper",
  honorable: "🏅 Honorable mention",
  BEST_PAPER: "🏆 Best paper",
  HONORABLE_MENTION: "🏅 Honorable mention",
};

/** "Tue Nov 10 10:00 ET": when the paper (or its session) starts, in the conference timezone. */
export function paperWhen(p, tz, tzLabel) {
  return formatWhen(p.start ?? p.sessionStart, tz, tzLabel);
}

/**
 * "Ann (MIT), Bo (ETH)": each name links to `authorHref(name)` when given (a researcher's
 * profile, #78), with its affiliation as plain text after it.
 */
export function authorsLine(authors = [], authorHref) {
  return authors.map(
    (a, i) =>
      html`${i ? ", " : ""}${authorHref ? html`<a class="author-link" href=${authorHref(a.name)}>${a.name}</a>` : a.name}${a.affiliation ? ` (${a.affiliation})` : ""}`,
  );
}

/** "Conference page ↗": the paper on the conference website, in a new tab ("" without a URL). */
export function conferenceLink(p) {
  return p.url
    ? html`<a
        class="conference-link"
        href=${p.url}
        target="_blank"
        rel="noopener"
        >Conference page ↗</a
      >`
    : "";
}

/**
 * The paper's similarity score as a percentage ("54%", or "54% · abstract 2" with a `note`),
 * for the right side of its row (DESIGN.md → Paper row); "" without a score.
 */
export function paperScore(p, note = "") {
  if (p.score == null) return "";
  const text = `${Math.round(p.score * 100)}%${note ? ` · ${note}` : ""}`;
  return html`<span class="paper-score" title=${`Similarity ${text}`}
    ><span class="sr-only">Similarity </span>${text}</span
  >`;
}

/**
 * The title: with `details` ({href(p), open(p)}) it opens the paper's details in the app (a real
 * link, so cmd/ctrl/middle-click still opens a new tab); otherwise the conference page.
 */
function titleLink(p, details) {
  if (!details)
    return html`<a class="title" href=${p.url} target="_blank" rel="noopener"
      >${p.title}</a
    >`;
  const a = html`<a class="title paper-details-open" href=${details.href(p)}
    >${p.title}</a
  >`;
  a.onclick = (event) => {
    if (
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    details.open(p);
  };
  return a;
}

function renderPaper(
  p,
  { tz, tzLabel, actions, preamble, authorHref, details },
) {
  // DESIGN.md → Paper row: meta line = (award) · type · session · 📍 room · day, time ET
  const where = [
    AWARDS[p.award],
    p.typeLabel ?? p.type,
    p.sessionName,
    p.room && `📍 ${p.room}`,
    paperWhen(p, tz, tzLabel),
  ]
    .filter(Boolean)
    .join(" · ");
  const row = html`<div class="paper" data-paper-id=${p.id}>
    <div class="paper-title">
      ${titleLink(p, details)} ${actions ? actions(p) : ""}
    </div>
    ${preamble ? html`<div class="paper-preamble">${preamble(p)}</div>` : ""}
    <div class="paper-authors">${authorsLine(p.authors, authorHref)}</div>
    <div class="paper-where">
      ${where}
      ${(p.links ?? []).map((l) => html` · <a href=${l.url} target="_blank" rel="noopener">${l.label}</a>`)}
    </div>
    ${p.abstract ? html`<div class="paper-abstract">${p.abstract}</div>` : ""}
  </div>`;
  // Authors and abstract are clamped; "More" expands the row in place (no inner scrolling)
  const authorsText = row.querySelector(".paper-authors").textContent;
  if (p.abstract || authorsText.length > 160) {
    const more = html`<button class="btn-text paper-more" aria-expanded="false">
      More
    </button>`;
    more.onclick = () => {
      const expanded = row.classList.toggle("expanded");
      more.textContent = expanded ? "Less" : "More";
      more.setAttribute("aria-expanded", String(expanded));
    };
    row.append(more);
  }
  return row;
}

/**
 * List of papers with title link, authors (affiliations), type, session, room, time in
 * the conference timezone, public links and abstract. Ported from @john-guerra/papers-list.
 * `authorHref(name)`, if given, makes each author name a link (e.g. to their profile).
 */
export function PapersList(
  papers,
  {
    tz,
    tzLabel,
    actions,
    preamble,
    authorHref,
    details,
    header,
    max = 100,
    shown: initial = max,
    onShow,
  } = {},
) {
  const list = html`<div class="papers-list">
    ${header ? html`<h3>${header}</h3>` : ""}
  </div>`;
  let shown = 0;
  // Every paper is reachable: the first rows, then "Show n more" appends the next batch in
  // place. `shown`/`onShow` let a page keep the expansion when it re-renders the list.
  const reveal = (count) => {
    list.querySelector(".papers-more")?.remove();
    const batch = papers.slice(shown, shown + count);
    list.append(
      ...batch.map((p) =>
        renderPaper(p, {
          tz,
          tzLabel,
          actions,
          preamble,
          authorHref,
          details,
        }),
      ),
    );
    shown += batch.length;
    const rest = papers.length - shown;
    if (rest > 0) {
      const button = html`<button class="btn-text">
        Show ${Math.min(rest, max)} more
      </button>`;
      button.onclick = () => {
        reveal(max);
        onShow?.(shown);
      };
      list.append(
        html`<p class="papers-more">
          ${button} <span>(${rest} not shown yet)</span>
        </p>`,
      );
    }
  };
  reveal(Math.max(max, initial));
  /** Reveals rows (in batches) until paper `id` is rendered; returns its row, or null. */
  list.showThrough = (id) => {
    const index = papers.findIndex((p) => p.id === id);
    if (index < 0) return null;
    if (index >= shown) {
      reveal(Math.ceil((index + 1 - shown) / max) * max);
      onShow?.(shown);
    }
    return list.querySelector(`[data-paper-id="${CSS.escape(id)}"]`);
  };
  return list;
}
