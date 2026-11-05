// The map's similarity colors (#166): John's CHI 2026 navigator colored the score with Vega's
// `brownbluegreen`, so that is the default; Options → Appearance offers every continuous Vega
// scheme (https://vega.github.io/vega/docs/schemes/) and our oxblood ramp (DESIGN.md tokens).
// The map passes the name to Vega-Lite's `scale.scheme`; the legend reads the map's own scale,
// and the Options preview samples the same interpolator.
import { interpolateColors, scheme as vegaScheme } from "vega";

export const SIMILARITY_SCHEME_KEY = "papersNavigator:similarityScheme";
export const OXBLOOD = "oxblood";
export const DEFAULT_SIMILARITY_SCHEME = "brownbluegreen";

const vega = (list) => list.map((name) => ({ name, label: name }));

/** The choices, grouped like Vega's scheme docs (continuous schemes only: similarity is a number). */
export const SIMILARITY_SCHEME_GROUPS = [
  {
    label: "This site",
    schemes: [{ name: OXBLOOD, label: "oxblood (DESIGN.md, 3:1 contrast)" }],
  },
  {
    label: "Sequential single-hue",
    schemes: vega([
      "blues",
      "tealblues",
      "teals",
      "greens",
      "browns",
      "oranges",
      "reds",
      "purples",
      "warmgreys",
      "greys",
    ]),
  },
  {
    label: "Sequential multi-hue",
    schemes: vega([
      "viridis",
      "magma",
      "inferno",
      "plasma",
      "cividis",
      "turbo",
      "bluegreen",
      "bluepurple",
      "goldgreen",
      "goldorange",
      "goldred",
      "greenblue",
      "orangered",
      "purplebluegreen",
      "purpleblue",
      "purplered",
      "redpurple",
      "yellowgreenblue",
      "yellowgreen",
      "yelloworangebrown",
      "yelloworangered",
      "darkblue",
      "darkgold",
      "darkgreen",
      "darkmulti",
      "darkred",
      "lightgreyred",
      "lightgreyteal",
      "lightmulti",
      "lightorange",
      "lighttealblue",
    ]),
  },
  {
    label: "Diverging",
    schemes: vega([
      "blueorange",
      "brownbluegreen",
      "purplegreen",
      "pinkyellowgreen",
      "purpleorange",
      "redblue",
      "redgrey",
      "redyellowblue",
      "redyellowgreen",
      "spectral",
    ]).map((s) =>
      s.name === DEFAULT_SIMILARITY_SCHEME
        ? { ...s, label: `${s.name} (CHI navigator, default)` }
        : s,
    ),
  },
  { label: "Cyclical", schemes: vega(["rainbow", "sinebow"]) },
];

const NAMES = new Set(
  SIMILARITY_SCHEME_GROUPS.flatMap((g) => g.schemes.map((s) => s.name)),
);

/** Whether `name` is one of the choices. */
export function isSimilarityScheme(name) {
  return NAMES.has(name);
}

/**
 * A DESIGN.md token from the page's CSS custom properties (src/style.css), or `fallback`
 * outside a styled page (tests). Read when called, so it follows light/dark.
 */
export function token(name, fallback) {
  const value =
    typeof document === "undefined"
      ? ""
      : getComputedStyle(document.documentElement)
          .getPropertyValue(`--${name}`)
          .trim();
  return value || fallback;
}

/** DESIGN.md sequential oxblood ramp, weakest to strongest match. */
export function similarityRange() {
  return [
    token("color-viz-similarity-1", "#c37b71"),
    token("color-viz-similarity-2", "#a7463d"),
    token("color-viz-similarity-3", "#75201a"),
  ];
}

/**
 * The ramp's domain (#166 review), like the CHI navigator's: the scheme spans the scores of the
 * papers shown, from the relevance level's `cut` (the lowest shown score when there is no cut,
 * "All") to the best match on the map. At the Good level that is the Good cut → the best match.
 * Null when nothing is shown or the domain collapses (tied scores).
 */
export function rampDomain(scores, cut = null) {
  const shown = scores.filter(
    (s) => Number.isFinite(s) && (cut == null || s >= cut),
  );
  if (!shown.length) return null;
  const hi = Math.max(...shown);
  const lo = cut ?? Math.min(...shown);
  return hi > lo ? [lo, hi] : null;
}

/** The Vega-Lite color scale for similarity: `{scheme}`, or the oxblood `{range}`. */
export function similarityColorScale(name) {
  return name && name !== OXBLOOD && isSimilarityScheme(name)
    ? { scheme: name }
    : { range: similarityRange() };
}

/** t in [0, 1] → the color Vega draws for that fraction of the ramp. */
export function similarityColorAt(name) {
  const { scheme, range } = similarityColorScale(name);
  return scheme ? vegaScheme(scheme) : interpolateColors(range);
}

/** A CSS linear-gradient of the scheme, left (least similar) to right. */
export function similarityGradient(name, steps = 9) {
  const at = similarityColorAt(name);
  const stops = Array.from(
    { length: steps },
    (_, i) => `${at(i / (steps - 1))} ${Math.round((i / (steps - 1)) * 100)}%`,
  );
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

/**
 * The chosen scheme remembered per device: an EventTarget with `.value` (a scheme name) and
 * `.set(name)` emitting `input` (reactive widget contract). Unknown names mean the default.
 */
export function createSimilaritySchemeSettings({
  storage = globalThis.localStorage,
} = {}) {
  const store = new EventTarget();
  let stored = null;
  try {
    stored = JSON.parse(storage?.getItem(SIMILARITY_SCHEME_KEY) ?? "null");
  } catch {
    // Unreadable: the default
  }
  store.value = isSimilarityScheme(stored) ? stored : DEFAULT_SIMILARITY_SCHEME;
  store.set = (name) => {
    store.value = isSimilarityScheme(name) ? name : DEFAULT_SIMILARITY_SCHEME;
    try {
      storage?.setItem(SIMILARITY_SCHEME_KEY, JSON.stringify(store.value));
    } catch {
      // Private mode etc.: the choice still applies for this page view
    }
    store.dispatchEvent(new Event("input"));
  };
  return store;
}
