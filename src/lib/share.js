import { normalizeRule } from "./rules.js";

const PREFIX = "#follow=";
const VALID_ID = /^[A-Za-z0-9_-]+$/;

const WATCH = "&watch=";
const WATCH_TYPES = { a: "author", i: "affiliation" };
const WATCH_CODES = { author: "a", affiliation: "i" };
/** A link is attacker-controllable: cap how many watch rules one link can add. */
export const MAX_SHARED_WATCHES = 50;
/** Longest name a link can carry (real author/institution names are far shorter). */
const MAX_WATCH_NAME = 200;
/** Longest paper token (short ids are ~8–36 characters). */
const MAX_ID_LENGTH = 64;

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

/** More than any real list (QR codes stop at 100); bounds work on a hostile link. */
export const MAX_SHARED_PAPERS = 2000;

/** Short ids from a location hash; anything malformed is dropped, at most MAX_SHARED_PAPERS. */
export function decodeShareHash(hash) {
  if (!hash?.startsWith(PREFIX)) return [];
  return hash
    .slice(PREFIX.length)
    .split("&", 1)[0]
    .split(".", MAX_SHARED_PAPERS)
    .filter((id) => id.length <= MAX_ID_LENGTH && VALID_ID.test(id));
}

/**
 * Watch rules ({type, value}) from a share hash: malformed entries and duplicates (by rule id,
 * so case and accents are ignored) are dropped, at most MAX_SHARED_WATCHES. Only
 * person/institution rules travel in links; topic rules (#24) and exceptions stay on the device.
 * The hash is attacker-controllable, so work is bounded: entries scanned are capped and parsing
 * stops once enough rules are collected.
 */
export function decodeShareWatches(hash) {
  if (!hash?.startsWith(PREFIX) || !hash.includes(WATCH)) return [];
  const entries = hash
    .slice(hash.indexOf(WATCH) + WATCH.length)
    .split("&", 1)[0]
    .split(",", MAX_SHARED_WATCHES * 4);
  const rules = [];
  const seen = new Set();
  for (const entry of entries) {
    if (rules.length >= MAX_SHARED_WATCHES) break;
    const code = entry.slice(0, 1);
    // Skip overlong entries before decoding (an encoded character is at most 12 characters)
    if (
      entry[1] !== ":" ||
      !WATCH_TYPES[code] ||
      entry.length > MAX_WATCH_NAME * 12 + 2
    )
      continue;
    let value;
    try {
      value = decodeURIComponent(entry.slice(2)).trim();
    } catch {
      continue;
    }
    if (value.length > MAX_WATCH_NAME) continue;
    const rule = normalizeRule({ type: WATCH_TYPES[code], value });
    if (!rule || seen.has(rule.id)) continue;
    seen.add(rule.id);
    rules.push({ type: rule.type, value: rule.value });
  }
  return rules;
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
