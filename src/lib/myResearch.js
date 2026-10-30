/**
 * "My research" (#27, US11.4): rank the program against one or more of your own abstracts.
 *
 * Long abstracts: the papers were embedded by sentence-transformers, which truncates at 256
 * word pieces, and the browser model would also cut a long text (and MiniLM was trained on
 * short inputs). So an abstract is split into chunks of whole sentences of at most CHUNK_WORDS
 * words (~1.3 word pieces per word in academic English, so a chunk stays well inside 256), each
 * chunk is embedded, and the chunk vectors are mean-pooled weighted by their length and
 * L2-normalized again. That approximates the model's own mean pooling over the whole text
 * instead of silently dropping everything after the first ~190 words.
 *
 * Several abstracts: each one keeps its own vector and a paper's score is its best abstract
 * (max). Abstracts are usually distinct projects; averaging their embeddings lands between them,
 * so a paper squarely about one project scores lower than a vague paper about neither.
 *
 * Privacy: the pasted text lives only in localStorage (`papersNavigator:<id>:research`), never
 * in URLs.
 */
import { DIMS } from "./search.js";

/** At most this many abstracts are used (bounds model work and imported rules). */
export const MAX_ABSTRACTS = 10;
/** Characters kept per abstract (~800 words: longer than any abstract). */
export const MAX_ABSTRACT_LENGTH = 6000;
/**
 * Good cut for "My research" instead of search's 0.30: an abstract shares much more vocabulary
 * with every paper than a short query, so scores run higher (with two sample abstracts on VIS
 * 2026, 177 of 283 papers cleared 0.30 while ~0.50 separated related papers from generic VIS
 * ones). Strong stays halfway from Good to the best score.
 */
export const RESEARCH_GOOD_CUT = 0.5;
/** Words per embedded chunk: well within MiniLM's 256 word-piece window. */
export const CHUNK_WORDS = 120;

const clean = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
const round4 = (x) => Math.round(x * 1e4) / 1e4;

/** One abstract per blank-line-separated block, whitespace collapsed, capped. */
export function splitAbstracts(text) {
  return String(text ?? "")
    .split(/\n\s*\n/)
    .map(clean)
    .filter(Boolean)
    .slice(0, MAX_ABSTRACTS)
    .map((a) => a.slice(0, MAX_ABSTRACT_LENGTH));
}

/** Validated abstracts from a stored or imported rule (strings only, capped); [] if none. */
export function cleanAbstracts(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((a) => typeof a === "string")
    .map(clean)
    .filter(Boolean)
    .slice(0, MAX_ABSTRACTS)
    .map((a) => a.slice(0, MAX_ABSTRACT_LENGTH));
}

/** Chunks of whole sentences of at most `maxWords` words; overlong sentences split by words. */
export function chunkText(text, maxWords = CHUNK_WORDS) {
  const chunks = [];
  let current = [];
  const flush = () => {
    if (current.length) chunks.push(current.join(" "));
    current = [];
  };
  for (const sentence of clean(text).split(/(?<=[.!?])\s+/)) {
    const words = sentence.split(" ").filter(Boolean);
    if (current.length + words.length > maxWords) flush();
    for (let i = 0; i < words.length; i += maxWords) {
      const part = words.slice(i, i + maxWords);
      if (part.length === maxWords) {
        flush();
        chunks.push(part.join(" "));
      } else current.push(...part);
    }
  }
  flush();
  return chunks;
}

/** Weighted mean of the vectors, L2-normalized. */
export function meanPool(vectors, weights = vectors.map(() => 1)) {
  const out = new Float32Array(vectors[0].length);
  vectors.forEach((v, k) => {
    for (let j = 0; j < out.length; j++) out[j] += v[j] * weights[k];
  });
  const norm = Math.hypot(...out) || 1;
  for (let j = 0; j < out.length; j++) out[j] /= norm;
  return out;
}

/** Embedding of a text of any length (`embed` = getEmbedder()'s function). */
export async function embedLongText(embed, text, maxWords = CHUNK_WORDS) {
  const chunks = chunkText(text, maxWords);
  if (chunks.length <= 1) return embed(chunks[0] ?? clean(text));
  const vectors = [];
  for (const chunk of chunks) vectors.push(await embed(chunk));
  return meanPool(
    vectors,
    chunks.map((c) => c.split(" ").length),
  );
}

/** One vector per abstract. */
export async function researchVectors(embed, abstracts) {
  const vectors = [];
  for (const a of abstracts) vectors.push(await embedLongText(embed, a));
  return vectors;
}

/** Best score of row `i` over `vectors`, and which vector gave it. */
function best(vectors, matrix, i, dims) {
  let score = -Infinity;
  let index = 0;
  vectors.forEach((v, k) => {
    let s = 0;
    for (let j = 0, offset = i * dims; j < dims; j++)
      s += v[j] * matrix[offset + j];
    if (s > score) [score, index] = [s, k];
  });
  return { score, index };
}

/** The program ranked by each paper's best abstract; `abstractIndex` = which one. */
export function rankByMaxSimilarity(vectors, matrix, papers, dims = DIMS) {
  return papers
    .map((paper, i) => {
      const { score, index } = best(vectors, matrix, i, dims);
      return { ...paper, score, abstractIndex: index };
    })
    .sort((a, b) => b.score - a.score);
}

/** `{paperId: score}` of papers whose best abstract scores ≥ threshold (4 decimals). */
export function maxSimilarityMatches(
  vectors,
  matrix,
  papers,
  threshold,
  dims = DIMS,
) {
  const matches = {};
  papers.forEach((paper, i) => {
    const { score } = best(vectors, matrix, i, dims);
    if (score >= threshold) matches[paper.id] = round4(score);
  });
  return matches;
}

/** Chip / title text: "My research (2 abstracts)". */
export function researchLabel(n) {
  return `My research (${n} ${n === 1 ? "abstract" : "abstracts"})`;
}

const EMPTY = { text: "", active: false };

/**
 * The pasted abstracts and whether "My research" ranks the program, per conference in
 * localStorage. Reactive: `.value` is `{text, active}`, `set(partial)` and `forget()` dispatch
 * `input`; a `storage` event from another tab reloads it.
 */
export function createResearchStore(
  conferenceId,
  storage = globalThis.localStorage,
  events = globalThis,
) {
  const key = `papersNavigator:${conferenceId}:research`;
  const store = new EventTarget();
  const load = () => {
    try {
      const saved = JSON.parse(storage?.getItem(key) ?? "null");
      return {
        text: typeof saved?.text === "string" ? saved.text : "",
        active: saved?.active === true,
      };
    } catch {
      return { ...EMPTY };
    }
  };
  let value = load();
  events?.addEventListener?.("storage", (event) => {
    if (event.key !== key) return;
    value = load();
    store.dispatchEvent(new Event("input"));
  });
  Object.defineProperty(store, "value", { get: () => value });
  Object.assign(store, {
    set(partial) {
      value = { ...value, ...partial };
      try {
        storage?.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.warn("Could not save your abstracts", error);
      }
      store.dispatchEvent(new Event("input"));
    },
    /** Deletes the abstracts from this device. */
    forget() {
      value = { ...EMPTY };
      try {
        storage?.removeItem(key);
      } catch (error) {
        console.warn("Could not delete your abstracts", error);
      }
      store.dispatchEvent(new Event("input"));
    },
  });
  return store;
}
