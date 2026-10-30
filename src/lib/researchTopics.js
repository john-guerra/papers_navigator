/**
 * Research topics (#24, US11.1–11.2): a saved search watched as a rule ("🔍 query"). The rule
 * keeps an absolute similarity threshold (the Strong/Good cut when it was saved) and a cache of
 * the papers at or above it, so My Papers shows them without the language model. Pages
 * re-evaluate the cache in the background when the model can be loaded.
 *
 * Why an absolute threshold and not the level: Strong/Good cuts are derived from the score
 * distribution of the whole program (`relevanceCuts`), so a re-scrape that adds or drops papers
 * would move them and silently change what a topic means. A fixed score keeps "papers at least
 * this similar to my query"; the level is kept only to describe the rule.
 */
import { DIMS } from "./search.js";
import { maxSimilarityMatches, researchVectors } from "./myResearch.js";

const round4 = (x) => Math.round(x * 1e4) / 1e4;
const isTopic = (rule) => rule.type === "topic";

/** `{paperId: score}` of the papers whose similarity to `vector` is ≥ threshold (4 decimals). */
export function topicMatches(vector, matrix, papers, threshold, dims = DIMS) {
  const matches = {};
  papers.forEach((paper, i) => {
    let score = 0;
    for (let j = 0, offset = i * dims; j < dims; j++)
      score += vector[j] * matrix[offset + j];
    if (score >= threshold) matches[paper.id] = round4(score);
  });
  return matches;
}

/** The level's cut rounded down to 4 decimals, so a paper exactly at the cut still matches. */
export function thresholdFor(cuts, level) {
  return Math.floor(cuts[level] * 1e4 + 1e-6) / 1e4;
}

/**
 * A research topic rule from an Explore search: `scored` is the whole program with `score`
 * (similarity to `query`), `cuts` the relevance cuts of that search.
 */
export function topicRule(query, level, cuts, scored, now = new Date()) {
  const threshold = thresholdFor(cuts, level);
  const matches = {};
  for (const p of scored)
    if (p.score != null && p.score >= threshold)
      matches[p.id] = round4(p.score);
  return {
    type: "topic",
    value: query.trim(),
    level,
    threshold,
    matches,
    evaluatedOn: now.toISOString(),
  };
}

/**
 * A "My research" topic rule (#27): like `topicRule`, but `value` is a short name (what the
 * reason and share UI show) and the abstracts it was ranked against travel on the rule, so
 * background re-evaluation embeds the abstracts, not the name.
 */
export function researchRule(name, abstracts, level, cuts, scored, now) {
  const { type, value, ...rest } = topicRule(name, level, cuts, scored, now);
  return { type, value, research: [...abstracts], ...rest };
}

/**
 * What watching at `threshold` would do: how many papers are in and out, how many would join
 * My Papers, the papers just in and just out (the borderline, lowest-in first), and, for a topic
 * already watched (`current` = its cached matches), how many it would add and drop.
 */
export function topicPreview(
  scored,
  threshold,
  { inMyPapers = new Set(), current = null, borderline = 3 } = {},
) {
  const sorted = scored
    .filter((p) => p.score != null)
    .sort((a, b) => b.score - a.score);
  const inside = sorted.filter((p) => p.score >= threshold);
  const outside = sorted.slice(inside.length);
  const joining = inside.filter((p) => !inMyPapers.has(p.id)).length;
  const preview = {
    count: inside.length,
    out: outside.length,
    joining,
    already: inside.length - joining,
    lastIn: inside.slice(-borderline).reverse(),
    firstOut: outside.slice(0, borderline),
  };
  if (current) {
    const ids = new Set(inside.map((p) => p.id));
    preview.added = inside.filter((p) => !(p.id in current)).length;
    preview.dropped = Object.keys(current).filter((id) => !ids.has(id)).length;
  }
  return preview;
}

const sameIds = (a = {}, b = {}) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((id) => id in b);
};

/**
 * Re-evaluates research topics against the current program (`matrix` row i ↔ papers[i]) and
 * stores the new matches. Papers that start matching later are `new`; a rule that had never been
 * evaluated (from a share link or an older import) has its first matches marked seen, like
 * watching it in Explore. Rules whose matches didn't change aren't written. Returns how many
 * rules were updated.
 */
export async function refreshTopicRules({
  rules,
  embed,
  matrix,
  papers,
  dims = DIMS,
  now = new Date(),
  onlyUnevaluated = false,
}) {
  const targets = rules.value.rules.filter(
    (r) => isTopic(r) && (!onlyUnevaluated || !r.evaluatedOn),
  );
  const updates = [];
  for (const rule of targets) {
    // "My research" rules: best of their abstracts; search topics: their query
    const matches = rule.research
      ? maxSimilarityMatches(
          await researchVectors(embed, rule.research),
          matrix,
          papers,
          rule.threshold,
          dims,
        )
      : topicMatches(
          await embed(rule.value),
          matrix,
          papers,
          rule.threshold,
          dims,
        );
    if (rule.evaluatedOn && sameIds(matches, rule.matches)) continue;
    updates.push({
      id: rule.id,
      threshold: rule.threshold,
      matches,
      evaluatedOn: now.toISOString(),
      first: !rule.evaluatedOn,
    });
  }
  // The rules may have changed while the queries were embedded
  const live = updates.filter((u) =>
    rules.value.rules.some((r) => r.id === u.id && r.threshold === u.threshold),
  );
  if (!live.length) return 0;
  const seen = live
    .filter((u) => u.first)
    .flatMap((u) => Object.keys(u.matches));
  if (seen.length) rules.markSeen(seen);
  return rules.setMatches(live);
}

/** False when the browser asks to save data: then only cached matches are used. */
export function canDownloadModel(nav = globalThis.navigator) {
  return nav?.connection?.saveData !== true;
}

/** Runs `task` once the page has painted and the browser is idle (never blocks the UI). */
export function afterFirstPaint(task) {
  const idle = globalThis.requestIdleCallback
    ? (fn) => globalThis.requestIdleCallback(fn, { timeout: 5000 })
    : (fn) => setTimeout(fn, 1500);
  const frame = globalThis.requestAnimationFrame ?? ((fn) => setTimeout(fn, 0));
  frame(() => idle(() => task()));
}

/**
 * Background evaluation of research topics for a page: after first paint, if there are topic
 * rules and the browser doesn't ask to save data, loads the model and the embeddings and
 * re-evaluates every topic; afterwards, evaluates topics that arrive without matches (share
 * link, import). Reactive object: `.value` is "idle" | "save-data" | "running" | "done" |
 * "error" (emits `input` on change); `.stop()` stops listening to the rules.
 */
export function startTopicRefresh({
  rules,
  papers,
  loadEmbedder,
  loadMatrix,
  nav = globalThis.navigator,
  dims = DIMS,
  schedule = afterFirstPaint,
  onRefresh,
}) {
  const status = new EventTarget();
  let value = "idle";
  const setStatus = (next) => {
    if (next === value) return;
    value = next;
    status.dispatchEvent(new Event("input"));
  };
  let model = null;
  const load = () =>
    (model ??= Promise.all([loadEmbedder(), loadMatrix()]).then(
      ([embed, matrix]) => ({ embed, matrix }),
    ));
  let queue = Promise.resolve();
  const run = (onlyUnevaluated) =>
    (queue = queue.then(async () => {
      if (!rules.value.rules.some(isTopic)) return;
      if (!canDownloadModel(nav)) return setStatus("save-data");
      setStatus("running");
      try {
        const t0 = performance.now();
        const { embed, matrix } = await load();
        const updated = await refreshTopicRules({
          rules,
          embed,
          matrix,
          papers,
          dims,
          onlyUnevaluated,
        });
        setStatus("done");
        onRefresh?.({ updated, ms: Math.round(performance.now() - t0) });
      } catch (error) {
        model = null;
        setStatus("error");
        console.warn("Could not evaluate research topics", error);
      }
    }));

  let started = false;
  schedule(() => {
    started = true;
    return run(false);
  });
  const onRulesChange = () => {
    if (started && rules.value.rules.some((r) => isTopic(r) && !r.evaluatedOn))
      schedule(() => run(true));
  };
  rules.addEventListener("input", onRulesChange);

  Object.defineProperty(status, "value", { get: () => value });
  status.stop = () => rules.removeEventListener("input", onRulesChange);
  return status;
}
