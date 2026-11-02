import { filterAccessor } from "../lib/filters.js";
import {
  FACET_KEYS,
  cleanHash,
  createUrlSync,
  decodeExploreState,
  encodeExploreState,
} from "../lib/urlState.js";

/**
 * Explore's view in the URL fragment (#92), read once at load. Returns `start` (the decoded state, with
 * this conference's defaults for anything absent or invalid), `explicitQuery` (the link names a
 * search, or no search when followed, which takes over from "My research") and `sync` (urlState's createUrlSync: pages call
 * `sync.update(patch)` when the view changes). Facet values a link names must exist in this
 * program; projections and Color by must be ones this conference has.
 */
export function startExploreUrl({
  papers,
  conference,
  typeLabels,
  hasTopics,
  win = globalThis.window,
}) {
  // Only Explore's keys and share-link keys, capped (unknown pairs are dropped from the URL)
  const params = cleanHash({ win });
  const defaults = {
    query: conference.defaultQuery ?? "",
    types: (conference.defaultTypes ?? []).filter((t) => typeLabels.has(t)),
    projection: conference.projections[0],
    projections: conference.projections,
  };
  const facetValues = Object.fromEntries(
    Object.keys(FACET_KEYS).map((id) => {
      const accessor = filterAccessor(id);
      return [id, new Set(papers.flatMap((p) => [accessor(p)].flat()))];
    }),
  );
  const start = decodeExploreState(params, {
    defaults,
    projections: conference.projections,
    colors: [
      "score",
      "typeLabel",
      "room",
      "sessionName",
      ...(hasTopics ? ["clusterLabel"] : []),
    ],
    facetValues,
  });
  const sync = createUrlSync({
    win,
    encode: (state) => encodeExploreState(state, defaults),
    state: start,
  });
  // A followed link with an empty q says "no search" (#154's topic/keyword links): it takes over
  // from My research too. Not a reload or Back/Forward: the page writes q= itself once the search
  // is cleared, and that must keep My research (#155 review)
  const navigation =
    win?.performance?.getEntriesByType?.("navigation")?.[0]?.type;
  const explicitQuery =
    Boolean(params.get("q")?.trim()) ||
    (params.has("q") && navigation === "navigate");
  return { start, explicitQuery, sync };
}
