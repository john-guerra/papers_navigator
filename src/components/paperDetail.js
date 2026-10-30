import { html } from "htl";
import { paperWhen } from "../widgets/papersList.js";

const AWARDS = {
  best: "🏆 Best paper",
  honorable: "🏅 Honorable mention",
  BEST_PAPER: "🏆 Best paper",
  HONORABLE_MENTION: "🏅 Honorable mention",
};

/**
 * Paper details (#22) with related papers (#23): everything about one paper, its links, the
 * My Papers toggle, and the most similar papers (each opening its own details).
 */
export function renderPaperDetail(
  paper,
  { tz, related = [], inMyPapers, onToggle, onOpen, onClose },
) {
  const toggle = (p) => {
    const on = inMyPapers(p.id);
    const button = html`<button
      class="follow-toggle"
      aria-pressed=${String(on)}
    >
      <span class="ring" aria-hidden="true"></span
      >${on ? "In My Papers" : "Add to My Papers"}
    </button>`;
    button.onclick = () => onToggle(p);
    return button;
  };
  const close = html`<button
    class="filters-close paper-detail-close"
    aria-label="Close details"
  >
    Close ✕
  </button>`;
  close.onclick = onClose;
  const authors = (paper.authors ?? [])
    .map((a) => (a.affiliation ? `${a.name} (${a.affiliation})` : a.name))
    .join(", ");
  const where = [
    paper.typeLabel ?? paper.type,
    paper.sessionName,
    paper.room && `📍 ${paper.room}`,
    paperWhen(paper, tz),
  ]
    .filter(Boolean)
    .join(" · ");
  return html`<aside
    class="paper-detail"
    role="dialog"
    aria-label=${`Details: ${paper.title}`}
  >
    <div class="paper-detail-header">
      ${close}
      <h2>${paper.title}</h2>
      ${toggle(paper)}
    </div>
    ${paper.award && AWARDS[paper.award] ? html`<p class="paper-detail-award">${AWARDS[paper.award]}</p>` : ""}
    <p class="paper-detail-authors">${authors}</p>
    <p class="paper-detail-where">${where}</p>
    <p class="paper-detail-links">
      ${paper.url ? html`<a href=${paper.url} target="_blank" rel="noopener">Conference page</a>` : ""}
      ${(paper.links ?? []).map((l) => html` · <a href=${l.url} target="_blank" rel="noopener">${l.label}</a>`)}
    </p>
    ${paper.abstract ? html`<div class="paper-detail-abstract">${paper.abstract}</div>` : ""}
    ${
      related.length
        ? html`<h3>Related papers</h3>
            <ul class="related-papers">
              ${related.map((p) => {
                const open = html`<button class="btn-text related-open">
                  ${p.title}
                </button>`;
                open.onclick = () => onOpen(p.id);
                return html`<li class="related-paper">
                  ${open}
                  <span class="related-meta"
                    >${[p.room && `📍 ${p.room}`, paperWhen(p, tz), `${Math.round(p.score * 100)}% similar`].filter(Boolean).join(" · ")}</span
                  >
                  ${toggle(p)}
                </li>`;
              })}
            </ul>`
        : ""
    }
  </aside>`;
}
