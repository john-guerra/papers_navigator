/**
 * Visible names of the relevance levels (DESIGN.md → Relevance control). The keys are what
 * values, URLs, stored rules and share links use: "weak" is shown as "Loose" (#183, "Weak"
 * read as a verdict on the papers) but keeps its key so saved state still works.
 */
export const LEVEL_NAMES = {
  strong: "Strong",
  good: "Good",
  weak: "Loose",
  all: "All",
};

/** The levels a research topic can be watched at (no "all"). */
export const WATCH_LEVEL_NAMES = {
  strong: LEVEL_NAMES.strong,
  good: LEVEL_NAMES.good,
  weak: LEVEL_NAMES.weak,
};

/** A cut as the list shows a paper's similarity: 0.4651 → "47%". */
export const cutPercent = (cut) => `${Math.round(cut * 100)}%`;
