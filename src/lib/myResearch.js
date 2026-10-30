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

/** Short stable hash (FNV-1a, 32-bit, hex) of a string. */
export function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/** Cache key of an abstract's vector: changes with the text and with how it is embedded. */
const vectorKey = (abstract) =>
  hashText(`minilm-l6|${CHUNK_WORDS}|${abstract}`);

/**
 * One vector per abstract. With `cache` ({get, set} by key, e.g. `createVectorCache`), an
 * abstract already embedded (in Explore or on an earlier visit) isn't embedded again.
 */
export async function researchVectors(embed, abstracts, cache) {
  const vectors = [];
  for (const a of abstracts) {
    const key = vectorKey(a);
    let vector = cache?.get(key);
    if (!vector) {
      vector = Float32Array.from(await embedLongText(embed, a));
      cache?.set(key, vector);
    }
    vectors.push(vector);
  }
  return vectors;
}

const toBase64 = (vector) => {
  const bytes = new Uint8Array(Float32Array.from(vector).buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};
const fromBase64 = (text) => {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
};

/**
 * Abstract vectors kept across visits (`papersNavigator:<id>:researchVectors`, base64 Float32,
 * ~2 KB each), so research topics aren't re-embedded on every page load. Only vectors (not the
 * text) are stored; at most `max` entries, the most recent kept. `clear()` empties it.
 */
export function createVectorCache(
  conferenceId,
  storage = globalThis.localStorage,
  { max = 50 } = {},
) {
  const key = `papersNavigator:${conferenceId}:researchVectors`;
  let entries;
  try {
    const saved = JSON.parse(storage?.getItem(key) ?? "{}");
    entries = saved && typeof saved === "object" ? saved : {};
  } catch {
    entries = {};
  }
  const memory = new Map();
  return {
    get(k) {
      if (memory.has(k)) return memory.get(k);
      if (typeof entries[k] !== "string") return undefined;
      try {
        const vector = fromBase64(entries[k]);
        memory.set(k, vector);
        return vector;
      } catch {
        return undefined;
      }
    },
    set(k, vector) {
      memory.set(k, vector);
      delete entries[k];
      entries[k] = toBase64(vector);
      const keys = Object.keys(entries);
      for (const old of keys.slice(0, Math.max(0, keys.length - max))) {
        delete entries[old];
        memory.delete(old);
      }
      try {
        storage?.setItem(key, JSON.stringify(entries));
      } catch (error) {
        console.warn("Could not cache research vectors", error);
      }
    },
    clear() {
      entries = {};
      memory.clear();
      try {
        storage?.removeItem(key);
      } catch (error) {
        console.warn("Could not clear research vectors", error);
      }
    },
  };
}

/**
 * Fingerprint of the program as the model sees it (paper ids + embeddings): a research topic
 * evaluated against the same fingerprint needs no re-evaluation.
 */
export function programFingerprint(papers, matrix) {
  const bytes = new Uint8Array(
    matrix.buffer,
    matrix.byteOffset,
    matrix.byteLength,
  );
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return `${papers.length}-${hashText(papers.map((p) => p.id).join("|"))}-${(h >>> 0).toString(16)}`;
}

/**
 * Strong / Good cuts for "My research", from the score distribution instead of search's fixed
 * 0.30: an abstract shares vocabulary with every paper, so its scores sit higher and spread
 * differently from abstract to abstract, and no single number works (with every VIS 2026 paper
 * as a stand-in abstract, a fixed 0.50 gave 2/26/111 Good papers at p10/p50/p90).
 * Good = mean + 2 sd (the papers that stand out from the program for this abstract: 6/10/17
 * with the fallback). Strong = mean + 2.5 sd (0/2/8 papers); mean + 3 sd left Strong empty for
 * more than half of the stand-ins (0/0/4). As for search, if fewer than 5 papers clear Good it
 * falls to the 10th best score; Strong is kept between Good and the best score.
 */
export function researchCuts(scores) {
  const values = scores.filter((s) => s != null);
  if (!values.length) return { good: 0, strong: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length,
  );
  const sorted = [...values].sort((a, b) => b - a);
  let good = mean + 2 * sd;
  if (sorted.filter((s) => s >= good).length < 5)
    good = sorted[Math.min(9, sorted.length - 1)];
  const strong = Math.min(sorted[0], Math.max(good, mean + 2.5 * sd));
  return { good, strong };
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
