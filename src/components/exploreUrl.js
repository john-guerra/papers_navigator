import { filterAccessor } from "../lib/filters.js";
import {
  FACET_KEYS,
  createUrlSync,
  hashParams,
  decodeExploreState,
  encodeExploreState,
} from "../lib/urlState.js";

/**
 * Explore's view in the URL fragment (#92), read once at load. Returns `start` (the decoded state, with
 * this conference's defaults for anything absent or invalid), `explicitQuery` (the link names a
 * search, which takes over from "My research") and `sync` (urlState's createUrlSync: pages call
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
  const params = hashParams(win.location.href);
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
  return { start, explicitQuery: Boolean(params.get("q")?.trim()), sync };
}
