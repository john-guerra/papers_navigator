import { html } from "htl";
import { AWARDS, authorsLine, paperWhen } from "../widgets/papersList.js";
import { authorUrl } from "../lib/authors.js";
import { followToggles } from "./followToggles.js";

/**
 * Paper details (#22) with related papers (#23): everything about one paper, its links, the
 * My Papers toggle, and the most similar papers (each opening its own details).
 */
export function renderPaperDetail(
  paper,
  {
    tz,
    tzLabel,
    related = [],
    inMyPapers,
    onToggle,
    onOpen,
    onClose,
    authorHref = authorUrl,
    // (related papers) => the neighbourhood mini-map (#101) with .highlight(id), or null
    miniMap = null,
  },
) {
  const { toggle, update } = followToggles({ inMyPapers, onToggle });
  const close = html`<button
    class="filters-close paper-detail-close"
    aria-label="Close details"
  >
    Close ✕
  </button>`;
  close.onclick = onClose;
  const where = [
    paper.typeLabel ?? paper.type,
    paper.sessionName,
    paper.room && `📍 ${paper.room}`,
    paperWhen(paper, tz, tzLabel),
  ]
    .filter(Boolean)
    .join(" · ");
  // The mini-map (#101), once the related papers are known
  let mini = null;
  let shownRelated = null;
  let disposed = false;
  const highlight = (id) => mini?.highlight(id);
  const relatedList = (papers) => {
    if (!papers.length) return "";
    mini = !disposed && miniMap ? miniMap(papers) : null;
    shownRelated = papers;
    const list = html`<ul class="related-papers">
      ${papers.map((p) => {
        const open = html`<button class="btn-text related-open">
          ${p.title}
        </button>`;
        open.onclick = () => onOpen(p.id);
        const row = html`<li class="related-paper" data-paper-id=${p.id}>
          ${open}
          <span class="related-meta"
            >${[p.room && `📍 ${p.room}`, paperWhen(p, tz, tzLabel), `${Math.round(p.score * 100)}% similar`].filter(Boolean).join(" · ")}</span
          >
          ${toggle(p)}
        </li>`;
        // Hover or keyboard focus on a row shows that paper on the mini-map (#101)
        row.addEventListener("pointerenter", () => highlight(p.id));
        row.addEventListener("pointerleave", () => highlight(null));
        row.addEventListener("focusin", () => highlight(p.id));
        row.addEventListener("focusout", (event) => {
          if (!row.contains(event.relatedTarget)) highlight(null);
        });
        return row;
      })}
    </ul>`;
    return html`<h3>Related papers</h3>
      ${
        mini
          ? html`${mini}
              <p class="mini-map-note muted">
                Map distances can mislead: a 2D map distorts. Compare with each
                paper's similarity, or see
                <a href="about.html#map-reliability">how reliable the map is</a
                >.
              </p>`
          : ""
      }
      ${list}`;
  };
  // `related` may be a Promise (My Papers loads the embeddings only when needed, #70)
  const relatedSection = html`<section class="related-section"></section>`;
  if (typeof related?.then === "function") {
    relatedSection.append(
      html`<h3>Related papers</h3>
        <p class="muted">Loading related papers…</p>`,
    );
    related.then(
      (papers) => relatedSection.replaceChildren(relatedList(papers)),
      () =>
        relatedSection.replaceChildren(
          html`<h3>Related papers</h3>
            <p class="muted">
              Related papers are unavailable: the paper embeddings couldn't load
              (offline before they were saved on this device?).
            </p>`,
        ),
    );
  } else relatedSection.append(relatedList(related));
  const el = html`<aside
    class="paper-detail"
    role="dialog"
    aria-label=${`Paper: ${paper.title}`}
  >
    <div class="paper-detail-header">
      ${close}
      <h2>${paper.title}</h2>
      ${toggle(paper)}
    </div>
    ${paper.shortLabel ? html`<p class="paper-detail-where paper-detail-label">${paper.shortLabel}</p>` : ""}
    ${paper.award && AWARDS[paper.award] ? html`<p class="paper-detail-award">${AWARDS[paper.award]}</p>` : ""}
    <p class="paper-detail-authors">
      ${authorsLine(paper.authors, authorHref)}
    </p>
    <p class="paper-detail-where">${where}</p>
    <p class="paper-detail-links">
      ${paper.url ? html`<a href=${paper.url} target="_blank" rel="noopener">Conference page ↗</a>` : ""}
      ${(paper.links ?? []).map((l) => html` · <a href=${l.url} target="_blank" rel="noopener">${l.label}</a>`)}
    </p>
    ${paper.abstract ? html`<div class="paper-detail-abstract">${paper.abstract}</div>` : ""}
    ${relatedSection}
  </aside>`;
  // Refresh the My Papers toggles in place (keeps the panel's scroll and focus)
  el.update = update;
  // Show a paper on the mini-map from elsewhere (My Papers' recommended rows), null to reset
  el.highlight = highlight;
  // Redraw only the mini-map (Explore: the projection changed while the panel is open)
  el.refreshMiniMap = () => {
    if (disposed || !mini || !shownRelated) return;
    const next = miniMap(shownRelated);
    const old = mini;
    if (next) old.replaceWith(next);
    else old.hidden = true;
    old.dispose?.();
    if (next) mini = next;
  };
  el.dispose = () => {
    disposed = true;
    mini?.dispose?.();
  };
  return el;
}
