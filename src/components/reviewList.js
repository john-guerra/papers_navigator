import { html } from "htl";
import { compactPaperRow } from "../widgets/compactPaperRow.js";
import { followToggles } from "./followToggles.js";

/**
 * "All my papers" for reviewing (Stage E): `groups` from groupRows, each a folding `<details
 * open>` "Label (n)" (none when not grouped), each paper a compact row (`li.paper`, so the
 * rating, ✓ and note markers bind to it) with its reason chips or "Not in My Papers", and the My
 * Papers toggle (`inMyPapers(id)`, `onToggle(paper)`). `el.update()` refreshes the toggles.
 */
export function renderReviewList(
  groups,
  { tz, tzLabel, authorHref, detailsHref, onOpen, inMyPapers, onToggle },
) {
  const toggles = followToggles({ inMyPapers, onToggle });
  const row = (p) => {
    const why = p.notInMine
      ? html`<span class="not-in-mine muted">Not in My Papers</span>`
      : html`${(p.reasons ?? [p.reason]).filter(Boolean).map((r) => html`<span class="reason-chip">${r}</span> `)}`;
    return html`<li class="paper review-row" data-paper-id=${p.id}>
      ${compactPaperRow(p, {
        tz,
        tzLabel,
        authorHref,
        onOpen,
        href: detailsHref,
        extra: why,
        actions: toggles.toggle(p),
      })}
    </li>`;
  };
  const list = (rows) =>
    html`<ol class="review-list">
      ${rows.map(row)}
    </ol>`;
  const grouped = groups.length !== 1 || groups[0].label;
  const el = grouped
    ? html`<div class="review-groups">
        ${groups.map(
          (g) =>
            html`<details class="review-group-box" open>
              <summary>
                <span class="review-group-label">${g.label}</span>
                <span class="muted">(${g.rows.length})</span>
              </summary>
              ${list(g.rows)}
            </details>`,
        )}
      </div>`
    : html`<div class="review-groups">${list(groups[0]?.rows ?? [])}</div>`;
  el.update = toggles.update;
  return el;
}
