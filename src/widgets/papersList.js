import { html } from "htl";
import { dayKey, formatDay, formatTime } from "../lib/time.js";

const AWARD_EMOJI = {
  best: "🏆",
  honorable: "🏅",
  BEST_PAPER: "🏆",
  HONORABLE_MENTION: "🏅",
};

export function paperWhen(p, tz) {
  const iso = p.start ?? p.sessionStart;
  return iso ? `${formatDay(dayKey(iso, tz))} ${formatTime(iso, tz)}` : "";
}

function renderPaper(p, { tz, actions, preamble }) {
  const authors = (p.authors ?? [])
    .map((a) => (a.affiliation ? `${a.name} (${a.affiliation})` : a.name))
    .join(", ");
  const where = [p.typeLabel ?? p.type, p.sessionName, p.room && `📍${p.room}`]
    .filter(Boolean)
    .join(" · ");
  const when = paperWhen(p, tz);
  return html`<div class="paper" data-paper-id=${p.id}>
    <div class="paper-title">
      ${AWARD_EMOJI[p.award] ?? ""}<a
        class="title"
        href=${p.url}
        target="_blank"
        rel="noopener"
        >${p.title}</a
      >
      ${actions ? actions(p) : ""}
    </div>
    ${preamble ? html`<div class="paper-preamble">${preamble(p)}</div>` : ""}
    <div class="paper-authors">${authors}</div>
    <div class="paper-where">
      ${where}${when ? ` · 🕰️ ${when}` : ""}
      ${(p.links ?? []).map((l) => html` · <a href=${l.url} target="_blank" rel="noopener">${l.label}</a>`)}
    </div>
    ${p.abstract ? html`<div class="paper-abstract">${p.abstract}</div>` : ""}
  </div>`;
}

/**
 * List of papers with title link, authors (affiliations), type, session, room, time in
 * the conference timezone, public links and abstract. Ported from @john-guerra/papers-list.
 */
export function PapersList(
  papers,
  { tz, actions, preamble, header, max = 100 } = {},
) {
  const list = html`<div class="papers-list">
    ${header ? html`<h3>${header}</h3>` : ""}
  </div>`;
  let shown = 0;
  // Every paper is reachable: the first `max`, then "Show n more" appends the next batch in place
  const showMore = () => {
    list.querySelector(".papers-more")?.remove();
    const batch = papers.slice(shown, shown + max);
    list.append(...batch.map((p) => renderPaper(p, { tz, actions, preamble })));
    shown += batch.length;
    const rest = papers.length - shown;
    if (rest > 0) {
      const button = html`<button class="btn-text">
        Show ${Math.min(rest, max)} more
      </button>`;
      button.onclick = showMore;
      list.append(
        html`<p class="papers-more">
          ${button} <span>(${rest} not shown yet)</span>
        </p>`,
      );
    }
  };
  showMore();
  return list;
}
