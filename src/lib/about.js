// Facts the About page (src/about.md) states, kept next to tests so they can't drift from
// the code: test/about.test.js checks that every localStorage key the app writes is listed.

/**
 * Everything the app keeps in this browser's localStorage. `<id>` is the conference id, so
 * each conference keeps its own list. Nothing here is ever sent anywhere by the app.
 */
export const STORAGE_ITEMS = [
  {
    key: "papersNavigator:<id>:followed",
    what: "My Papers: the papers you added, with their reason and when you added them",
  },
  {
    key: "papersNavigator:<id>:followed:backup",
    what: "Your previous list, kept after a Replace or Import so you can restore it",
  },
  {
    key: "papersNavigator:<id>:rules",
    what: "Your watches (people, institutions, research topics) and their cached matches",
  },
  {
    key: "papersNavigator:<id>:research",
    what: "The abstracts you pasted into My research",
  },
  {
    key: "papersNavigator:<id>:researchVectors",
    what: "Numbers computed from those abstracts, so they aren't recomputed on every visit",
  },
  {
    key: "papersNavigator:<id>:dismissed",
    what: "Recommended papers you dismissed",
  },
  {
    key: "papersNavigator:<id>:filtersOpen",
    what: "Whether the Options panel was open",
  },
  {
    key: "papersNavigator:animation",
    what: "Your map animation choices (Options → Animation)",
  },
  {
    key: "papersNavigator:theme",
    what: "Your Appearance choice (Auto, Light or Dark)",
  },
];

/** "November 8–13, 2026" from the config's ISO days (calendar dates, no timezone shift). */
export function conferenceDateRange(days = []) {
  const sorted = [...days].filter(Boolean).sort();
  if (!sorted.length) return "";
  const parse = (iso) => new Date(`${iso}T12:00:00Z`);
  const first = parse(sorted[0]);
  const last = parse(sorted.at(-1));
  const month = (d) =>
    d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const day = (d) => d.getUTCDate();
  const year = (d) => d.getUTCFullYear();
  if (sorted.length === 1 || +first === +last)
    return `${month(first)} ${day(first)}, ${year(first)}`;
  if (year(first) !== year(last))
    return `${month(first)} ${day(first)}, ${year(first)} – ${month(last)} ${day(last)}, ${year(last)}`;
  if (month(first) !== month(last))
    return `${month(first)} ${day(first)} – ${month(last)} ${day(last)}, ${year(last)}`;
  return `${month(first)} ${day(first)}–${day(last)}, ${year(last)}`;
}

/** "ieeevis.org" from a URL; "" when it isn't one. */
export function hostName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
