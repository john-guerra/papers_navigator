import { html } from "htl";
import { authorsLine, paperWhen } from "./papersList.js";
import { awardLine, paperHead } from "./paperMarks.js";

let uid = 0;

/**
 * The compact paper row (#199), shared by Recommended and Related papers: type pill, award and
 * title (a link to `?paper=` opening the details in place: `onOpen(p)`, class `titleClass`), the authors (each
 * linking to `authorHref(name)`), "📍 room · day time" plus the caller's `meta` ("71% similar"),
 * an optional `extra` line ("✨ Like …"), the caller's `actions`, and "Details ▾", which opens
 * the rest in place (session, type, affiliations, award, abstract, links, "Open full details").
 * Returns the row's inner content in a `.compact-paper` element; the caller wraps it in its <li>.
 */
export function compactPaperRow(
  p,
  {
    tz,
    tzLabel,
    authorHref,
    onOpen,
    titleClass = "",
    // Link to the paper's details on this page, keeping its other params (paperRoute.href)
    href = (d) => `?paper=${encodeURIComponent(d.shortId ?? d.id)}`,
    meta = "",
    extra = "",
    actions = "",
  } = {},
) {
  // A real link to the details URL, so the title wraps like text next to the pill (a button is
  // an atomic box) and cmd/ctrl-click opens a new tab; a plain click opens the details in place
  const open = html`<a class=${`compact-title ${titleClass}`} href=${href(p)}
    >${p.title}</a
  >`;
  open.onclick = (event) => {
    if (
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    onOpen?.(p);
  };
  const names = (p.authors ?? []).map(({ name }) => ({ name }));
  const where = [p.room && `📍 ${p.room}`, paperWhen(p, tz, tzLabel), meta]
    .filter(Boolean)
    .join(" · ");
  const id = `compact-details-${++uid}`;
  const toggle = html`<button
    class="btn-text compact-details-toggle"
    aria-expanded="false"
    aria-controls=${id}
  >
    Details ▾
  </button>`;
  const full = html`<button class="btn-text compact-details-open">
    Open full details →
  </button>`;
  full.onclick = () => onOpen?.(p);
  const panel = html`<div class="compact-details" id=${id} hidden>
    <p class="compact-details-where">
      ${[p.sessionName, p.typeLabel ?? p.type].filter(Boolean).join(" · ")}
    </p>
    ${p.awardTier ? html`<p class="compact-details-award">${awardLine(p)}</p>` : ""}
    <p class="compact-details-authors">${authorsLine(p.authors, authorHref)}</p>
    ${p.abstract ? html`<p class="compact-details-abstract">${p.abstract}</p>` : ""}
    <p class="compact-details-links">
      ${p.url ? html`<a href=${p.url} target="_blank" rel="noopener">Conference page ↗</a>` : ""}
      ${(p.links ?? []).map((l) => html` · <a href=${l.url} target="_blank" rel="noopener">${l.label}</a>`)}
      ${p.url || p.links?.length ? " · " : ""}${full}
    </p>
  </div>`;
  toggle.onclick = () => {
    const expanded = panel.hidden;
    panel.hidden = !expanded;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded ? "Details ▴" : "Details ▾";
  };
  return html`<div class="compact-paper">
    ${paperHead(p, open)}
    ${names.length ? html`<div class="compact-authors">${authorsLine(names, authorHref)}</div>` : ""}
    ${where ? html`<div class="compact-meta">${where}</div>` : ""}
    ${extra ? html`<div class="compact-extra">${extra}</div>` : ""}
    <div class="compact-actions">${actions}${toggle}</div>
    ${panel}
  </div>`;
}
