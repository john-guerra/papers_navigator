import { html } from "htl";
import { dayKey, formatDay, formatTime } from "../lib/time.js";

const AWARD_EMOJI = { best: "🏆", honorable: "🏅", BEST_PAPER: "🏆", HONORABLE_MENTION: "🏅" };

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
  return html`<div class="paper">
    <div class="paper-title">
      ${AWARD_EMOJI[p.award] ?? ""}<a class="title" href=${p.url} target="_blank" rel="noopener">${p.title}</a>
      ${actions ? actions(p) : ""}
    </div>
    ${preamble ? html`<div class="paper-preamble">${preamble(p)}</div>` : ""}
    <div class="paper-authors">${authors}</div>
    <div class="paper-where">${where}${when ? ` · 🕰️ ${when}` : ""}
      ${(p.links ?? []).map((l) => html` · <a href=${l.url} target="_blank" rel="noopener">${l.label}</a>`)}
    </div>
    ${p.abstract ? html`<div class="paper-abstract">${p.abstract}</div>` : ""}
  </div>`;
}

/**
 * List of papers with title link, authors (affiliations), type, session, room, time in
 * the conference timezone, public links and abstract. Ported from @john-guerra/papers-list.
 */
export function PapersList(papers, { tz, actions, preamble, header, max = 200 } = {}) {
  const shown = papers.slice(0, max);
  const rest = papers.length - shown.length;
  return html`<div class="papers-list">
    ${header ? html`<h3>${header}</h3>` : ""}
    ${shown.map((p) => renderPaper(p, { tz, actions, preamble }))}
    ${rest > 0 ? html`<p class="papers-more">…and ${rest} more. Narrow the selection to see them.</p>` : ""}
  </div>`;
}
