/**
 * Bluesky (#203 Stage C, the Live page): the post draft for a paper, Bluesky's compose link,
 * account search and the @papers.ieeevis.org discussion posts. Nothing here posts anything: the
 * draft goes to Bluesky's own app or compose page. The only requests are the public, logged-out
 * API below: an author's name when you tap "Find on Bluesky", and the official account's feed.
 */

const API = "https://public.api.bsky.app/xrpc";
export const POST_LIMIT = 300;
const FEED_ACTOR = "papers.ieeevis.org";

const segmenter =
  typeof Intl !== "undefined" && Intl.Segmenter
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;
const split = (text) =>
  segmenter ? [...segmenter.segment(text)].map((s) => s.segment) : [...text];

/** Characters as people see them (Bluesky's limit counts graphemes). */
export function graphemes(text) {
  return split(String(text)).length;
}

const build = ({ title, authors, rating, note, link }) =>
  [
    [
      `"${title}"${authors ? ` by ${authors}` : ""}`,
      rating ? "★".repeat(rating) : "",
      note,
    ]
      .filter(Boolean)
      .join(" "),
    link,
    "#ieeevis",
  ]
    .filter(Boolean)
    .join("\n");

/**
 * The draft `"<title>" by <authors> ★★★★ <note>\n<link>\n#ieeevis` (empty parts left out), an
 * author as `@handle` when you picked one. Over 300 graphemes, it shortens the authors (your
 * picked handles and the first other author, then "et al."), then the title ("…"); never the
 * note or the link. `{text, length, over}`.
 */
export function composePost({
  title,
  authors = [],
  handles = {},
  rating = 0,
  note = "",
  link = "",
}) {
  const shown = (name) => (handles[name] ? `@${handles[name]}` : name);
  const parts = {
    title,
    rating,
    note: note.trim(),
    link,
    authors: authors.map(shown).join(", "),
  };
  let text = build(parts);
  // 1. The authors: your picked handles, then the first other author, then "et al."
  if (graphemes(text) > POST_LIMIT && authors.length > 1) {
    const firstOther = authors.find((a) => !handles[a]);
    const kept = [
      ...authors.filter((a) => handles[a]),
      ...(firstOther ? [firstOther] : []),
    ];
    parts.authors =
      kept.map(shown).join(", ") +
      (kept.length < authors.length ? " et al." : "");
    text = build(parts);
  }
  // 2. The title ("…"); never the note or the link
  const extra = graphemes(text) - POST_LIMIT;
  if (extra > 0) {
    const chars = split(title);
    const keep = Math.max(10, chars.length - extra - 1);
    if (keep < chars.length) {
      parts.title = chars.slice(0, keep).join("").trimEnd() + "…";
      text = build(parts);
    }
  }
  const length = graphemes(text);
  return { text, length, over: length > POST_LIMIT };
}

/** Bluesky's compose page with the draft filled in. */
export function composeUrl(text) {
  return `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;
}

/** "at://did/app.bsky.feed.post/<rkey>" → its bsky.app page. */
export function postUrl(atUri, handle) {
  return `https://bsky.app/profile/${handle}/post/${atUri.split("/").pop()}`;
}

/** The paper id in an ieeevis.org program link (".../program/paper/<id>/", ".../content/<id>"). */
export function paperIdFromLink(url) {
  const m = /\/program\/(?:paper|content)\/([0-9a-f]{8}-[0-9a-f-]{27})/i.exec(
    String(url ?? ""),
  );
  return m ? m[1].toLowerCase() : null;
}

const fold = (s) =>
  String(s).toLowerCase().replace(/…/g, "").replace(/\s+/g, " ").trim();
/** Shorter quoted titles are too ambiguous to match (#203 Stage C). */
const MIN_QUOTE = 25;

/**
 * Posts of the official account matched to papers: by the paper id in a link (facet or
 * embed), else by the quoted title in the text (a prefix of exactly one paper's title, 25+
 * characters). The first post per paper wins. Map paperId → bsky.app post URL.
 */
export function matchDiscussion(feed = [], papers = []) {
  const ids = new Set(papers.map((p) => p.id));
  const titles = papers.map((p) => [p.id, fold(p.title)]);
  const map = new Map();
  for (const item of feed) {
    const post = item?.post;
    const record = post?.record ?? {};
    const links = [
      ...(record.facets ?? []).flatMap((f) =>
        (f.features ?? []).map((x) => x.uri),
      ),
      post?.embed?.external?.uri,
      record.embed?.external?.uri,
    ];
    let id = links.map(paperIdFromLink).find((x) => x && ids.has(x)) ?? null;
    if (!id) {
      const quote = /"([^"]+)"/.exec(record.text ?? "")?.[1];
      const q = quote && fold(quote);
      if (q && q.length >= MIN_QUOTE) {
        const hits = titles.filter(([, t]) => t.startsWith(q));
        if (hits.length === 1) id = hits[0][0];
      }
    }
    if (id && !map.has(id) && post?.uri)
      map.set(id, postUrl(post.uri, post.author?.handle ?? FEED_ACTOR));
  }
  return map;
}

/**
 * Accounts from a search response: [{handle, name, avatar, bio, followers, posts, joined}];
 * the counts and join date are null until a profiles response fills them (withProfiles).
 */
export function parseAccounts(json) {
  return (json?.actors ?? [])
    .filter((a) => typeof a?.handle === "string")
    .map((a) => ({
      handle: a.handle,
      name: a.displayName ?? "",
      avatar: a.avatar ?? "",
      bio: a.description ?? "",
      followers: null,
      posts: null,
      joined: null,
    }));
}

/** Accounts with followers, posts and join date from a getProfiles response (by handle). */
function withProfiles(accounts, json) {
  const byHandle = new Map((json?.profiles ?? []).map((p) => [p.handle, p]));
  return accounts.map((a) => {
    const p = byHandle.get(a.handle);
    return p
      ? {
          ...a,
          bio: a.bio || (p.description ?? ""),
          followers: Number.isFinite(p.followersCount)
            ? p.followersCount
            : null,
          posts: Number.isFinite(p.postsCount) ? p.postsCount : null,
          joined: p.createdAt ?? null,
        }
      : a;
  });
}

/** An account's page on Bluesky. */
export function profileUrl(handle) {
  return `https://bsky.app/profile/${handle}`;
}

const plain = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const words = (s) =>
  plain(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
// Words too common in affiliations (or in vis people's bios: field and place words) to tell
// people apart (#206 quick review)
const GENERIC = new Set(
  "university universitat universite universidad universita of the and at for de la le du der fur institute institut technology college school department dept lab laboratory research center centre national science sciences state polytechnic inc ltd group data visual visualization visualisation vis analytics information computer computing engineering california new york usa uk city north south east west san los saint st".split(
    " ",
  ),
);

/**
 * The author's affiliation (from the paper) when a Bluesky bio mentions one of its distinctive
 * words ("Utrecht", "Zurich", "Notre"): a hint for picking the right account, never a pick.
 * The affiliation, or null.
 */
export function affiliationMatch(bio, affiliation) {
  const distinctive = words(affiliation).filter(
    (w) => w.length >= 3 && !GENERIC.has(w),
  );
  if (!distinctive.length) return null;
  const said = new Set(words(bio));
  return distinctive.some((w) => said.has(w)) ? affiliation : null;
}

async function getJson(url, fetch) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Bluesky answered ${response.status}`);
  return response.json();
}

/**
 * Bluesky accounts matching an author's name (the only thing sent), up to 5, with their bios;
 * then one request for those accounts' followers, posts and join date (if it fails, the
 * accounts come without them).
 */
export async function searchAccounts(name, { fetch = globalThis.fetch } = {}) {
  const url = `${API}/app.bsky.actor.searchActors?q=${encodeURIComponent(name)}&limit=5`;
  const accounts = parseAccounts(await getJson(url, fetch));
  if (!accounts.length) return accounts;
  try {
    const profiles = await getJson(
      `${API}/app.bsky.actor.getProfiles?${accounts.map((a) => `actors=${encodeURIComponent(a.handle)}`).join("&")}`,
      fetch,
    );
    return withProfiles(accounts, profiles);
  } catch {
    return accounts;
  }
}

/** The official account's discussion posts, matched to `papers` (reads up to `pages` × 100 posts). */
export async function loadDiscussion(
  papers,
  { fetch = globalThis.fetch, pages = 5 } = {},
) {
  const feed = [];
  let cursor = "";
  for (let i = 0; i < pages; i++) {
    const json = await getJson(
      `${API}/app.bsky.feed.getAuthorFeed?actor=${FEED_ACTOR}&limit=100&filter=posts_no_replies${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      fetch,
    );
    feed.push(...(json?.feed ?? []));
    cursor = json?.cursor;
    if (!cursor) break;
  }
  return matchDiscussion(feed, papers);
}

/**
 * Bluesky handles you picked, by author name, on this device only
 * (`papersNavigator:<id>:bskyHandles`). `.get(name)`, `.set(name, handle)` ("" forgets).
 */
export function createHandlesStore(
  conferenceId,
  storage = globalThis.localStorage,
) {
  const key = `papersNavigator:${conferenceId}:bskyHandles`;
  const store = new EventTarget();
  const load = () => {
    try {
      const raw = JSON.parse(storage?.getItem(key) ?? "{}");
      return Object.fromEntries(
        Object.entries(raw && typeof raw === "object" ? raw : {}).filter(
          ([name, handle]) => name && typeof handle === "string" && handle,
        ),
      );
    } catch {
      return {};
    }
  };
  let value = load();
  Object.defineProperty(store, "value", { get: () => value });
  store.get = (name) => value[name] ?? "";
  store.set = (name, handle) => {
    value = { ...load() };
    if (handle) value[name] = handle;
    else delete value[name];
    try {
      storage?.setItem(key, JSON.stringify(value));
    } catch {
      // kept for this visit
    }
    store.dispatchEvent(new Event("input"));
  };
  return store;
}
