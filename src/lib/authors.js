import { dayKey, formatDay, formatTime } from "./time.js";
import { normalizeText } from "./rules.js";

/**
 * Researchers (#78): everyone listed as an author in this conference's program. There are no
 * stable author ids, so identity is the normalized name (homonyms merge; their affiliations are
 * listed so a merge is visible).
 */

/**
 * Identity of a researcher: the same key author Watch rules match on (case-, accent- and
 * whitespace-insensitive), so a profile groups exactly the papers its Watch rule keeps.
 */
export const normalizeName = normalizeText;

/** Profile URL of a researcher (relative: the site lives in a subfolder; cleanUrls is off). */
export const authorUrl = (name) =>
  `./authors.html?${new URLSearchParams({ name: String(name).trim() })}`;

const byCount = (a, b) =>
  b.count - a.count || String(a.value).localeCompare(String(b.value));

/** `Map(value → count)` → `[{value, count}]`, most first, then alphabetical. */
const counted = (map) =>
  [...map].map(([value, count]) => ({ value, count })).sort(byCount);

/** The spelling used most often (the first one seen on ties). */
const mostCommon = (spellings) =>
  [...spellings].reduce((best, entry) =>
    entry[1] > best[1] ? entry : best,
  )[0];

/**
 * `[{key, name, affiliations: [{value, count}], papers}]`, one per normalized name, sorted by
 * paper count (most first) then name. `name` is the most common spelling; papers keep program
 * order and are counted once per researcher.
 */
export function buildAuthorIndex(papers) {
  const authors = new Map();
  for (const paper of papers) {
    for (const author of paper.authors ?? []) {
      const key = normalizeName(author.name);
      if (!key) continue;
      let entry = authors.get(key);
      if (!entry) {
        entry = {
          key,
          spellings: new Map(),
          affiliations: new Map(),
          papers: [],
        };
        authors.set(key, entry);
      }
      if (entry.papers.at(-1) === paper) continue;
      entry.papers.push(paper);
      const name = String(author.name).trim().replace(/\s+/g, " ");
      entry.spellings.set(name, (entry.spellings.get(name) ?? 0) + 1);
      const affiliation = author.affiliation?.trim();
      if (affiliation)
        entry.affiliations.set(
          affiliation,
          (entry.affiliations.get(affiliation) ?? 0) + 1,
        );
    }
  }
  return [...authors.values()]
    .map(({ key, spellings, affiliations, papers }) => ({
      key,
      name: mostCommon(spellings),
      affiliations: counted(affiliations),
      papers,
    }))
    .sort(
      (a, b) =>
        b.papers.length - a.papers.length || a.name.localeCompare(b.name),
    );
}

/** The researcher whose normalized name is `name`'s, or null. */
export function findAuthor(index, name) {
  const key = normalizeName(name);
  return (key && index.find((a) => a.key === key)) || null;
}

/**
 * How many different affiliations a researcher has, ignoring case, accents and punctuation
 * ("ETH Zürich" and "ETH Zurich" are one). More than one hints at merged homonyms.
 */
export function distinctAffiliations(affiliations) {
  return new Set(
    affiliations.map((d) =>
      searchText(d.value)
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim(),
    ),
  ).size;
}

/** Accent-insensitive text for searching ("zurich" finds "ETH Zürich"). */
const searchText = normalizeName;

/** Researchers whose name or affiliations contain every term of `query` (order kept). */
export function filterAuthors(index, query) {
  const terms = searchText(query).split(" ").filter(Boolean);
  if (!terms.length) return index;
  return index.filter((a) => {
    const text = searchText(
      [a.name, ...a.affiliations.map((d) => d.value)].join(" "),
    );
    return terms.every((term) => text.includes(term));
  });
}

/** When a paper is on: its own slot, else its session's; `[start, end]` in ms, or null. */
function interval(paper) {
  const start = paper.start ?? paper.sessionStart;
  if (!start) return null;
  const end = paper.start
    ? (paper.end ?? paper.start)
    : (paper.sessionEnd ?? start);
  return [new Date(start).getTime(), new Date(end).getTime()];
}

/** How a paper is presented, for "Tue 2 talks · Thu 1 poster". */
const kindOf = (paper) => (paper.type === "poster" ? "poster" : "talk");
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const kindCounts = (list) => {
  const counts = new Map();
  for (const paper of list)
    counts.set(kindOf(paper), (counts.get(kindOf(paper)) ?? 0) + 1);
  return [...counts].map(([kind, count]) => ({ kind, count }));
};

/**
 * When a researcher presents, per conference day (in `tz`): `{days: [{key, label, kinds:
 * [{kind, count}]}], untimed: [{kind, count}]}`; `kind` is "talk" or "poster".
 */
export function daySummary(papers, tz) {
  const days = new Map();
  const untimed = [];
  for (const paper of papers) {
    const when = paper.start ?? paper.sessionStart;
    if (!when) {
      untimed.push(paper);
      continue;
    }
    const key = dayKey(when, tz);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(paper);
  }
  return {
    days: [...days.keys()].sort().map((key) => ({
      key,
      label: formatDay(key).split(" ")[0],
      kinds: kindCounts(days.get(key)),
    })),
    untimed: kindCounts(untimed),
  };
}

/** "Tue 2 talks · Thu 1 poster · 1 poster without a time". */
export function daySummaryText({ days, untimed }) {
  const kinds = (list) =>
    list.map(({ kind, count }) => plural(count, kind)).join(", ");
  return [
    ...days.map((d) => `${d.label} ${kinds(d.kinds)}`),
    ...(untimed.length ? [`${kinds(untimed)} without a time`] : []),
  ].join(" · ");
}

/**
 * The researcher's paper on now or next after `now`: `{paper, label: "Tue Nov 10 10:00", live}`
 * (time of the paper, else of its session, in `tz`), or null when none is left.
 */
export function nextPresentation(papers, now, tz) {
  const t = now.getTime();
  const upcoming = papers
    .map((paper) => ({ paper, when: interval(paper) }))
    .filter(({ when }) => when && Math.max(when[0], when[1]) > t)
    .sort((a, b) => a.when[0] - b.when[0]);
  if (!upcoming.length) return null;
  const { paper, when } = upcoming[0];
  const iso = paper.start ?? paper.sessionStart;
  return {
    paper,
    label: `${formatDay(dayKey(iso, tz))} ${formatTime(iso, tz)}`,
    live: when[0] <= t,
  };
}

/** Map topics (clusters) and keywords of a researcher's papers, with counts (most first). */
export function topics(papers) {
  const clusters = new Map();
  const keywords = new Map();
  for (const paper of papers) {
    if (paper.clusterLabel)
      clusters.set(
        paper.clusterLabel,
        (clusters.get(paper.clusterLabel) ?? 0) + 1,
      );
    for (const keyword of new Set(paper.keywords ?? []))
      if (keyword) keywords.set(keyword, (keywords.get(keyword) ?? 0) + 1);
  }
  return { topics: counted(clusters), keywords: counted(keywords) };
}

/** The researcher's co-authors: `[{key, name, count}]`, most shared papers first. */
export function coauthors(author, { limit = Infinity } = {}) {
  const people = new Map();
  for (const paper of author.papers) {
    const seen = new Set([author.key]);
    for (const { name } of paper.authors ?? []) {
      const key = normalizeName(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      let entry = people.get(key);
      if (!entry)
        people.set(key, (entry = { key, spellings: new Map(), count: 0 }));
      entry.count++;
      const spelling = String(name).trim().replace(/\s+/g, " ");
      entry.spellings.set(spelling, (entry.spellings.get(spelling) ?? 0) + 1);
    }
  }
  return [...people.values()]
    .map(({ key, spellings, count }) => ({
      key,
      name: mostCommon(spellings),
      count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * `Map(paper id → [My Papers papers on at the same time])` for the researcher's papers. Papers
 * in the same session aren't conflicts (you see both), nor is a paper with itself.
 */
export function conflictsWithMyPapers(papers, myPapers) {
  const mine = myPapers
    .map((p) => ({ paper: p, when: interval(p) }))
    .filter((d) => d.when);
  const conflicts = new Map();
  for (const paper of papers) {
    const when = interval(paper);
    if (!when) continue;
    const overlapping = mine
      .filter(
        (m) =>
          m.paper.id !== paper.id &&
          !(paper.sessionId && m.paper.sessionId === paper.sessionId) &&
          m.when[0] < when[1] &&
          when[0] < m.when[1],
      )
      .map((m) => m.paper);
    if (overlapping.length) conflicts.set(paper.id, overlapping);
  }
  return conflicts;
}
