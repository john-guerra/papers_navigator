/**
 * Watch rules: standing rules (a person, an institution, a topic) whose papers are always
 * in My Papers (DESIGN.md "Vocabulary"). Pure matching + a persisted store + a combined
 * "My Papers" view over the manual list (`followed.js`) and the rules.
 *
 * Effective My Papers = manual adds ∪ rule matches − exceptions.
 * - An exception is a paper removed by hand while a rule matched it: it stays out even
 *   though the rule still matches. Exceptions only suppress rule matches; a manual entry
 *   always wins, so adding a paper by hand (also via the bare followed store) brings it back.
 * - A rule-only paper is `new` until it is marked seen. Watching a rule marks its current
 *   matches seen, so `new` means "started matching later" (e.g. after a program update).
 */

/** @typedef {"author" | "affiliation" | "topic"} RuleType */
/**
 * @typedef {object} Rule
 * @property {string} id stable `${type}:${normalized value}`; adding the same rule twice keeps one
 * @property {RuleType} type
 * @property {string} value author name, institution, or topic query
 * @property {number} [threshold] topic only: minimum relevance score (0–1) to match
 * @property {string} addedOn ISO date
 */
/**
 * @typedef {object} MyPaperEntry Compatible with followed entries `{id, reason, addedOn}`,
 *   so `resolveFollowed`, `shareUrl` and the itinerary accept a list of these unchanged.
 * @property {string} id
 * @property {string} reason all reasons joined with " · "
 * @property {string[]} reasons manual reason(s) first, then one per matching rule
 * @property {string} addedOn ISO date (manual add, else earliest matching rule)
 * @property {boolean} manual added by hand
 * @property {string[]} ruleIds rules matching this paper (exceptions excluded)
 * @property {boolean} new rule-only paper not yet seen
 */

const SEPARATOR = " · ";
const TYPES = new Set(["author", "affiliation", "topic"]);
const MARKERS = { author: "👥 Friend: ", affiliation: "🏫 ", topic: "🔍 " };

/** Case-, accent- and whitespace-insensitive key for names and institutions. */
const normalizeText = (s) =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const isoOr = (date, fallback) =>
  typeof date === "string" && !Number.isNaN(Date.parse(date))
    ? date
    : fallback.toISOString();

/** A valid rule with its id, or null. Keeps a valid `addedOn`, else uses `now`. */
export function normalizeRule(rule, now = new Date()) {
  const type = rule?.type;
  const value = String(rule?.value ?? "").trim();
  if (!TYPES.has(type) || !value) return null;
  const normalized = {
    id: `${type}:${normalizeText(value)}`,
    type,
    value,
    addedOn: isoOr(rule.addedOn, now),
  };
  if (type === "topic") normalized.threshold = Number(rule.threshold) || 0;
  return normalized;
}

/** Reason text shown for papers a rule brings in ("👥 Friend: Name", "🏫 …", "🔍 …"). */
export function ruleReason(rule) {
  return MARKERS[rule.type] + String(rule.value).trim();
}

/**
 * Whether `rule` matches `paper` (`paper.authors = [{name, affiliation}]`).
 * Authors and affiliations match the whole normalized name (no substrings, so
 * "University" does not watch every university). Topic rules do no search here: they
 * match when `scores` (Map or object, paper id → relevance) has a score ≥ threshold;
 * without scores a topic rule matches nothing (live evaluation lands with #24).
 */
export function matches(rule, paper, { scores } = {}) {
  if (rule.type === "topic") {
    const score =
      scores instanceof Map ? scores.get(paper.id) : scores?.[paper.id];
    return typeof score === "number" && score >= (rule.threshold ?? 0);
  }
  const field = rule.type === "author" ? "name" : "affiliation";
  const wanted = normalizeText(rule.value);
  return (paper.authors ?? []).some((a) => normalizeText(a[field]) === wanted);
}

/** `ruleId → Set(paperId)` of what each rule matches in `papers`. */
function matchSets(rules, papers, scoresFor) {
  return new Map(
    rules.map((rule) => {
      const scores = rule.type === "topic" ? scoresFor?.(rule) : undefined;
      const ids = papers
        .filter((p) => matches(rule, p, { scores }))
        .map((p) => p.id);
      return [rule.id, new Set(ids)];
    }),
  );
}

/**
 * Pure effective My Papers: manual entries in their order (missing papers kept, so
 * `resolveFollowed` still reports them), then rule-only papers in program order.
 * @param {{followed: {id, reason, addedOn}[], rules: Rule[], exceptions: string[], seen: string[]}} state
 * @param {object[]} papers
 * @param {{scoresFor?: (rule: Rule) => Map<string, number> | Record<string, number> | null}} [options]
 * @returns {MyPaperEntry[]}
 */
export function effectiveMyPapers(
  { followed = [], rules = [], exceptions = [], seen = [] },
  papers,
  { scoresFor } = {},
) {
  const excluded = new Set(exceptions);
  const seenIds = new Set(seen);
  const sets = matchSets(rules, papers, scoresFor);
  const rulesFor = (id) =>
    excluded.has(id) ? [] : rules.filter((r) => sets.get(r.id).has(id));
  const entry = (id, manualReason, manualAddedOn) => {
    const matching = rulesFor(id);
    const manual = manualReason != null;
    const reasons = [
      ...(manual ? manualReason.split(SEPARATOR) : []),
      ...matching.map(ruleReason),
    ].filter((r, i, all) => r && all.indexOf(r) === i);
    const addedOn =
      manualAddedOn ?? matching.map((r) => r.addedOn).sort()[0] ?? "";
    return {
      id,
      reason: reasons.join(SEPARATOR),
      reasons,
      addedOn,
      manual,
      ruleIds: matching.map((r) => r.id),
      new: !manual && matching.length > 0 && !seenIds.has(id),
    };
  };

  const list = followed.map((d) => entry(d.id, d.reason ?? "", d.addedOn));
  const listed = new Set(list.map((d) => d.id));
  for (const paper of papers) {
    if (listed.has(paper.id)) continue;
    const e = entry(paper.id);
    if (e.ruleIds.length) list.push(e);
  }
  return list;
}

const EMPTY = () => ({ rules: [], exceptions: [], seen: [] });
const idList = (list) =>
  Array.isArray(list)
    ? [...new Set(list.filter((id) => typeof id === "string" && id))]
    : [];

function parseState(text) {
  try {
    const state = JSON.parse(text);
    const rules = Array.isArray(state?.rules)
      ? state.rules.map((r) => normalizeRule(r)).filter(Boolean)
      : [];
    return {
      rules,
      exceptions: idList(state?.exceptions),
      seen: idList(state?.seen),
    };
  } catch {
    return EMPTY();
  }
}

/**
 * Watch rules, exceptions and seen ids persisted in localStorage per conference
 * (`papersNavigator:<id>:rules`, next to `:followed`). Same reactive contract as the
 * followed store: `.value` is `{rules, exceptions, seen}`, every change dispatches
 * `input`, and a `storage` event from another tab reloads it.
 */
export function createRulesStore(
  conferenceId,
  storage = globalThis.localStorage,
  events = globalThis,
) {
  const key = `papersNavigator:${conferenceId}:rules`;
  const store = new EventTarget();
  const load = () => parseState(storage?.getItem(key) ?? "{}");
  let value = load();

  events?.addEventListener?.("storage", (event) => {
    if (event.key !== key) return;
    value = load();
    store.dispatchEvent(new Event("input"));
  });

  const set = (next) => {
    value = next;
    try {
      storage?.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn("Could not save watch rules", error);
    }
    store.dispatchEvent(new Event("input"));
  };
  // Every mutation starts from what is saved now (another tab may have changed it)
  const update = (fn) => set(fn(load()));

  Object.defineProperty(store, "value", { get: () => value });
  Object.assign(store, {
    /** Adds (or updates the threshold of) a rule; returns it, or null if invalid. */
    add(rule, now = new Date()) {
      const next = normalizeRule(rule, now);
      if (!next) return null;
      let saved = next;
      update((s) => {
        const existing = s.rules.find((r) => r.id === next.id);
        if (!existing) return { ...s, rules: [...s.rules, next] };
        saved = { ...existing, threshold: next.threshold };
        if (saved.threshold === undefined) delete saved.threshold;
        return {
          ...s,
          rules: s.rules.map((r) => (r.id === next.id ? saved : r)),
        };
      });
      return saved;
    },
    remove(ruleIds) {
      const drop = new Set(ruleIds);
      update((s) => ({ ...s, rules: s.rules.filter((r) => !drop.has(r.id)) }));
    },
    has(ruleId) {
      return value.rules.some((r) => r.id === ruleId);
    },
    /** Keeps these papers out of My Papers even while a rule matches them. */
    except(ids) {
      update((s) => ({ ...s, exceptions: idList([...s.exceptions, ...ids]) }));
    },
    unexcept(ids) {
      const drop = new Set(ids);
      update((s) => ({
        ...s,
        exceptions: s.exceptions.filter((id) => !drop.has(id)),
      }));
    },
    markSeen(ids) {
      update((s) => ({ ...s, seen: idList([...s.seen, ...ids]) }));
    },
  });
  return store;
}

/**
 * My Papers as one reactive object over the manual list and the rules. `.value` is the
 * effective list (MyPaperEntry[]); it dispatches `input` when either store changes
 * (including from another tab). Mutations go to the underlying stores.
 * @param {{followed: EventTarget, rules: EventTarget, papers: object[],
 *   scoresFor?: (rule: Rule) => Map<string, number> | Record<string, number> | null}} options
 */
export function createMyPapers({ followed, rules, papers, scoresFor }) {
  const myPapers = new EventTarget();
  const compute = () =>
    effectiveMyPapers({ followed: followed.value, ...rules.value }, papers, {
      scoresFor,
    });
  let value = compute();
  const refresh = () => {
    value = compute();
    myPapers.dispatchEvent(new Event("input"));
  };
  followed.addEventListener("input", refresh);
  rules.addEventListener("input", refresh);

  const matchedIds = (ruleList) => {
    const ids = new Set();
    for (const set of matchSets(ruleList, papers, scoresFor).values())
      for (const id of set) ids.add(id);
    return ids;
  };

  Object.defineProperty(myPapers, "value", { get: () => value });
  Object.assign(myPapers, {
    /** Adds by hand (clearing any exception for these papers). */
    add(list, reason, now = new Date()) {
      const ids = list.map((p) => p.id);
      if (ids.some((id) => rules.value.exceptions.includes(id)))
        rules.unexcept(ids);
      followed.add(list, reason, now);
    },
    /**
     * Removes by hand; papers a rule matches become exceptions so they stay out.
     * Returns an undo that restores exactly what was there (manual entries and exceptions).
     */
    remove(ids) {
      const matched = matchedIds(rules.value.rules);
      const removed = followed.value.filter((d) => ids.includes(d.id));
      const newExceptions = ids.filter(
        (id) => matched.has(id) && !rules.value.exceptions.includes(id),
      );
      if (newExceptions.length) rules.except(newExceptions);
      followed.remove(ids);
      return () => {
        if (newExceptions.length) rules.unexcept(newExceptions);
        if (removed.length) followed.merge(removed);
      };
    },
    has(id) {
      return value.some((d) => d.id === id);
    },
    /** Watches a rule; its current matches are marked seen (not `new`). Returns the rule. */
    watch(rule, now = new Date()) {
      const normalized = normalizeRule(rule, now);
      if (!normalized) return null;
      const ids = [...matchedIds([normalized])];
      if (ids.length) rules.markSeen(ids);
      return rules.add(normalized, now);
    },
    /**
     * Stops watching. With `keepPapers`, the papers each rule brought in become manual
     * adds with that rule's reason ("Remove rule only"); otherwise they leave My Papers.
     */
    unwatch(ruleIds, { keepPapers = false } = {}, now = new Date()) {
      if (keepPapers) {
        const drop = new Set(ruleIds);
        const kept = rules.value.rules
          .filter((r) => drop.has(r.id))
          .map((rule) => [
            ruleReason(rule),
            value.filter((d) => !d.manual && d.ruleIds.includes(rule.id)),
          ]);
        for (const [reason, keep] of kept)
          if (keep.length) followed.add(keep, reason, now);
      }
      rules.remove(ruleIds);
    },
    /** Marks papers seen (default: every paper currently flagged `new`). */
    markSeen(ids = value.filter((d) => d.new).map((d) => d.id)) {
      if (ids.length) rules.markSeen(ids);
    },
  });
  return myPapers;
}

/** Reason filter options for My Papers: All, Added by hand, and one per watch rule, with counts. */
export function reasonOptions(items, rules) {
  const count = (key) => filterByReason(items, key).length;
  return [
    { key: "all", label: `All reasons (${items.length})` },
    { key: "manual", label: `★ Added by hand (${count("manual")})` },
    ...rules.map((rule) => ({
      key: rule.id,
      label: `${ruleReason(rule)} (${count(rule.id)})`,
    })),
  ];
}

/** Items kept for a reason key ("all", "manual" or a rule id). */
export function filterByReason(items, key) {
  if (key === "all") return items;
  if (key === "manual") return items.filter((d) => d.manual);
  return items.filter((d) => d.ruleIds?.includes(key));
}

/** The option for `key` from `options` itself (Inputs.select matches its value by identity). */
export function pickReason(options, key) {
  return options.find((d) => d.key === key) ?? options[0];
}

/** Papers that would leave My Papers if this rule went: matched only by it, not added by hand. */
export function ruleOnlyCount(items, ruleId) {
  return items.filter(
    (d) => !d.manual && d.ruleIds?.length === 1 && d.ruleIds[0] === ruleId,
  ).length;
}
