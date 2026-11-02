import { html } from "htl";
import { exploreFilterHref } from "../lib/urlState.js";

const NOUNS = { topics: "topic", keywords: "keyword" };

/**
 * A chip that opens Explore filtered by one topic or keyword (#154), with an optional count
 * (a researcher's papers under it).
 */
export function filterChip(facet, value, count = null) {
  const label = `${count != null ? `${count} ` : ""}${NOUNS[facet] ?? facet} “${value}”: its papers on Explore`;
  return html`<a
    class="chip chip-link"
    href=${exploreFilterHref(facet, value)}
    aria-label=${label}
    ><span>${value}</span
    >${count != null ? html`<span class="chip-label">${count}</span>` : ""}</a
  >`;
}
