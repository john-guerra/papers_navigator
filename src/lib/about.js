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
    key: "papersNavigator:<id>:sync",
    what: "Which version of each item this device has (so a transfer knows what changed), and a random id for this device",
  },
  {
    key: "papersNavigator:<id>:syncUndo",
    what: "Your last import, kept for 7 days so you can undo it",
  },
  {
    key: "papersNavigator:<id>:syncSnapshots",
    what: "Copies of your data from before your last imports, so you can restore one (at most 3)",
  },
  {
    key: "papersNavigator:<id>:rules",
    what: "Your watches (researchers, institutions, research topics) and their cached matches",
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
    key: "papersNavigator:<id>:notes",
    what: "Your notes on papers (My note in a paper's details) and on sessions without papers, like plenaries and panels (Live page)",
  },
  {
    key: "papersNavigator:<id>:ratings",
    what: "Your 1–5 star ratings of papers (Live page)",
  },
  {
    key: "papersNavigator:<id>:disliked",
    what: "Papers you marked Not for me",
  },
  {
    key: "papersNavigator:<id>:attended",
    what: "Papers you attended (marked while checked in on the Live page, or by hand)",
  },
  {
    key: "papersNavigator:<id>:reviewInclude",
    what: "Which lists My Papers shows for review (its List filter)",
  },
  {
    key: "papersNavigator:<id>:lastExport",
    what: "When you last exported (for the backup reminder)",
  },
  {
    key: "papersNavigator:<id>:backupDismissed",
    what: "When you last dismissed the backup reminder",
  },

  {
    key: "papersNavigator:<id>:liveCheckIn",
    what: "The session you chose with Going here on the Live page",
  },
  {
    key: "papersNavigator:<id>:liveClock",
    what: "A time you set by hand on the Live page (forgotten the next day)",
  },
  {
    key: "papersNavigator:<id>:bskyHandles",
    what: "Bluesky accounts you picked for authors (Post on the Live page)",
  },
  {
    key: "papersNavigator:<id>:postToolLink",
    what: "Whether your Bluesky drafts link to this tool or the conference page",
  },
  {
    key: "papersNavigator:<id>:dismissed",
    what: "Recommended papers you dismissed",
  },
  {
    key: "papersNavigator:<id>:lastQuery",
    what: "Your last search on Explore, so your next visit starts from it",
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
    key: "papersNavigator:intro",
    what: "Whether you closed Explore's introduction",
  },
  {
    key: "papersNavigator:neighbours",
    what: "Your nearest neighbours choices (Options → Advanced)",
  },
  {
    key: "papersNavigator:openSections",
    what: "Which My Papers sections (Watching, Recommended papers) you opened on a narrow screen",
  },
  {
    key: "papersNavigator:paperLabels",
    what: "Whether the map shows paper labels (the toggle under the map)",
  },
  {
    key: "papersNavigator:queryMarker",
    what: "Whether the map shows the “★ Your search” marker (Map options)",
  },
  {
    key: "papersNavigator:similarityScheme",
    what: "Your similarity colors for the map (Map options → Appearance)",
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
