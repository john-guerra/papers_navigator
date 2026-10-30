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
 * @property {number} [threshold] topic only: minimum similarity score to match, an absolute
 *   score fixed when the topic is saved (the level's cut then), so a re-scrape doesn't move it
 * @property {"strong" | "good"} [level] topic only: the relevance level it was saved at
 * @property {Record<string, number>} [matches] topic only: cached `paper id → score` of the
 *   papers at or above the threshold, so My Papers works without the language model (#24)
 * @property {string} [evaluatedOn] topic only: ISO date `matches` were computed; missing for a
 *   rule that arrived without them (share link), which matches nothing until evaluated
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
  if (type === "topic") Object.assign(normalized, topicFields(rule));
  return normalized;
}

const LEVELS = new Set(["strong", "good"]);
/**
 * Lowest threshold a research topic may have: rules also arrive from links and files, and a
 * threshold ≤ 0 would put most of the program in My Papers (cosine scores can be negative).
 */
export const MIN_TOPIC_THRESHOLD = 0.1;
/** Cached matches cap: more than any program; bounds work on an untrusted import. */
const MAX_MATCHES = 10000;

/** Topic-only fields, validated (rules come from files and links too). */
function topicFields(rule) {
  const threshold = Number(rule.threshold);
  const fields = {
    threshold: Number.isFinite(threshold)
      ? Math.min(1, Math.max(MIN_TOPIC_THRESHOLD, threshold))
      : MIN_TOPIC_THRESHOLD,
    level: LEVELS.has(rule.level) ? rule.level : "good",
  };
  if (rule.matches && typeof rule.matches === "object") {
    const entries = Object.entries(rule.matches)
      .slice(0, MAX_MATCHES)
      .filter(
        ([id, score]) =>
          id.length > 0 &&
          id.length <= 64 &&
          typeof score === "number" &&
          Number.isFinite(score),
      );
    fields.matches = Object.fromEntries(entries);
  }
  if (
    typeof rule.evaluatedOn === "string" &&
    !Number.isNaN(Date.parse(rule.evaluatedOn))
  )
    fields.evaluatedOn = rule.evaluatedOn;
  return fields;
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
 * without scores a topic rule matches nothing (evaluation: researchTopics.js, #24).
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
      // Topic rules use the page's scores if given, else their cached matches (#24)
      const scores =
        rule.type === "topic" ? (scoresFor?.(rule) ?? rule.matches) : undefined;
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
        saved = { ...existing };
        if (next.type === "topic") {
          // Re-saving a research topic replaces its level, threshold and (if given) matches;
          // matches cached for another threshold are dropped until it is re-evaluated
          const { matches, evaluatedOn, ...rest } = existing;
          saved = { ...rest, threshold: next.threshold, level: next.level };
          if (next.matches) {
            saved.matches = next.matches;
            if (next.evaluatedOn) saved.evaluatedOn = next.evaluatedOn;
          } else if (matches && existing.threshold === next.threshold)
            Object.assign(saved, { matches }, evaluatedOn && { evaluatedOn });
        }
        return {
          ...s,
          rules: s.rules.map((r) => (r.id === next.id ? saved : r)),
        };
      });
      return saved;
    },
    /**
     * Stores freshly computed matches of research topics (`[{id, threshold, matches,
     * evaluatedOn}]`) in one write and one `input`. A rule removed, or re-saved with another
     * threshold, meanwhile is left alone. Returns how many rules changed.
     */
    setMatches(updates) {
      let changed = 0;
      update((s) => ({
        ...s,
        rules: s.rules.map((rule) => {
          const next = updates.find(
            (u) => u.id === rule.id && u.threshold === rule.threshold,
          );
          if (!next) return rule;
          changed++;
          return {
            ...rule,
            matches: next.matches,
            evaluatedOn: next.evaluatedOn,
          };
        }),
      }));
      return changed;
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

/**
 * Adds watch rules from an import or a share link, skipping ones already watched (their current
 * matches are not flagged new), plus optional exceptions. Returns how many rules were added and
 * an undo that removes exactly what was added.
 */
export function applyRules(myPapers, rulesStore, rules = [], exceptions = []) {
  const addedRules = [];
  for (const rule of rules) {
    const normalized = normalizeRule(rule);
    if (!normalized || rulesStore.has(normalized.id)) continue;
    myPapers.watch(normalized);
    addedRules.push(normalized.id);
  }
  const addedExceptions = exceptions.filter(
    (id) => !rulesStore.value.exceptions.includes(id),
  );
  if (addedExceptions.length) rulesStore.except(addedExceptions);
  return {
    added: addedRules.length,
    undo: () => {
      if (addedRules.length) rulesStore.remove(addedRules);
      if (addedExceptions.length) rulesStore.unexcept(addedExceptions);
    },
  };
}
