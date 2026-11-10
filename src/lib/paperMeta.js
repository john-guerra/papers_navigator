import { dayKey } from "./time.js";

/**
 * Award groups (#199): the program writes awards in many ways ("best paper", "challenge - winner",
 * "mini-challenge 1: honorable mention for …"); the Award facet and the row markers use these three.
 */
export const AWARD_TIERS = {
  best: { icon: "🏆", label: "Best" },
  honorable: { icon: "🏅", label: "Honorable mention" },
  other: { icon: "🎖️", label: "Other award" },
};

/** "best" | "honorable" | "other" for an award string; null without one. */
export function awardTier(award) {
  if (!award) return null;
  const a = String(award).toLowerCase();
  // Before "best": "best poster honorable mention" is an honorable mention
  if (/honou?rable|runner-up/.test(a)) return "honorable";
  if (/^best (paper|poster)( award)?$|winner|excellence/.test(a)) return "best";
  return "other";
}

/** The award as the program names it, capitalized ("Best paper"). */
export function awardName(award) {
  const a = String(award ?? "");
  return a.charAt(0).toUpperCase() + a.slice(1);
}

/**
 * Fields the pages derive once per paper (#199), added by the papers data loader:
 * `day` ("YYYY-MM-DD" in the conference timezone, from the paper's time or else its session's;
 * workshops, posters and challenges have only a session time), `awardTier`, and the type pill's
 * `typeShort`/`typeColor` from config `typeStyles` (else the type label, in the neutral color).
 */
export function enrichPapers(papers, { timezone, typeStyles = {} } = {}) {
  return papers.map((p) => {
    const when = p.start ?? p.sessionStart;
    const style = typeStyles[p.type] ?? {};
    return {
      ...p,
      day: when ? dayKey(when, timezone) : null,
      awardTier: awardTier(p.award),
      typeShort: style.label ?? p.typeLabel ?? p.type,
      typeColor: style.color ?? "other",
    };
  });
}
