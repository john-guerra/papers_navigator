import { html } from "htl";
import { AWARD_TIERS, awardName } from "../lib/paperMeta.js";

/**
 * The type pill (#199): a short label ("Full", "Short", "Arts") with its type color as a cap on
 * the left, like the official program's; the full type ("TVCG Paper") in the tooltip. Fields from
 * paperMeta.js enrichPapers; without them, the type label in the neutral color.
 */
export function typePill(p) {
  const color = /^[a-z][a-z0-9-]*$/.test(p.typeColor ?? "")
    ? p.typeColor
    : "other";
  const full = p.typeLabel ?? p.type ?? "";
  return html`<span class="type-pill" data-color=${color} title=${full}
    ><span class="sr-only">Type: </span>${p.typeShort ?? full}</span
  >`;
}

/**
 * The award group's icon alone (🏆 / 🏅 / 🎖️; John's call, #199: rows stay short), the program's full
 * award name ("Honorable mention", "Mini-challenge 2: award for …") on hover and as its accessible
 * name; "" without one. Paper details show the icon with the name (awardLine).
 */
export function awardMark(p) {
  const tier = AWARD_TIERS[p.awardTier];
  if (!tier) return "";
  const name = awardName(p.award);
  return html`<span
    class="award-mark"
    role="img"
    aria-label=${`Award: ${name}`}
    title=${name}
    >${tier.icon}</span
  >`;
}

/** "🏅 Honorable mention" in full (paper details): icon + the program's own award name. */
export function awardLine(p) {
  const tier = AWARD_TIERS[p.awardTier];
  return tier ? `${tier.icon} ${awardName(p.award)}` : "";
}

/** The first line of every paper row (#199): type pill, award, then `title` (an element). */
export function paperHead(p, title, after = "") {
  return html`<div class="paper-head">
    ${typePill(p)}${awardMark(p)}${title}${after}
  </div>`;
}
