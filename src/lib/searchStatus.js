// Explore before the language model arrives (#120): the program is listed right away, a
// search falls back to keyword matches, and the ranking switches to meaning once it's ready.

const STOP_WORDS = new Set(
  "a an and are as at be by for from in into is of on or the to with via using".split(
    " ",
  ),
);

/** Lowercase, accents removed, compatibility-normalized ("Réduction" → "reduction"). */
export function normalizeText(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** Distinct normalized words of a search, stop words left out. */
export function queryTerms(query) {
  const words = normalizeText(query).match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words.filter((w) => !STOP_WORDS.has(w)))];
}

const fieldsCache = new WeakMap();
const fieldsOf = (paper) => {
  let fields = fieldsCache.get(paper);
  if (!fields) {
    fields = {
      title: normalizeText(paper.title),
      rest: normalizeText(
        [...(paper.keywords ?? []), paper.abstract ?? ""].join(" "),
      ),
    };
    fieldsCache.set(paper, fields);
  }
  return fields;
};
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Papers matching a search by keywords (title, keywords, abstract), a fallback until the model
 * can rank by meaning. A term matches the start of a word, ignoring case and accents. Papers with
 * every term; if none has them all, those with the most. Title matches first, otherwise in the
 * given order. A search without terms (only stop words) keeps every paper.
 */
export function keywordMatches(papers, query) {
  const terms = queryTerms(query);
  if (!terms.length) return papers;
  const patterns = terms.map(
    (t) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(t)}`, "u"),
  );
  const hits = papers.map((paper, index) => {
    const { title, rest } = fieldsOf(paper);
    let matched = 0;
    let inTitle = 0;
    for (const pattern of patterns) {
      if (pattern.test(title)) {
        matched++;
        inTitle++;
      } else if (pattern.test(rest)) matched++;
    }
    return { paper, index, matched, inTitle };
  });
  const best = Math.max(...hits.map((h) => h.matched));
  if (best === 0) return [];
  return hits
    .filter((h) => h.matched === best)
    .sort((a, b) => b.inTitle - a.inTitle || a.index - b.index)
    .map((h) => h.paper);
}

/** "loading" | "ready" | "error" from the page's model status ("error: <message>"). */
export function modelState(modelStatus) {
  if (modelStatus === "ready") return "ready";
  return String(modelStatus).startsWith("error") ? "error" : "loading";
}

/**
 * How the list is ranked: "semantic" (by meaning), "keyword" (a search before the model is
 * ready) or "none" (the program in its usual order; also My research until the model is ready).
 */
export function searchMode({ modelStatus, query = "", research = false }) {
  const hasQuery = Boolean(query?.trim());
  if (modelState(modelStatus) === "ready")
    return research || hasQuery ? "semantic" : "none";
  return hasQuery && !research ? "keyword" : "none";
}

/** The one-line status by the search box (DESIGN.md → Loading); null once the model is ready. */
export function searchStatusLine({ modelStatus, mode, offline = false }) {
  const state = modelState(modelStatus);
  if (state === "ready") return null;
  const keyword = mode === "keyword";
  if (state === "loading")
    return keyword
      ? "⏳ Loading the language model… showing keyword matches until the model is ready"
      : "⏳ Loading the language model… showing the full program; results will be ranked by meaning when it's ready";
  const why = offline
    ? "unavailable offline"
    : "unavailable (the language model failed to load)";
  return `Search by meaning is ${why} — showing ${keyword ? "keyword matches" : "the full program"}`;
}

/**
 * What the aria-live line says when the model arrives during a ranking (null: nothing). Not on
 * the first render (no previous status), nor for a search typed after the model was ready.
 */
export function readyAnnouncement(previousStatus, modelStatus, mode) {
  return previousStatus != null &&
    modelState(previousStatus) !== "ready" &&
    modelState(modelStatus) === "ready" &&
    mode === "semantic"
    ? "Ranked by meaning"
    : null;
}

/**
 * Loads the model once `start` resolves (after the first render, so the ~50 MB of model and
 * runtime don't compete with the program's data), reporting "loading" / "ready" /
 * "error: <message>" to `notify`. A failed load is retried when the browser comes back online
 * or after `retryMs`. Returns a function that stops watching.
 */
export function watchModel({
  load,
  notify,
  start = Promise.resolve(),
  win = globalThis,
  retryMs = 60_000,
}) {
  let stopped = false;
  let timer = null;
  let loading = false;
  const attempt = () => {
    if (stopped || loading) return;
    clearTimeout(timer);
    loading = true;
    Promise.resolve()
      .then(load)
      .then(
        () => {
          loading = false;
          if (stopped) return;
          win.removeEventListener?.("online", attempt);
          notify("ready");
        },
        (error) => {
          loading = false;
          if (stopped) return;
          notify(`error: ${error?.message ?? error}`);
          timer = setTimeout(attempt, retryMs);
        },
      );
  };
  notify("loading");
  win.addEventListener?.("online", attempt);
  Promise.resolve(start).then(attempt);
  return () => {
    stopped = true;
    clearTimeout(timer);
    win.removeEventListener?.("online", attempt);
  };
}
