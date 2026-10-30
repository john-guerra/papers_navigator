/**
 * Recommended papers (#26, US11.3): papers of the current program not in My Papers, ranked by
 * similarity to the list, each with "why recommended" (its most similar paper in My Papers).
 *
 * Max, not mean: a paper's score is its highest cosine similarity to any paper in My Papers.
 * Lists are usually several interests at once (say, LLM agents and accessibility). The mean
 * compares candidates with the centroid of those interests, which sits between them and favors
 * generic papers that match none of them well; the max lets every interest bring its own
 * nearest neighbors, and its argmax is exactly the "why" the user sees. The cost, that one
 * off-topic paper in the list brings its neighbors too, is visible (the why names it) and
 * fixable (Dismiss, or remove that paper).
 */
import { DIMS } from "./search.js";

/**
 * `myIds`: ids in My Papers (ids not in `papers` are ignored); `matrix` row i ↔ papers[i];
 * `exclude`: ids never recommended (dismissed); `now`: papers that ended before it (talk end,
 * else session end) aren't recommended, papers without a time are. End times are absolute
 * instants, so the comparison holds in the conference timezone. Returns every other paper, best first, as
 * `{...paper, score, because}` where `because` is the most similar paper in My Papers.
 */
export function recommendPapers(
  myIds,
  matrix,
  papers,
  { exclude = new Set(), now = null, dims = DIMS } = {},
) {
  const mine = new Set(myIds);
  const sources = [];
  papers.forEach((p, i) => mine.has(p.id) && sources.push(i));
  if (!sources.length) return [];
  const recs = [];
  papers.forEach((paper, i) => {
    if (mine.has(paper.id) || exclude.has(paper.id) || isOver(paper, now))
      return;
    let best = -Infinity;
    let because = -1;
    const a = i * dims;
    for (const s of sources) {
      let score = 0;
      for (let j = 0, b = s * dims; j < dims; j++)
        score += matrix[a + j] * matrix[b + j];
      if (score > best) [best, because] = [score, s];
    }
    recs.push({ ...paper, score: best, because: papers[because] });
  });
  return recs.sort((x, y) => y.score - x.score);
}

/** True when the paper's talk (else its session) ended before `now`; never without a time. */
export function isOver(paper, now) {
  const end = Date.parse(paper.end ?? paper.sessionEnd ?? "");
  return now != null && !Number.isNaN(end) && end < +now;
}

/** Reason recorded when a recommendation is added: "✨ Like <title>" (≤ 60 characters). */
export function recommendReason(because, max = 60) {
  const reason = `✨ Like ${because.title}`;
  return reason.length <= max
    ? reason
    : `${reason.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Dismissed recommendations, persisted per conference in localStorage
 * (`papersNavigator:<id>:dismissed`). Kept on this device only: they only declutter the
 * recommendations, so they aren't part of the export file or share links. Reactive store:
 * `.value` is the list of ids; `dismiss(id)` returns an undo.
 */
export function createDismissedStore(
  conferenceId,
  storage = globalThis.localStorage,
  events = globalThis,
) {
  const key = `papersNavigator:${conferenceId}:dismissed`;
  const store = new EventTarget();
  let memory = [];
  const load = () => {
    if (!storage) return memory;
    try {
      const list = JSON.parse(storage.getItem(key) ?? "[]");
      return Array.isArray(list)
        ? list.filter((d) => typeof d === "string")
        : [];
    } catch {
      return [];
    }
  };
  let value = load();
  const set = (next) => {
    value = memory = next;
    try {
      storage?.setItem(key, JSON.stringify(next));
    } catch (error) {
      console.warn("Could not save dismissed recommendations", error);
    }
    store.dispatchEvent(new Event("input"));
  };
  // Another tab dismissed or undid one
  events?.addEventListener?.("storage", (event) => {
    if (event.key !== key) return;
    value = load();
    store.dispatchEvent(new Event("input"));
  });
  store.dismiss = (id) => {
    const current = load();
    if (!current.includes(id)) set([...current, id]);
    return () => set(load().filter((d) => d !== id));
  };
  Object.defineProperty(store, "value", { get: () => value });
  return store;
}
