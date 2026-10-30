import { normalizeRule } from "./rules.js";

const PREFIX = "#follow=";
const VALID_ID = /^[A-Za-z0-9_-]+$/;

const WATCH = "&watch=";
const WATCH_TYPES = { a: "author", i: "affiliation", t: "topic" };
const WATCH_CODES = { author: "a", affiliation: "i", topic: "t" };
const LEVEL_CODES = { strong: "s", good: "g" };
const LEVELS = { s: "strong", g: "good" };
/** A research topic's "<level><threshold>" in a link, e.g. "g0.3" (thresholds are -1…1). */
const TOPIC_META = /^([sg])(-?[01](?:\.\d{1,4})?)$/;
/** A link is attacker-controllable: cap how many watch rules one link can add. */
export const MAX_SHARED_WATCHES = 50;
/** Longest name a link can carry (real author/institution names are far shorter). */
const MAX_WATCH_NAME = 200;
/** Longest research topic query a link can carry. */
const MAX_TOPIC_QUERY = 300;
/** Longest paper token (short ids are ~8–36 characters). */
const MAX_ID_LENGTH = 64;

/** "a:<name>", "i:<institution>" or "t:<level code><threshold>:<query>" (text URI-encoded). */
function encodeWatch(rule) {
  const text = encodeURIComponent(rule.value);
  if (rule.type !== "topic") return `${WATCH_CODES[rule.type]}:${text}`;
  const threshold = Math.round((Number(rule.threshold) || 0) * 1e4) / 1e4;
  return `t:${LEVEL_CODES[rule.level] ?? "g"}${threshold}:${text}`;
}

/**
 * "#follow=<id>.<id>…[&watch=a:<name>,i:<institution>,t:g0.3:<query>]" from short ids and watch
 * rules; "" when there is nothing to share. A research topic travels as its query, level and
 * threshold, not its cached matches (the receiving page re-evaluates it, #24).
 */
export function encodeShareHash(shortIds, rules = []) {
  // "My research" topics (#27) stay on this device: their abstracts are private and too long
  // for a link, and their name alone can't be re-evaluated
  const watches = rules
    .filter((r) => WATCH_CODES[r.type] && !r.research)
    .map(encodeWatch);
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
 * Watch rules ({type, value}, plus {level, threshold} for research topics) from a share hash:
 * malformed entries and duplicates (by rule id, so case and accents are ignored) are dropped, at
 * most MAX_SHARED_WATCHES. Exceptions and cached topic matches stay on the device.
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
    const type = WATCH_TYPES[code];
    const maxText = type === "topic" ? MAX_TOPIC_QUERY : MAX_WATCH_NAME;
    if (entry[1] !== ":" || !type || entry.length > maxText * 12 + 12) continue;
    let text = entry.slice(2);
    const topic = {};
    if (type === "topic") {
      const colon = text.indexOf(":");
      const meta = colon > 0 && TOPIC_META.exec(text.slice(0, colon));
      if (!meta || Math.abs(Number(meta[2])) > 1) continue;
      Object.assign(topic, {
        level: LEVELS[meta[1]],
        threshold: Number(meta[2]),
      });
      text = text.slice(colon + 1);
    }
    let value;
    try {
      value = decodeURIComponent(text).trim();
    } catch {
      continue;
    }
    if (value.length > maxText) continue;
    const rule = normalizeRule({ type, value, ...topic });
    if (!rule || seen.has(rule.id)) continue;
    seen.add(rule.id);
    rules.push({ type: rule.type, value: rule.value, ...topic });
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
