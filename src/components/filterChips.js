import { html } from "htl";
import { exploreFilterHref } from "../lib/urlState.js";

const NOUNS = { topics: "Map topic", keywords: "Keyword" };

/**
 * A chip that opens Explore filtered by one topic or keyword (#154), with an optional count
 * (a researcher's papers under it, "of theirs" in its label).
 */
export function filterChip(facet, value, count = null) {
  const label = `${NOUNS[facet] ?? facet} “${value}”${count != null ? ` (${count} of theirs)` : ""}: show its papers on Explore`;
  return html`<a
    class="chip chip-link"
    href=${exploreFilterHref(facet, value)}
    aria-label=${label}
    ><span>${value}</span
    >${count != null ? html`<span class="chip-label">${count}</span>` : ""}</a
  >`;
}
