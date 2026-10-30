/**
 * Explore's view in the URL fragment (#92): search, relevance, facets, Color by,
 * projection, topic labels, map visibility and map region, so a reload or a shared link opens
 * the same view on any device. Short, stable keys; defaults are omitted (a fresh visit has a
 * clean URL); a link is attacker-controllable, so decoding validates and caps everything.
 *
 * Not here, on purpose: "My research" abstracts (private), Appearance and other per-device
 * settings (localStorage), live projections/clusters (computed in this browser), `?paper=`
 * (paperRoute; a public paper id, so a query param) and the `#follow=` share hash (share.js).
 * The fragment (`#q=…&type=…`), not the query string: it never leaves the browser.
 *
 * State: { query, level, facets: {types, authors, affiliations, keywords, sessions, topics},
 *          color, projection, labels, map, region: {projection, x: [x0, x1], y: [y0, y1]} | null }
 */

/** Facet id (applyFilters' option name) → URL key; one repeated param per value (names contain commas). */
export const FACET_KEYS = {
  types: "type",
  authors: "author",
  affiliations: "inst",
  keywords: "kw",
  sessions: "session",
  topics: "topic",
};
/** Color by field → URL value ("score", Similarity, is the default; live clusters aren't encodable). */
const COLOR_CODES = {
  typeLabel: "type",
  room: "room",
  sessionName: "session",
  clusterLabel: "topic",
};
const COLOR_FIELDS = Object.fromEntries(
  Object.entries(COLOR_CODES).map(([field, code]) => [code, field]),
);
const LEVELS = ["strong", "good", "weak", "all"];
const DEFAULT_LEVEL = "good";

export const EXPLORE_KEYS = [
  "q",
  "level",
  ...Object.values(FACET_KEYS),
  "color",
  "proj",
  "labels",
  "map",
  "region",
];

/** Share-link keys (share.js) a page keeps in its fragment though it doesn't own them. */
export const SHARE_KEYS = ["follow", "watch"];
/** Longest fragment read at load (a long share list is ~2 KB); a longer one is dropped. */
export const MAX_HASH = 4096;

const MAX_QUERY = 300;
/** Longest facet value (real author/institution/session names are far shorter). */
const MAX_VALUE = 200;
const MAX_VALUES = 50;

const sameSet = (a, b) =>
  a.length === b.length && a.every((v) => b.includes(v));
const round = (v) => String(Math.round(v * 1000) / 1000);

/**
 * URLSearchParams with only the keys that differ from `defaults`: {query, types, projection,
 * projections (the precomputed ones, the only ones a link can name)}.
 */
export function encodeExploreState(state, defaults = {}) {
  const params = new URLSearchParams();
  const query = state.query ?? "";
  if (query !== (defaults.query ?? "")) params.set("q", query);
  if (query.trim() && state.level && state.level !== DEFAULT_LEVEL)
    params.set("level", state.level);
  for (const [id, key] of Object.entries(FACET_KEYS)) {
    const values = state.facets?.[id] ?? [];
    if (id === "types") {
      const fallback = defaults.types ?? [];
      if (sameSet(values, fallback)) continue;
      // All types (none picked) differs from the default "Main tracks"
      if (!values.length) params.append(key, "");
    }
    for (const v of values) params.append(key, v);
  }
  if (COLOR_CODES[state.color]) params.set("color", COLOR_CODES[state.color]);
  // Live projections (Advanced) exist only in this browser: neither they nor a region on them
  const projectionEncodable = (defaults.projections ?? []).includes(
    state.projection,
  );
  if (projectionEncodable && state.projection !== defaults.projection)
    params.set("proj", state.projection);
  if (state.labels === false) params.set("labels", "0");
  if (state.map === false) params.set("map", "0");
  const { region } = state;
  if (projectionEncodable && region?.projection === state.projection)
    params.set("region", [...region.x, ...region.y].map(round).join(","));
  return capParams(params);
}

/**
 * Keeps a written fragment under `max` (what cleanHash accepts at load, so a reload never drops
 * the whole view): drops the region first, then facet values from the last one, with a warning.
 */
function capParams(params, max = MAX_HASH) {
  if (params.toString().length <= max) return params;
  console.warn(
    `The view is too long for the URL (over ${max} characters): shortening it`,
  );
  params.delete("region");
  const facetKeys = Object.values(FACET_KEYS);
  const entries = [...params];
  let length = params.toString().length;
  for (let i = entries.length - 1; i >= 0 && length > max; i--) {
    if (!facetKeys.includes(entries[i][0])) continue;
    entries.splice(i, 1);
    length = new URLSearchParams(entries).toString().length;
  }
  return new URLSearchParams(entries);
}

/**
 * The state in `params`, with defaults for anything absent or invalid. Options:
 * defaults {query, types, projection}; projections and colors (valid choices); facetValues
 * {facetId: Set} to drop values that aren't in this program (facets without one are only capped).
 */
export function decodeExploreState(
  params,
  { defaults = {}, projections = [], colors = [], facetValues = {} } = {},
) {
  const facets = {};
  for (const [id, key] of Object.entries(FACET_KEYS)) {
    const valid = facetValues[id];
    const raw = params.getAll(key);
    const values = [
      ...new Set(
        raw.filter(
          (v) => v && v.length <= MAX_VALUE && (!valid || valid.has(v)),
        ),
      ),
    ].slice(0, MAX_VALUES);
    if (id !== "types") facets[id] = values;
    // No type param: the default types; "type=" alone: all types; only unknown types: default
    else if (!raw.length || (!values.length && raw.some(Boolean)))
      facets[id] = [...(defaults.types ?? [])];
    else facets[id] = values;
  }
  const level = params.get("level");
  const color = COLOR_FIELDS[params.get("color")];
  const proj = params.get("proj");
  const projection = projections.includes(proj) ? proj : defaults.projection;
  return {
    query: params.has("q")
      ? params.get("q").slice(0, MAX_QUERY)
      : (defaults.query ?? ""),
    level: LEVELS.includes(level) ? level : DEFAULT_LEVEL,
    facets,
    color: color && colors.includes(color) ? color : "score",
    projection,
    labels: params.get("labels") !== "0",
    map: params.get("map") !== "0",
    region: decodeRegion(params.get("region"), projection),
  };
}

/** A plain decimal number: Number() would also take "", " 1", "0x1f" and "Infinity". */
const NUMBER = /^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

function decodeRegion(text, projection) {
  if (!text || text.length > 100) return null;
  const parts = text.split(",");
  if (parts.length !== 4 || !parts.every((p) => NUMBER.test(p))) return null;
  const v = parts.map(parseFloat);
  if (!v.every(Number.isFinite)) return null;
  const x = [Math.min(v[0], v[1]), Math.max(v[0], v[1])];
  const y = [Math.min(v[2], v[3]), Math.max(v[2], v[3])];
  if (x[0] === x[1] || y[0] === y[1]) return null;
  return { projection, x, y };
}

/** The fragment's `key=value&…` pairs (URLSearchParams over `location.hash`). */
export function hashParams(href) {
  return new URLSearchParams(new URL(href).hash.slice(1));
}

/**
 * `href` with `keys` in the fragment replaced by `params` (none: removed). The query string
 * (e.g. ?paper=) is always kept; other fragment pairs too, unless `keep` lists the only other
 * keys to keep (e.g. SHARE_KEYS): then the rest (unknown pairs from a link) are dropped.
 */
export function withParams(href, params, keys = EXPLORE_KEYS, { keep } = {}) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  for (const key of keys) hash.delete(key);
  if (keep)
    for (const key of new Set(hash.keys()))
      if (!keep.includes(key)) hash.delete(key);
  for (const [key, value] of params) hash.append(key, value);
  const text = hash.toString();
  url.hash = "";
  return url.href.replace(/#$/, "") + (text ? `#${text}` : "");
}

/**
 * The fragment's pairs at load, cleaned up: only the page's `keys` and `keep` (share-link keys)
 * survive, and a fragment longer than `maxLength` is dropped whole (with a console warning).
 * Unknown pairs would otherwise ride along in every URL the page writes. When something was
 * dropped, the URL is rewritten with replaceState (history.state kept).
 */
export function cleanHash({
  win = globalThis.window,
  keys = EXPLORE_KEYS,
  keep = SHARE_KEYS,
  maxLength = MAX_HASH,
} = {}) {
  const url = new URL(win.location.href);
  const text = url.hash.slice(1);
  let params = new URLSearchParams(text);
  if (text.length > maxLength) {
    console.warn(
      `Ignoring a ${text.length}-character URL fragment (over ${maxLength})`,
    );
    params = new URLSearchParams();
  } else {
    const allowed = [...keys, ...keep];
    params = new URLSearchParams(
      [...params].filter(([key]) => allowed.includes(key)),
    );
  }
  const dropped = [...params].length !== [...new URLSearchParams(text)].length;
  if (dropped || text.length > maxLength) {
    const next = withParams(win.location.href, params, [
      ...new URLSearchParams(text).keys(),
    ]);
    try {
      win.history.replaceState(win.history.state, "", next);
    } catch {
      // the page still ignores the dropped pairs
    }
  }
  return params;
}

/**
 * Keeps the URL in step with a page's state, in the fragment: a fragment never reaches the
 * server (access logs) nor other sites (Referer), so searches and filters stay in the browser.
 * `update(patch)` merges into `.state` and writes `encode(state)` with history.replaceState
 * (never pushState: no history entry per keystroke), `delay` ms after the last change (0: now;
 * `flush()` writes a pending one), keeping history.state (paperRoute's depth).
 * The URL is read once, at load; Back/Forward belong to ?paper= (paperRoute), so after one the
 * page's state is written back onto that entry. A fragment the person changes in the address bar
 * (or a pasted link that differs only in it) doesn't reload the page: `onExternalChange` (default:
 * reload, so the page starts from that link) runs instead, if it has one of the page's `keys`
 * (an in-page anchor such as #privacy is not a new view). Writes keep only `keys` and `keep`.
 */
export function createUrlSync({
  win = globalThis.window,
  encode,
  keys = EXPLORE_KEYS,
  keep = SHARE_KEYS,
  state = {},
  onExternalChange = () => win.location.reload(),
  delay = 250,
}) {
  const sync = { state };
  const target = () =>
    withParams(win.location.href, encode(sync.state), keys, { keep });
  const withoutHash = (href) => href.replace(/#.*$/, "");
  // The URL as this page last left it (pushState by paperRoute fires nothing, so it may lag)
  let last = win.location.href;
  let timer = null;
  const write = () => {
    clearTimeout(timer);
    timer = null;
    const next = target();
    // Safari throws (SecurityError) after ~100 history calls in a short window: the URL then
    // lags until the next write, the page itself is unaffected
    try {
      if (next !== win.location.href)
        win.history.replaceState(win.history.state, "", next);
    } catch {
      // keep going
    }
    last = win.location.href;
  };
  // Back/Forward (e.g. closing paper details) changes the query string: put our state back.
  // Only the fragment changed (address bar, a pasted link): that's a new view to start from.
  // (A fragment navigation fires popstate too, before hashchange.)
  const onPopState = () => {
    // A pending change goes onto the entry we land on (write below), not the one we left
    clearTimeout(timer);
    timer = null;
    const sameBase = withoutHash(win.location.href) === withoutHash(last);
    if (
      sameBase &&
      !keys.some((key) => hashParams(win.location.href).has(key))
    ) {
      // An in-page anchor (or a fragment emptied by hand): not a view, leave it
      last = win.location.href;
      return;
    }
    if (sameBase && target() !== win.location.href) return onExternalChange();
    write();
  };
  // Trailing debounce: a brush drag emits on every point it crosses
  sync.update = (patch) => {
    sync.state = { ...sync.state, ...patch };
    if (!delay) return write();
    clearTimeout(timer);
    timer = setTimeout(write, delay);
  };
  /** Writes a pending change now (e.g. before pushing a history entry). */
  sync.flush = () => timer != null && write();
  win.addEventListener("popstate", onPopState);
  sync.stop = () => {
    clearTimeout(timer);
    win.removeEventListener("popstate", onPopState);
  };
  return sync;
}
