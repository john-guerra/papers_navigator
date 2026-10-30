const PREFIX = "#follow=";
const VALID_ID = /^[A-Za-z0-9_-]+$/;

const WATCH = "&watch=";
const WATCH_TYPES = { a: "author", i: "affiliation" };
const WATCH_CODES = { author: "a", affiliation: "i" };
/** A link is attacker-controllable: cap how many watch rules one link can add. */
export const MAX_SHARED_WATCHES = 50;

/**
 * "#follow=<id>.<id>…[&watch=a:<name>,i:<institution>]" from short ids and watch rules (names
 * URI-encoded); "" when there is nothing to share.
 */
export function encodeShareHash(shortIds, rules = []) {
  const watches = rules
    .filter((r) => WATCH_CODES[r.type])
    .map((r) => `${WATCH_CODES[r.type]}:${encodeURIComponent(r.value)}`);
  if (!shortIds.length && !watches.length) return "";
  return (
    PREFIX +
    shortIds.join(".") +
    (watches.length ? WATCH + watches.join(",") : "")
  );
}

/** Short ids from a location hash; anything malformed is dropped. */
export function decodeShareHash(hash) {
  if (!hash?.startsWith(PREFIX)) return [];
  return hash
    .slice(PREFIX.length)
    .split("&")[0]
    .split(".")
    .filter((id) => VALID_ID.test(id));
}

/**
 * Watch rules ({type, value}) from a share hash: malformed entries and duplicates (same type,
 * case-insensitive name) are dropped, at most MAX_SHARED_WATCHES. Only person/institution
 * rules travel in links; topic rules (#24) and exceptions stay on the device.
 */
export function decodeShareWatches(hash) {
  if (!hash?.startsWith(PREFIX) || !hash.includes(WATCH)) return [];
  return hash
    .slice(hash.indexOf(WATCH) + WATCH.length)
    .split("&")[0]
    .split(",")
    .map((entry) => {
      const [code, encoded] = [entry.slice(0, 1), entry.slice(2)];
      if (entry[1] !== ":" || !WATCH_TYPES[code] || !encoded) return null;
      try {
        const value = decodeURIComponent(encoded).trim();
        return value ? { type: WATCH_TYPES[code], value } : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter(
      (rule, i, all) =>
        all.findIndex(
          (r) =>
            r.type === rule.type &&
            r.value.toLowerCase() === rule.value.toLowerCase(),
        ) === i,
    )
    .slice(0, MAX_SHARED_WATCHES);
}

/**
 * Maps link tokens to paper ids: exact shortId first, otherwise a unique id prefix, so
 * links keep working if a re-scrape makes short ids longer.
 */
export function resolveShortIds(shortIds, papers) {
  const byShortId = new Map(papers.map((p) => [p.shortId, p.id]));
  const ids = [];
  const unknown = [];
  for (const token of shortIds) {
    if (byShortId.has(token)) {
      ids.push(byShortId.get(token));
      continue;
    }
    const matches = papers.filter((p) => p.id.startsWith(token));
    if (matches.length === 1) ids.push(matches[0].id);
    else unknown.push(token);
  }
  return { ids, unknown };
}

/** Share URL for the current page with the papers (and optional watch rules) in the hash. */
export function shareUrl(followed, papers, base = location.href, rules = []) {
  const shortIds = new Map(papers.map((p) => [p.id, p.shortId]));
  const url = new URL(base);
  url.search = "";
  url.hash = encodeShareHash(
    followed.map((d) => shortIds.get(d.id)).filter(Boolean),
    rules,
  );
  return url.toString();
}
