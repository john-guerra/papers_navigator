import { formatDay } from "./time.js";
import { manualGroupKeys, reasonGroup, ruleReason } from "./rules.js";

/**
 * My Papers as the place to review (Stage E): which papers "All my papers" shows, how the
 * rating filter reads them, and how Group by sorts them into groups. Pure functions over the
 * stores' values: `ratings` {id: 1..5}, `disliked` {id: true}, `attended` {id: {at,how}|{off}}.
 */

const isAttended = (attended, id) =>
  Boolean(attended?.[id] && !attended[id].off);

/**
 * Rows for "All my papers": your items (resolveFollowed's, in order), then, if asked, papers not
 * in My Papers that you rated or attended (`include.ratedOrAttended`; not 👎) and those you
 * marked 👎 (`include.disliked`), each once, with `notInMine: true`.
 */
export function reviewRows({
  items,
  papers,
  ratings = {},
  disliked = {},
  attended = {},
  include = {},
}) {
  const mine = new Set(items.map((d) => d.id));
  const rows = items.map((d) => ({ ...d, notInMine: false }));
  const outside = (test) =>
    papers
      .filter((p) => !mine.has(p.id) && test(p.id))
      .map((p) => ({ ...p, notInMine: true }));
  const ratedOrAttended = (id) =>
    !disliked[id] && (ratings[id] > 0 || isAttended(attended, id));
  if (include.ratedOrAttended) rows.push(...outside(ratedOrAttended));
  if (include.disliked) rows.push(...outside((id) => Boolean(disliked[id])));
  return rows;
}

/** How many papers each Include box would add. */
export function includeCounts({
  items,
  papers,
  ratings = {},
  disliked = {},
  attended = {},
}) {
  const count = (box) =>
    reviewRows({
      items,
      papers,
      ratings,
      disliked,
      attended,
      include: { [box]: true },
    }).length - items.length;
  return {
    ratedOrAttended: count("ratedOrAttended"),
    disliked: count("disliked"),
  };
}

/** "5" … "1", "no" (👎 Not for me) or "none" (not rated). */
export function ratingKey(id, { ratings = {}, disliked = {} } = {}) {
  if (ratings[id] > 0) return String(ratings[id]);
  return disliked[id] ? "no" : "none";
}

/** Rows whose rating key is in `keys`; an empty set keeps every row. */
export function filterByRating(rows, keys, ctx) {
  if (!keys?.size) return rows;
  return rows.filter((r) => keys.has(ratingKey(r.id, ctx)));
}

const RATING_GROUPS = [
  ...["5", "4", "3", "2", "1"].map((n) => [n, `${n}★`]),
  ["no", "👎 Not for me"],
  ["none", "Not rated"],
];
const AWARD_GROUPS = [
  ["best", "🏆 Best"],
  ["honorable", "🏅 Honorable mention"],
  ["other", "🎖️ Award"],
  ["", "No award"],
];
const MANUAL_ORDER = [
  "manual",
  "rated",
  "live",
  "recommended",
  "shared",
  "author",
];
const RULE_REASON = /^(👥|🏫|🔍)/u;

/** Groups in a fixed order (only the non-empty ones). */
function fixed(order, keyOf, rows) {
  return order
    .map(([key, label]) => ({
      key,
      label,
      rows: rows.filter((r) => keyOf(r) === key),
    }))
    .filter((g) => g.rows.length);
}

/** Groups by a value, the biggest first (then by label), the "no value" group last. */
function byValue(rows, valueOf, empty) {
  const map = new Map();
  for (const r of rows) {
    const v = valueOf(r) || "";
    if (!map.has(v)) map.set(v, []);
    map.get(v).push(r);
  }
  return [...map]
    .map(([key, list]) => ({ key, label: key || empty, rows: list }))
    .sort(
      (a, b) =>
        Number(!a.key) - Number(!b.key) ||
        b.rows.length - a.rows.length ||
        a.label.localeCompare(b.label),
    );
}

/**
 * "Group by" (Stage E): `by` is none, day, reason, topic, rating, attended, type, session or
 * award. Returns `[{key, label, rows}]`; rows keep their order. Days come in order, ratings 5★ →
 * Not rated, awards 🏆 → none, reasons your own → rules → Not in My Papers (a paper may be in
 * several); the rest by size, the empty group last.
 */
export function groupRows(rows, by, ctx = {}) {
  switch (by) {
    case "day": {
      const days = [...new Set(rows.map((r) => r.day ?? ""))].sort();
      return days.map((day) => ({
        key: day,
        label: day ? formatDay(day) : "No date",
        rows: rows.filter((r) => (r.day ?? "") === day),
      }));
    }
    case "rating":
      return fixed(RATING_GROUPS, (r) => ratingKey(r.id, ctx), rows);
    case "attended":
      return fixed(
        [
          ["yes", "✓ Attended"],
          ["no", "Not attended"],
        ],
        (r) => (isAttended(ctx.attended, r.id) ? "yes" : "no"),
        rows,
      );
    case "award":
      return fixed(AWARD_GROUPS, (r) => r.awardTier ?? "", rows);
    case "topic":
      return byValue(rows, (r) => r.clusterLabel, "No topic");
    case "type":
      return byValue(rows, (r) => r.typeShort ?? r.typeLabel, "No type");
    case "session":
      return byValue(rows, (r) => r.sessionName, "No session");
    case "reason": {
      const groups = new Map();
      const rulesById = new Map(
        (ctx.rules ?? []).map((rule) => [rule.id, rule]),
      );
      const add = (key, label, row) => {
        if (!groups.has(key)) groups.set(key, { key, label, rows: [] });
        groups.get(key).rows.push(row);
      };
      for (const r of rows) {
        if (r.notInMine) {
          add("out", "Not in My Papers", r);
          continue;
        }
        for (const k of manualGroupKeys(r)) {
          const own = (r.reasons ?? []).find((x) => reasonGroup(x).key === k);
          add(`m:${k}`, own ? reasonGroup(own).label : "★ Added by hand", r);
        }
        // Watch rules by id (hand-added papers carry 🔍/🏫 reasons from Explore too)
        for (const id of r.ruleIds ?? []) {
          const rule = rulesById.get(id);
          const label = rule
            ? ruleReason(rule)
            : ((r.reasons ?? []).find((x) => RULE_REASON.test(x)) ?? id);
          add(`r:${id}`, label, r);
        }
      }
      const rank = (g) =>
        g.key === "out"
          ? 1e9
          : g.key.startsWith("m:")
            ? MANUAL_ORDER.indexOf(g.key.slice(2))
            : 100;
      return [...groups.values()].sort((a, b) => rank(a) - rank(b));
    }
    default:
      return [{ key: "", label: "", rows }];
  }
}
