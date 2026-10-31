---
title: Explore
toc: false
---

```js
import { createFollowedStore } from "./lib/followed.js";
import { createMyPapers, createRulesStore, matches, normalizeRule } from "./lib/rules.js";
import { watchButton } from "./components/watchButton.js";
import { researchRule, startTopicRefresh, thresholdFor, topicPreview, topicRule } from "./lib/researchTopics.js";
import { createResearchStore, createVectorCache, programFingerprint, pruneVectorCache, rankByMaxSimilarity, researchCuts, researchLabel, researchVectors, splitAbstracts } from "./lib/myResearch.js";
import { myResearch, pauseResearchForLink, researchPausedToast } from "./components/myResearch.js";
import { topicWatch } from "./components/topicWatch.js";
import { rankBySimilarity, relatedPapers, relevanceCounts, relevanceCuts } from "./lib/search.js";
import { createPaperRoute } from "./components/paperRoute.js";
import { paperPanel } from "./components/paperPanel.js";
import { followToggles } from "./components/followToggles.js";
const scoreRampDomain = (papers, cutsOf = relevanceCuts) => {
  const scores = papers.map((d) => d.score).filter((s) => s != null);
  return scores.length ? [cutsOf(scores).good, Math.max(...scores)] : null;
};
import { getEmbedder } from "./lib/embedder.js";
import { keywordMatches, mapMatches, readyAnnouncement, searchMode, searchStatusLine, watchModel, whenIdle } from "./lib/searchStatus.js";
import { applyProjection } from "./lib/projections.js";
import { createAligner } from "./lib/procrustes.js";
import { createQueryMarkerSettings, queryAnnouncement, queryMarkers } from "./lib/placeQuery.js";
import { queryMarkerControl } from "./components/queryMarkerControl.js";
import { addSearchClear } from "./components/searchClear.js";
import { trackListFocus } from "./lib/listFocus.js";
import { createAnimationSettings, mapAnimation } from "./lib/animationSettings.js";
import { animationControl } from "./components/animationControl.js";
import { createNeighbourIndex, createNeighbourSettings, shouldUnpinOnEscape } from "./lib/neighbours.js";
import { createLazyEmbeddings } from "./lib/lazyEmbeddings.js";
import { neighboursControl, neighboursPanel } from "./components/neighbours.js";
import { applyFilters, filterAccessor, typeNames } from "./lib/filters.js";
import { clusterLabels } from "./lib/clusters.js";
import { facetStrip } from "./widgets/facetStrip.js";
import { BrushableScatterPlot, topCategories } from "./widgets/brushableScatterPlot.js";
import { bindMyPapersBadge } from "./components/badge.js";
import { relevanceControl } from "./widgets/relevanceControl.js";
import { themeControl } from "./components/themeControl.js";
import { PapersList, conferenceLink, paperScore } from "./widgets/papersList.js";
import { authorUrl } from "./lib/authors.js";
import { addWithUndo, planAdd, selectionReason } from "./lib/selection.js";
import { showToast } from "./components/toast.js";
import { renderAddBar } from "./components/addBar.js";
import { renderChips } from "./components/chips.js";
import { startExploreUrl } from "./components/exploreUrl.js";
import { PHONE_QUERY, SPLIT_MIN_HEIGHT, STACKED_QUERY, TWO_COLUMN_QUERY, matches as matchesMedia } from "./lib/breakpoints.js";
import { watchSplitMap } from "./lib/splitLayout.js";
import { createPaperLabelSettings, emphasisIds } from "./lib/paperLabels.js";
import { controlsHeight, mapSize, watchPhoneSplit, watchStickyViewport } from "./lib/mapSize.js";
import { stickyListHeader } from "./lib/stickyList.js";
import { conferenceZone } from "./lib/time.js";
// Explicit, so the page uses the same d3 as the widgets (node_modules) instead of a second copy
// from npm (#124: ~100 KB and 35 requests on the first load)
import * as d3 from "d3";
```

```js
const conference = FileAttachment("data/conference.json").json();
const papers = FileAttachment("data/papers.json").json();
const projections = FileAttachment("data/projections.json").json();
// Not fetched yet: the embeddings load right after the first render or on demand (#124)
const embeddingsFile = FileAttachment("data/embeddings.bin");
```

```js
const embeddings = createLazyEmbeddings(() => embeddingsFile.arrayBuffer(), papers.length);
```

```js
const tz = conference.timezone;
// "ET" (config timezoneLabel, else from the zone; DESIGN.md → Vocabulary)
const tzLabel = conferenceZone(conference);
// My Papers = papers added by hand ∪ papers of watched people/institutions − exceptions (#5)
const followedStore = createFollowedStore(conference.id);
const rulesStore = createRulesStore(conference.id);
const store = createMyPapers({ followed: followedStore, rules: rulesStore, papers });
const followed = Generators.input(store);
invalidation.then(bindMyPapersBadge(store));
const rulesState = Generators.input(rulesStore);
// "My research" (#27): pasted abstracts, kept in this browser only
const researchStore = createResearchStore(conference.id);
const research = Generators.input(researchStore);
// Abstract vectors across visits, so neither ranking nor research topics re-embed them
const researchVectorCache = createVectorCache(conference.id);
const typeLabels = typeNames(papers, conference.typeNames);
// Topic clusters (#25) exist only if the pipeline computed them for this conference
const hasTopics = papers.some((p) => p.clusterLabel);
// The view (search, filters, options) lives in the URL (#92): read once here, kept in step below
const { start: urlStart, explicitQuery, sync: urlSync } = startExploreUrl({ papers, conference, typeLabels, hasTopics });
invalidation.then(urlSync.stop);
// A link that names a search shows that search, not your "My research" ranking (a toast offers Resume)
const researchPaused = pauseResearchForLink(researchStore, { explicitQuery });
```

<h1>${conference.name} Papers</h1>

<details class="lede"><summary>Explore ${filtered.length}/${papers.length} papers, workshops, posters and talks by meaning</summary><p>Search for a topic (e.g. ${exampleChips}), drag on the map to filter, and add the ones you want to attend to <a href="./my-papers">My Papers</a> (${followed.length}).</p></details>

<div id="explore" class="explore-layout" data-sw-after-render>
<div class="explore-side">
<section class="explore-controls">
  <div class="search-row">${queryInput}${myResearchInput}${topicWatchInput ?? ""}</div>
  <p id="search-status" class="search-status" hidden></p>
  <p id="search-live" class="sr-only" aria-live="polite"></p>
  ${facetsInput}
  ${chipsRow}
  ${relevanceInput ?? ""}
  <div class="map-actions"><span id="map-caption" class="map-caption"></span>${mapToggle}${selectRegionButton}</div>
</section>
<section id="explore-map" class="explore-map">
  <div class="map-stage">
  ${mapInput}
  <p id="query-live" class="sr-only" aria-live="polite"></p>
  <div class="map-controls">${colorByInput}${topicLabelsInput ?? ""}${paperLabelsInput}<span class="map-legend-note"><span class="ring" aria-hidden="true"></span> In My Papers</span>${overlayNote}${keywordNote}</div>
  ${neighboursCard}
  </div>
</section>
</div>
<section class="explore-list">
  ${addBar}
  ${papersList}
</section>
${paperDetail}
<aside id="filters-panel" class="filters-panel" aria-label="Map options">
  <div class="filters-header"><h2>Map options</h2>${filtersClose}</div>
  <h3>Dimensionality reduction</h3>
  ${projectionInput}
  <h3>Animation</h3>
  ${animationInput}
  <h3>Appearance</h3>
  ${themeControl()}
  ${queryMarkerInput}
  <h3>Advanced</h3>
  ${neighboursInput}
  ${advancedDr}
  <details class="navio-summary">
    <summary>Summary of the matching papers (navio)</summary>
    ${navioSummary}
  </details>
  ${filtersDone}
</aside>
</div>

```js
// Map view settings (projection) live in an offcanvas sidebar on the right, opened from
// the navbar's Options button; closed by default. Filters are the facet strip (#35).
const layout = document.getElementById("explore");
const filtersOpenKey = `papersNavigator:${conference.id}:filtersOpen`;
const filtersToggle = document.querySelector(".navbar-options");
filtersToggle.hidden = false;
invalidation.then(() => (filtersToggle.hidden = true));
const filtersClose = html`<button class="filters-close" aria-label="Close options">Close ✕</button>`;
const filtersDone = html`<button class="filters-done">Done</button>`;
const setFiltersOpen = (open) => {
  layout.classList.toggle("filters-open", open);
  filtersToggle.setAttribute("aria-expanded", String(open));
  try {
    localStorage.setItem(filtersOpenKey, JSON.stringify(open));
  } catch {}
};
filtersToggle.onclick = () => setFiltersOpen(!layout.classList.contains("filters-open"));
filtersClose.onclick = filtersDone.onclick = () => setFiltersOpen(false);
// Tapping outside the sidebar closes it (the only way out besides the buttons on a phone)
const closeOnOutsideClick = (event) => {
  const panel = document.getElementById("filters-panel");
  if (layout.classList.contains("filters-open") && event.target.isConnected && !panel.contains(event.target) && !filtersToggle.contains(event.target))
    setFiltersOpen(false);
};
document.addEventListener("click", closeOnOutsideClick);
invalidation.then(() => document.removeEventListener("click", closeOnOutsideClick));
// An open paper details panel takes Esc first
// Esc closes the topmost layer only: preventDefault tells later handlers (the map's neighbour
// pin, #102) that this Esc was used
const closeOnEscape = (event) => {
  if (event.key !== "Escape" || document.querySelector(".paper-detail") || !layout.classList.contains("filters-open")) return;
  setFiltersOpen(false);
  event.preventDefault();
};
document.addEventListener("keydown", closeOnEscape);
invalidation.then(() => document.removeEventListener("keydown", closeOnEscape));
let savedOpen = null;
try {
  savedOpen = JSON.parse(localStorage.getItem(filtersOpenKey));
} catch {}
setFiltersOpen(savedOpen ?? false);
```

```js
const exampleChips = html`${(conference.exampleQueries ?? []).map((q, i) => {
  const chip = html`<button class="example-query">${q}</button>`;
  chip.onclick = () => {
    const input = queryInput.querySelector("input");
    input.value = q;
    queryInput.value = q;
    queryInput.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return i ? html`, ${chip}` : chip;
})}`;
```

```js
const queryPlaceholder = "Describe what you are looking for, e.g. LLM agents for scientific visualization";
// Ranking by My research (#27) when the page left off: no default search in the box
const queryInput = Inputs.text({ placeholder: queryPlaceholder, value: researchStore.value.active ? "" : urlStart.query });
// Search is always live (#12), debounced so typing doesn't recompute on every keystroke
const query = Generators.observe((notify) => {
  let timer;
  notify(queryInput.value);
  const onInput = () => {
    clearTimeout(timer);
    // Clearing needs no debounce (and "Rank the program" clears it in the same tick as it
    // starts My research, so the ranking is computed once)
    if (!queryInput.value) return notify("");
    timer = setTimeout(() => notify(queryInput.value), 300);
  };
  queryInput.addEventListener("input", onInput);
  return () => {
    clearTimeout(timer);
    queryInput.removeEventListener("input", onInput);
  };
});
const setQuery = (text) => {
  queryInput.querySelector("input").value = text;
  queryInput.value = text;
  queryInput.dispatchEvent(new Event("input", { bubbles: true }));
};
const clearQuery = () => setQuery("");
// ✕ in the field clears the search (#128): no "Search" chip taking a row under the facets
addSearchClear(queryInput, clearQuery);
if (researchPaused) researchPausedToast(researchStore, { onResume: clearQuery });
// Typing a search leaves "My research": one ranking at a time, the last one asked for
queryInput.addEventListener("input", () => researchStore.value.active && researchStore.set({ active: false }));
```

```js
// "My research" (#27): rank the program against your own abstracts instead of a search
const researchAbstracts = research.active ? splitAbstracts(research.text) : [];
const researchMode = researchAbstracts.length > 0;
const rankingLabel = researchMode ? researchLabel(researchAbstracts.length) : query?.trim();
// Abstracts score higher against every paper than a short query: cuts from the distribution
const cutsFor = researchMode ? researchCuts : relevanceCuts;
```

```js
const myResearchInput = myResearch(
  {
    text: research.text,
    active: researchMode,
    ready: modelStatus === "ready",
    open: researchPanelState.open,
    savedTopics: () => rulesStore.value.rules.filter((r) => r.research).map((r) => ({ id: r.id, name: r.value })),
  },
  {
    onToggle: (open) => (researchPanelState.open = open),
    onRank: (text) => {
      clearQuery();
      researchStore.set({ text, active: true });
    },
    onForget: ({ topics }) => {
      // Undo puts back the abstracts and any research topic stopped with them
      const previous = researchStore.value;
      const stopped = rulesStore.value.rules.filter((r) => topics.includes(r.id));
      researchStore.forget();
      if (stopped.length) store.unwatch(topics);
      // Vectors go with the text: keep only those of abstracts saved research topics still use
      pruneVectorCache(researchVectorCache, rulesStore.value.rules);
      const what = stopped.length ? `Deleted your abstracts and stopped watching ${stopped.map((r) => `“${r.value}”`).join(", ")}` : "Deleted your abstracts from this device";
      showToast(what, {
        actionLabel: "Undo",
        onAction: () => {
          researchStore.set(previous);
          for (const rule of stopped) rulesStore.add(rule);
        },
      });
    },
  },
);
```

```js
// Load the language model right after the program is on screen (#120): its ~50 MB (model and
// runtime) would otherwise compete with the program's data on a slow connection. Until then
// the program is listed and a search shows keyword matches; a failed load is retried.
const modelStatus = Generators.observe((notify) => {
  // This cell waits for the data (named here); then a frame and an idle moment to render the list
  void [papers, projections];
  const rendered = new Promise((resolve) => requestAnimationFrame(() => whenIdle({ timeout: 1500 }).then(resolve)));
  // Then the embeddings (#124: ~750 KB, for neighbours, related papers and the ranking), then
  // the model; one after the other, so the small file isn't slowed down by the big one
  const start = rendered.then(() => embeddings.load().catch(() => {}));
  // The offline service worker registers now (observablehq.config.js), not during the first render
  start.then(() => dispatchEvent(new Event("papersnavigator:rendered")));
  return watchModel({ load: getEmbedder, notify, start });
});
```

```js
// Research topics (#24): re-evaluate their cached matches against this program in the
// background (Explore loads the model anyway, so Save-Data doesn't skip it here), once the
// model is ready so it never delays the first render (#120)
if (modelStatus === "ready") {
const topicRefresh = startTopicRefresh({
  rules: rulesStore,
  papers,
  loadEmbedder: getEmbedder,
  loadMatrix: async () => (await embeddings.load()).matrix,
  nav: {},
  vectorCache: researchVectorCache,
  onRefresh: ({ updated, ms }) => console.info(`Research topics re-evaluated in ${ms} ms (${updated} updated)`),
});
invalidation.then(() => topicRefresh.stop());
}
```

```js
// The search box works while the model loads (#120): keyword matches until it's ready. One
// line under it says what the list shows; screen readers hear when it's ranked by meaning.
const rankingMode = searchMode({ modelStatus, query, research: researchMode });
{
  const line = searchStatusLine({ modelStatus, mode: rankingMode, offline: navigator.onLine === false });
  const status = document.getElementById("search-status");
  const live = document.getElementById("search-live");
  if (status) {
    status.textContent = line ?? "";
    status.hidden = !line;
  }
  const said = readyAnnouncement(searchStatusState.model, modelStatus, rankingMode);
  if (said && live) live.textContent = said;
  searchStatusState.model = modelStatus;
}
```

```js
// The ranking's embeddings: the search, or one per abstract in My research (long abstracts are
// chunked); null without a ranking. They also place the "★ Your search" marker (#100).
const rankingVectors = await (async () => {
  if ((!researchMode && !query?.trim()) || modelStatus !== "ready") return null;
  // Ranking also needs the papers' embeddings: from here on embeddings.matrix is loaded
  await embeddings.load();
  const embed = await getEmbedder();
  if (researchMode) return researchVectors(embed, researchAbstracts, researchVectorCache);
  return [await embed(query)];
})();
```

```js
// Draw the map right away; scores (color/size) arrive once the model is ready.
const scored = (() => {
  if (!rankingVectors) return papers.map((p) => ({ ...p, score: null }));
  const { matrix } = embeddings;
  // My research: each paper scored by its closest abstract
  if (researchMode) return rankByMaxSimilarity(rankingVectors, matrix, papers);
  return rankBySimilarity(rankingVectors[0], matrix, papers);
})();
```

```js
// Facet strip (#35): crossfilter-style counts; facet ids are applyFilters' option names.
const sameSet = (a, b) => a.length === b.length && a.every((v) => b.includes(v));
// The program's usual order (no ranking): by time
const byTime = (list) => [...list].sort((a, b) => d3.ascending(a.start ?? a.sessionStart ?? "~", b.start ?? b.sessionStart ?? "~"));
const papersByTime = byTime(papers);
const defaultTypes = (conference.defaultTypes ?? []).filter((t) => typeLabels.has(t));
const mainTracks = (values) =>
  defaultTypes.length && sameSet(values, defaultTypes) ? (conference.defaultTypesLabel ?? "Main tracks") : null;
const facet = (id, label, options) => ({ id, label, accessor: filterAccessor(id), ...options });
const facetsInput = facetStrip(papers, {
  facets: [
    facet("types", "Type", { format: (v) => typeLabels.get(v) ?? v, search: false, summary: mainTracks }),
    facet("authors", "Author"),
    facet("affiliations", "Institution"),
    facet("keywords", "Keyword"),
    ...(hasTopics ? [facet("topics", "Topic")] : []),
    facet("sessions", "Session"),
  ],
  value: urlStart.facets,
  // Clear all goes back to the defaults (Main tracks), so the URL is clean again (#104)
  defaultValue: { types: defaultTypes },
  phoneQuery: PHONE_QUERY,
  // Watch a person or institution: a standing rule whose papers are always in My Papers (#6)
  rowAction: (facetId, value) => {
    const type = { authors: "author", affiliations: "affiliation" }[facetId];
    if (!type) return null;
    return watchButton({ type, value }, {
      rules: rulesStore,
      onWatch: (rule) => {
        const saved = store.watch(rule);
        // Papers this rule now keeps in My Papers (all types; not ones you removed by hand)
        const n = store.value.filter((d) => d.ruleIds.includes(saved.id)).length;
        showToast(`Watching ${value} · ${n} ${n === 1 ? "paper" : "papers"} (all types) now in My Papers`, {
          actionLabel: "Undo",
          onAction: () => store.unwatch([saved.id]),
        });
      },
      onUnwatch: (id) => {
        // Undo puts the same rule back (date, seen/new state and exceptions untouched)
        const rule = rulesStore.value.rules.find((r) => r.id === id);
        store.unwatch([id]);
        showToast(`Stopped watching ${value}`, { actionLabel: "Undo", onAction: () => rule && rulesStore.add(rule) });
      },
    });
  },
});
const facetSelection = Generators.input(facetsInput);
```

```js
const { types, authors, affiliations, keywords, sessions, topics = [] } = facetSelection;
```

```js
const filtered = applyFilters(scored, { types, authors, affiliations, keywords, sessions, topics });
```

```js
// Advanced (#28): live projections, re-clustering and quality metrics. The panel (and Druid)
// load only when its section is opened; it hands results back through these two values.
const liveProjections = Mutable({});
const liveClusters = Mutable(null);
// Reliability (#84): the latest scores; liveReliability bumps only when the map's own changed
const liveReliability = Mutable(null);
const reliabilityState = { latest: null };
const colorState = { value: urlStart.color }; // Color by survives its options changing (initially from the URL, #92)
const setLive = ({ projections, clusters, reliability }) => {
  if (projections !== liveProjections.value) liveProjections.value = projections;
  if (clusters !== liveClusters.value) {
    liveClusters.value = clusters;
    if (clusters) colorState.value = "liveCluster";
  }
  if (reliability !== reliabilityState.latest) {
    const changed = mapState.panel.reliabilityChanged(reliabilityState.latest, reliability, mapState.projection);
    reliabilityState.latest = reliability;
    if (changed) liveReliability.value = reliability;
  }
};
const formatProjection = (d) => (conference.projections.includes(d) ? d.toUpperCase() : d);
// map: the map on screen (the next one animates from it, #82); shown: its projection key
const mapState = { projection: conference.projections[0], panel: null, map: null, shown: null, reset: 0, aligner: createAligner() };
// Map animation (#82), remembered per browser; only "Align projections" moves points by itself
const animationStore = createAnimationSettings();
// Nearest neighbours (#102): settings per device; the pin survives redraws (not in the URL:
// it's a passing look, and ?paper= already shares a paper)
const neighbourStore = createNeighbourSettings();
// No neighbours for the moment between the first render and the embeddings arriving (#124)
const neighbourIndex = createNeighbourIndex(() => embeddings.matrix, papers.map((p) => p.id), { dims: () => embeddings.dims });
const neighbourState = { pinned: null };
// Short paper labels on the map (#99): per device, on by default except on phones (too dense)
const paperLabelStore = createPaperLabelSettings({ phone: matchesMedia(PHONE_QUERY) });
// "★ Your search" on the map (#100), per device; Map options → Appearance can hide it
const queryMarkerStore = createQueryMarkerSettings();
```

```js
// Options controls bound to their stores; built once, unbound when the cell is invalidated
const animationInput = animationControl(animationStore, { hasTopics });
const neighboursInput = neighboursControl(neighbourStore);
const queryMarkerInput = queryMarkerControl(queryMarkerStore);
invalidation.then(() => {
  animationInput.dispose();
  neighboursInput.dispose();
  queryMarkerInput.dispose();
});
```

```js
const alignProjections = Generators.observe((notify) => {
  let last = animationStore.value.align;
  notify(last);
  const update = () => animationStore.value.align !== last && notify((last = animationStore.value.align));
  animationStore.addEventListener("input", update);
  return () => animationStore.removeEventListener("input", update);
});
```

```js
const advancedDr = html`<details class="advanced-dr"><summary>Live projections, clusters and quality</summary></details>`;
advancedDr.addEventListener("toggle", async () => {
  if (!advancedDr.open || advancedDr.dataset.loaded) return;
  advancedDr.dataset.loaded = "true";
  const loading = html`<p class="muted">Loading…</p>`;
  advancedDr.append(loading);
  let advancedPanel, matrix, dims;
  try {
    [{ advancedPanel }, { matrix, dims }] = await Promise.all([import("./components/advancedPanel.js"), embeddings.load()]);
  } catch {
    // Offline before the embeddings arrived: try again on the next open
    delete advancedDr.dataset.loaded;
    loading.remove();
    return;
  }
  const panel = advancedPanel({
    papers,
    embeddings: matrix,
    dims,
    projections,
    currentProjection: () => mapState.projection,
    format: formatProjection,
    clusterDefaults: conference.clusters,
  });
  panel.addEventListener("input", () => setLive(panel.value));
  mapState.panel = panel;
  loading.replaceWith(panel);
});
```

```js
// Re-runs only when a projection is computed (the panel keeps the same object otherwise),
// so the newly computed one is shown; clustering never changes the selection
const projectionInput = Inputs.select([...conference.projections, ...Object.keys(liveProjections)], {
  label: "Projection",
  format: formatProjection,
  value: Object.keys(liveProjections).at(-1) ?? urlStart.projection,
});
const projection = Generators.input(projectionInput);
```

```js
liveReliability; // the map's reliability (#84) changed: {id: score} for its projection, or null
const reliabilityScores = reliabilityState.latest?.scores[projection] ?? null;
const overlayNote = reliabilityScores && reliabilityState.latest.overlay ? html`<span class="map-legend-note"><span class="overlay-swatch" aria-hidden="true"></span> Shaded: least reliable areas</span>` : "";
```

```js
// A search before the model is ready (#120, #125): its keyword matches, kept in this order by
// the list and highlighted on the map, with a note under it instead of the similarity ramp
const keywordMatched = rankingMode === "keyword" ? keywordMatches(papersByTime, query) : [];
const mapMatch = mapMatches({ mode: rankingMode, matches: keywordMatched });
// The dot is the matches' color only while they are drawn in viz-neutral (no Color by)
const keywordNote = mapMatch.note ? html`<span class="map-legend-note keyword-note">${colorBy === "score" ? html`<span class="match-dot" aria-hidden="true"></span>` : ""} ${mapMatch.note}</span>` : "";
```

```js
const colorOptions = new Map([["Similarity", "score"], ["Type", "typeLabel"], ["Room", "room"], ["Session", "sessionName"], ...(hasTopics ? [["Topic", "clusterLabel"]] : []), ...(liveClusters ? [["Cluster (live)", "liveCluster"]] : []), ...(reliabilityScores ? [["Reliability", "reliability"]] : [])]);
const colorByInput = Inputs.select(colorOptions, {
  label: "Color by",
  value: [...colorOptions.values()].includes(colorState.value) ? colorState.value : undefined,
});
colorByInput.addEventListener("input", () => (colorState.value = colorByInput.value));
const colorBy = Generators.input(colorByInput);
```

```js
// Topic labels at the cluster centers (#25), on by default
const topicLabelsInput = hasTopics ? Inputs.toggle({ label: "Topic labels", value: urlStart.labels }) : null;
const showTopics = topicLabelsInput ? Generators.input(topicLabelsInput) : false;
// Paper labels (#99): toggled live on the map on screen (no redraw, so the brush stays)
const paperLabelsInput = Inputs.toggle({ label: "Paper labels", value: paperLabelStore.value });
paperLabelsInput.addEventListener("input", () => paperLabelStore.set(paperLabelsInput.value));
```

```js
// Phones: the map shows after search and filters (John wants the visualization on his phone);
// "Hide map" tucks it away. It never hijacks scrolling: "Select region" turns brushing on for
// one selection, then off again.
const mapToggle = html`<button class="btn-secondary map-toggle" aria-controls="explore-map" aria-expanded="true">Hide map</button>`;
const setMapHidden = (hidden) => {
  layout.classList.toggle("hide-map", hidden);
  mapToggle.textContent = hidden ? "Show map" : "Hide map";
  mapToggle.setAttribute("aria-expanded", String(!hidden));
  urlSync.update({ map: !hidden });
};
mapToggle.onclick = () => setMapHidden(!layout.classList.contains("hide-map"));
setMapHidden(!urlSync.state.map);
const selectRegionButton = html`<button class="btn-secondary select-region" aria-pressed="false">Select region</button>`;
const setSelectMode = (on) => {
  layout.classList.toggle("select-mode", on);
  selectRegionButton.setAttribute("aria-pressed", String(on));
  selectRegionButton.textContent = on ? "Drag on the map to select…" : "Select region";
};
selectRegionButton.onclick = () => setSelectMode(!layout.classList.contains("select-mode"));
```

```js
// Leave "Select region" mode after one selection (the brush changed)
if (layout.classList.contains("select-mode") && map.brushed.length < positioned.length) setSelectMode(false);
```

```js
// Measured on the controls (same column, always visible): hiding the map on phones must not
// change the width, which would redraw the map and drop its selection
const mapWidth = Generators.width(document.querySelector(".explore-controls"));
// Desktop: the map is sticky, so it fits the viewport height too (null on stacked layouts). The
// controls' height is read when the map is built anyway (below), never watched: a chip appearing
// mid-drag must not rebuild the map and drop the brush (#143 review)
const stickyViewport = Generators.observe((notify) => watchStickyViewport(notify, { query: STACKED_QUERY }));
// Phones tall enough (#144): the map sticks in the top half, the list scrolls below (null otherwise)
const phoneSplit = Generators.observe((notify) => watchPhoneSplit(notify, { query: PHONE_QUERY, minHeight: SPLIT_MIN_HEIGHT }));
const scrollToPaper = (id) => {
  const row = document.querySelector(".explore-list .papers-list")?.showThrough?.(id);
  if (!row?.isConnected) return;
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.classList.add("flash");
  setTimeout(() => row.classList.remove("flash"), 1500);
};
// From the URL (#92); people picked in the link don't count as "just added" (no switch to All)
const relevanceState = { level: urlStart.level, people: urlStart.facets.authors.length + urlStart.facets.affiliations.length };
const topicWatchState = { open: false };
const listFocusState = { tracker: null, active: false }; // #136: the list → map focus, across map redraws
const researchPanelState = { open: false };
const listState = { key: null, shown: 100 };
const searchStatusState = { model: null }; // the previous model status, for "Ranked by meaning"
// The map reads its colors from CSS tokens when drawn: redraw when Appearance changes
const theme = Generators.observe((notify) => {
  // Auto follows the OS, so an OS switch also changes the colors
  const os = matchMedia("(prefers-color-scheme: dark)");
  const update = () => notify(`${document.documentElement.dataset.theme ?? "auto"}:${os.matches}`);
  update();
  addEventListener("themechange", update);
  os.addEventListener("change", update);
  return () => {
    removeEventListener("themechange", update);
    os.removeEventListener("change", update);
  };
});
// Bumped by the "Map region ✕" chip: redraws the map without its brush
const mapReset = Mutable(0);
const resetMap = () => {
  urlSync.update({ region: null });
  ++mapReset.value;
};
```

```js
mapReset; // redraw (clearing the brush) when the map-region chip is cleared
theme; // and when Appearance changes (colors come from the tokens)
// Live clusters (#28) are a per-paper field, so they color any projection
// (papers in no cluster: null, so they color as Other; the tooltip says None)
const withLiveClusters = (list) => (liveClusters ? list.map((p) => ({ ...p, liveCluster: liveClusters.byId[p.id], liveClusterName: liveClusters.byId[p.id] ?? "None" })) : list);
// Reliability (#84) too, once measured for this projection
const withReliability = (list) => (reliabilityScores ? list.map((p) => ({ ...p, reliability: reliabilityScores[p.id] })) : list);
// Every projection aligned (Procrustes) to the default one, so switching shows real moves (#82)
const coords = { ...projections, ...liveProjections }[projection];
const aligned = alignProjections ? mapState.aligner.align(coords, projections[conference.projections[0]]) : coords;
const positioned = withReliability(withLiveClusters(applyProjection(filtered, aligned).papers));
// Every paper as drawn on this projection: the distortion overlay and the details mini-map (#101)
const everyPaper = applyProjection(papers, aligned).papers;
mapState.everyPaper = everyPaper;
// Side column (#142): with the controls (search, facets, relevance) when both fit, else the map alone
const [mapW, mapH, sideFits] = mapSize(mapWidth, { viewportHeight: stickyViewport, controlsHeight: stickyViewport == null ? null : controlsHeight(document.querySelector(".explore-controls")), splitHeight: phoneSplit });
layout.classList.toggle("side-fits", Boolean(sideFits));
// Same projection (filters, search, colors, theme): animate entering/leaving points and keep
// the region selection, unless the map-region chip was cleared
const projectionKey = `${projection}:${alignProjections}`;
const projectionChanged = mapState.shown != null && mapState.shown !== projectionKey;
const previousMap = mapState.map;
// A region in a link (#92) is in the default projection's coordinates, or an aligned one's
const regionFrame = projection === conference.projections[0] || alignProjections ? projection : `${projection}:unaligned`;
const urlRegion = !previousMap && urlSync.state.region?.projection === regionFrame ? urlSync.state.region : null;
const keptBrush = (!projectionChanged && mapReset === mapState.reset ? previousMap?.brush() : null) ?? urlRegion;
mapState.projection = projection;
mapState.panel?.refreshCurrent();
const hasQuery = rankingMode === "semantic";
// Similarity only exists after a search; until then one neutral color
const colorField = colorBy === "score" && !hasQuery ? null : colorBy;
const colorTitles = { score: "Similarity", typeLabel: "Type", room: "Room", sessionName: "Session", clusterLabel: "Topic", liveCluster: "Cluster (live)" };
const mapRun = { superseded: false };
invalidation.then(() => (mapRun.superseded = true));
const mapInput = await BrushableScatterPlot(positioned, {
  color: colorField,
  colorType: colorBy === "score" && hasQuery ? "quantitative" : "nominal",
  colorTitle: colorTitles[colorField],
  // Size only echoes similarity (DESIGN.md: never a second variable)
  size: hasQuery ? "score" : null,
  // John: three times the default upper bound (80 → 240) so similarity reads at a glance
  sizeRange: [12, 240],
  // Hues for the 3 largest categories of the whole program, so filtering never repaints them
  categories: colorField && colorField !== "score" ? topCategories(withLiveClusters(papers), colorField) : undefined,
  // Read once (not reactive); later changes go through the "mine" signal below
  ringIds: store.value.map((d) => d.id),
  // Largest topics first: a label that would overlap a bigger topic's is left out
  labels: showTopics ? clusterLabels(positioned) : null,
  labelSize: mapWidth < 500 ? 13 : 15,
  // The similarity ramp's light end starts at the Good cut (cuts depend only on the search)
  scoreDomain: hasQuery ? scoreRampDomain(scored, cutsFor) : null,
  // DESIGN.md → Legend: the ramp says "less / more similar", not scores
  legendLabels: ["less similar", "more similar"],
  // Readable labels and a percentage instead of raw field names and a long float
  tooltip: [
    { field: "shortLabel", title: "Label" },
    { field: "title", title: "Title" },
    { field: "authorNames", title: "Authors" },
    { field: "typeLabel", title: "Type" },
    { field: "sessionName", title: "Session" },
    ...(hasTopics ? [{ field: "clusterLabel", title: "Topic" }] : []),
    ...(liveClusters ? [{ field: "liveClusterName", title: "Cluster (live)" }] : []),
    ...(hasQuery ? [{ field: "score", title: "Similarity", format: ".0%" }] : []),
    ...(reliabilityScores ? [{ field: "reliability", title: "Reliability", format: ".2f" }] : []),
  ],
  width: mapW,
  height: mapH,
  // Color by: Reliability and the distortion overlay (#84; the Advanced panel builds them)
  ...mapState.panel?.reliabilityMapOptions({ reliability: reliabilityState.latest, scores: reliabilityScores, colorBy, shown: positioned, everyPaper, cacheKey: [projection, alignProjections], width: mapW, height: mapH }),
  // Phones: the caption sits beside Hide map / Select region instead (#132), one row less
  title: matchesMedia(PHONE_QUERY) ? undefined : `${positioned.length} papers${hasQuery ? ` by similarity to ${researchMode ? rankingLabel : `“${query}”`}` : ""}`,
  from: previousMap,
  animate: mapAnimation(animationStore.value, { projectionChanged, stageOf: hasTopics ? (d) => d.cluster : null }),
  brush: keptBrush,
  // Nearest neighbours (#102) among the papers on the map; settings follow the store live
  neighbours: ((shownIds) => ({ similar: (id, k) => neighbourIndex.nearest(id, k, shownIds), ...neighbourStore.value, pinned: neighbourState.pinned }))(new Set(positioned.map((p) => p.id))),
  // Where the search / My research lands (#100), placed below with placeQuery
  query: true,
  // Short paper labels (#99); on/off and the emphasized papers update live (cells below)
  paperLabels: { label: "shortLabel", enabled: paperLabelStore.value },
  // Keyword matches before the model is ready (#125), highlighted with highlightMatches below
  matches: true,
  // The paper the list is showing gets a ring (#136), set with focusPaper below
  focus: true,
});
// A run superseded while the map was being built never shows it: stop its motion and keep
// mapState pointing at the map on screen
if (mapRun.superseded) mapInput.stop();
else Object.assign(mapState, { map: mapInput, shown: projectionKey, reset: mapReset });
// The phone caption (#132): the map's title, short enough to share the row with its buttons
if (!mapRun.superseded) document.getElementById("map-caption").textContent = `${positioned.length} papers${hasQuery ? ` · ${researchMode ? "My research" : query}` : ""}`;
const map = Generators.input(mapInput);
```

```js
const showQueryMarker = Generators.input(queryMarkerStore);
```

```js
// "★ Your search" / "★ My research" (#100): placed among the papers on the map (drawn, aligned
// coordinates) by their nearest neighbours in the embedding, all in the browser
// Faded when few similar papers are visible (best visible match under the Weak cut). Screen
// readers hear where it lands from the aria-live line by the map (never in the URL).
{
  const markers = queryMarkers({ vectors: rankingVectors, matrix: embeddings.matrix, papers, shown: positioned, query: query ?? "", research: researchMode, weakCut: rankingVectors ? cutsFor(scored.map((d) => d.score)).weak : -Infinity });
  mapInput.placeQuery(showQueryMarker ? markers : []);
  // Paper labels (#99) always show (where they fit) for the query's nearest paper and the top
  // Strong matches
  mapInput.paperLabels?.update({ emphasis: emphasisIds(positioned, { strongCut: hasQuery ? cutsFor(scored.map((d) => d.score)).strong : null, markers }) });
  const live = document.getElementById("query-live");
  if (live && live.textContent !== queryAnnouncement(markers)) live.textContent = queryAnnouncement(markers);
}
```

```js
// Paper labels (#99) on/off follows the store on the map on screen
{
  const onPaperLabels = () => mapInput.paperLabels?.update({ enabled: paperLabelStore.value });
  paperLabelStore.addEventListener("input", onPaperLabels);
  invalidation.then(() => paperLabelStore.removeEventListener("input", onPaperLabels));
}
```

```js
// Nearest neighbours (#102): the card lists the pinned paper's neighbours, floating over the
// sticky map's corner on desktop (#114) and in the phone split (#144), else under the map
const neighboursCard = neighboursPanel({
  // Floating over the map wherever the map stays in view: desktop, and the phone split (#144)
  floating: ((desktop) => ({ get matches() { return desktop.matches || layout.classList.contains("phone-split"); }, addEventListener: (type, f) => desktop.addEventListener(type, f) }))(matchMedia(TWO_COLUMN_QUERY)),
  paperOf: (id) => papers.find((p) => p.id === id),
  href: (p) => paperRoute.href(p.shortId ?? p.id),
  onOpen: (p) => openPaper(p.shortId ?? p.id),
  onClose: () => mapState.map?.unpinNeighbours(),
});
invalidation.then(neighboursCard.dispose);
```

```js
// Wire the map on screen to the card, the settings, Esc and keyboard focus on paper rows.
// A click (or phone tap) on a point pins its neighbours and scrolls the list to that same paper:
// one source (the nearest point), so the card and the list never disagree in dense areas. A
// click also re-renders the list, so wait a frame and use the list that is actually on the page.
{
  // The floating card fits the map (#114): height caps, collapsed by default on short maps
  neighboursCard.fit(mapH);
  const sync = (event) => {
    neighbourState.pinned = mapInput.neighbours.pinned;
    neighboursCard.show(mapInput.neighbours);
    if (event?.detail.action === "pin") requestAnimationFrame(() => scrollToPaper(event.detail.pinned));
  };
  sync();
  mapInput.addEventListener("neighbours", sync);
  const onSettings = () => mapInput.neighbourSettings(neighbourStore.value);
  neighbourStore.addEventListener("input", onSettings);
  // Esc unpins, unless an open details panel or the Options drawer takes it first
  const onKey = (event) => shouldUnpinOnEscape(event, { detailOpen: Boolean(document.querySelector(".paper-detail")) }) && mapInput.unpinNeighbours();
  document.addEventListener("keydown", onKey);
  // Keyboard (and focus) on a paper row previews its neighbours
  const list = document.querySelector(".explore-list");
  const onFocus = (event) => neighbourStore.value.enabled && event.target.matches?.(":focus-visible") && mapInput.previewNeighbours(event.target.closest?.("[data-paper-id]")?.dataset.paperId ?? null);
  const onBlur = (event) => !list.contains(event.relatedTarget) && mapInput.previewNeighbours(null);
  list?.addEventListener("focusin", onFocus);
  list?.addEventListener("focusout", onBlur);
  invalidation.then(() => {
    neighbourStore.removeEventListener("input", onSettings);
    document.removeEventListener("keydown", onKey);
    list?.removeEventListener("focusin", onFocus);
    list?.removeEventListener("focusout", onBlur);
  });
}
```

```js
// Explore's view → URL (#92): replaceState (no history entry per change); ?paper= is kept
map; // the map region changed
urlSync.update({
  query,
  level: relevanceInput ? relevance : relevanceState.level,
  facets: facetSelection,
  color: colorBy,
  projection,
  labels: topicLabelsInput ? showTopics : true,
  region: ((r) => r && { projection: regionFrame, ...r })(mapInput.brush()),
});
```

```js
// Points below the chosen relevance level are drawn in viz-dim, live (no redraw)
// null = no cut ("All"): cosine scores can be negative, so 0 would dim some papers
mapInput.view.signal("levelCut", hasQuery && relevance !== "all" ? cuts[relevance] : null).runAsync();
// Rings follow My Papers live without redrawing the map (a redraw would drop the brush)
mapInput.view.signal("mine", followed.map((d) => d.id)).runAsync();
// Keyword matches (#125): the rest viz-dim, like papers below the relevance level
mapInput.highlightMatches(mapMatch.ids);
```

```js
// Relevance (#9): Strong / Good / All with counts, one threshold for list, Add and map region.
// Cuts come from the search results alone (not facets or map region), so "Good" means the same
// thing whatever you filter; counts are of the papers in view.
// Adding a person or institution during a search switches to All, so all their papers show
// (decided in #1); the choice survives re-renders.
const peopleCount = authors.length + affiliations.length;
if (hasQuery && peopleCount > relevanceState.people && relevanceState.level !== "all") {
  relevanceState.level = "all";
  showToast("Showing all matching papers by the researchers and institutions you picked");
}
relevanceState.people = peopleCount;
const cuts = cutsFor(scored.map((d) => d.score));
const relevanceInput = hasQuery
  ? relevanceControl(relevanceCounts(map.brushed, cuts), { value: relevanceState.level })
  : null;
const relevance = relevanceInput ? Generators.input(relevanceInput) : "all";
```

```js
if (relevanceInput) relevanceState.level = relevance;
// Before the model is ready, a search keeps its keyword matches (#120), in this order
const keywordOrder = rankingMode === "keyword" ? new Map(keywordMatched.map((p, i) => [p.id, i])) : null;
const inRange = keywordOrder
  ? map.brushed.filter((d) => keywordOrder.has(d.id))
  : relevance === "all" ? map.brushed : map.brushed.filter((d) => d.score >= cuts[relevance]);
// The list is exactly the matching papers: query, relevance, facets and map region
const selected = inRange;
```

```js
// Research topics (#24): watch this search as a rule; matches are computed now and cached.
// Its own cell: it follows My Papers and the rules without re-running the list.
// My research: the rule saved from these same abstracts, whatever its name
const watchedTopic = !hasQuery
  ? null
  : researchMode
    ? rulesState.rules.find((r) => r.research && sameSet(r.research, researchAbstracts))
    : rulesState.rules.find((r) => r.id === normalizeRule({ type: "topic", value: query })?.id);
const inMyPapers = new Set(followed.map((d) => d.id));
const topicWatchInput = hasQuery
  ? topicWatch(
      {
        query: rankingLabel,
        research: researchMode ? { name: "My research" } : null,
        // Whole program, all types: a rule ignores facets and map region
        previews: Object.fromEntries(["strong", "good", "weak"].map((l) => [l, topicPreview(scored, thresholdFor(cuts, l), { inMyPapers, current: watchedTopic?.matches })])),
        current: watchedTopic,
        level: relevance,
        open: topicWatchState.open,
      },
      {
        onToggle: (open) => (topicWatchState.open = open),
        onSave: (level, name) => {
          const rule = researchMode ? researchRule(name, researchAbstracts, level, cuts, scored) : topicRule(query, level, cuts, scored);
          const previous = rulesState.rules.find((r) => r.id === normalizeRule(rule)?.id);
          // Evaluated against this program now: pages won't re-evaluate it until the program changes
          const saved = store.watch({ ...rule, program: programFingerprint(papers, embeddings.matrix) });
          const n = store.value.filter((d) => d.ruleIds.includes(saved.id)).length;
          showToast(`Watching research topic “${saved.value}” · ${n} ${n === 1 ? "paper" : "papers"} in My Papers`, {
            actionLabel: "Undo",
            onAction: () => (previous ? rulesStore.add(previous) : store.unwatch([saved.id])),
          });
        },
      },
    )
  : null;
```

```js
// Three ways into My Papers (DESIGN.md): this is "Add N", bound to exactly the listed papers
const regionActive = map.brushed.length < positioned.length;
const addReason = selectionReason({
  query: hasQuery ? rankingLabel : rankingMode === "keyword" ? query.trim() : null,
  authors,
  affiliations,
  keywords,
  sessions,
  topics,
  types,
  defaultTypes,
  typeLabel: (t) => typeLabels.get(t) ?? t,
  region: regionActive,
});
// With nothing narrowing the list, one click would add the whole program: ask to narrow first
const narrowed =
  rankingMode !== "none" || regionActive || authors.length || affiliations.length || keywords.length || sessions.length || topics.length || !sameSet(types, defaultTypes);
const addBar = renderAddBar(planAdd(selected, new Set(followed.map((d) => d.id))), {
  disabledHint: narrowed ? null : "Search, filter or select a map region to add papers in bulk",
  onTop: listHeader.scrollToTop,
  onAdd: (fresh) => {
    const undo = addWithUndo(store, fresh, addReason);
    showToast(`Added ${fresh.length} to My Papers`, { actionLabel: "Undo", onAction: undo });
  },
});
const levelName = { strong: "Strong", good: "Good", weak: "Weak", all: "All" }[relevance];
const leaveResearch = () => researchStore.value.active && researchStore.set({ active: false });
const chips = [
  hasQuery && researchMode && { label: rankingLabel, value: `${levelName} matches`, onClear: leaveResearch },
  regionActive && { label: "Map region", value: "selected area", onClear: resetMap },
].filter(Boolean);
// Clear all empties the search (like the field's ✕; the default search is for first visits only)
// and the map region; the facet strip's Clear all goes back to Main tracks. URL: just "q=" (#104)
const chipsRow = renderChips(chips, {
  onClearAll:
    chips.length > 1
      ? () => {
          leaveResearch();
          clearQuery();
          resetMap();
        }
      : null,
});
```

```js
// The add bar is the list's sticky header (#142): "↑ Top" once scrolled, and its height for
// scroll-padding, so rows scrolled into view stay clear of it
const listHeader = stickyListHeader(document.querySelector(".explore-list"), {
  offset: () => parseFloat(getComputedStyle(document.querySelector(".explore-list .add-bar") ?? document.body).top) || 0,
});
invalidation.then(listHeader.stop);
```

```js
addBar; // re-rendered: measure the new bar
listHeader.refresh();
```

```js
// Phone split (#144): the heights the sticky map section and the list header need, re-measured
// with each map
mapInput;
layout.classList.toggle("phone-split", phoneSplit != null);
if (phoneSplit != null) {
  const stop = watchSplitMap(document.getElementById("explore-map"), { layout, nav: () => document.getElementById("observablehq-header")?.getBoundingClientRect().bottom ?? 0 });
  invalidation.then(stop);
}
```

```js
// Brushing and linking (#136): scrolling or pointing at the list rings that paper on the map.
// Pointing at a row also previews its neighbours (#140).
// Wherever the map stays in view beside or above the list: desktop and the phone split (#144)
{
  const list = document.querySelector(".explore-list");
  const mark = (id) => {
    for (const row of list.querySelectorAll(".in-focus")) row.classList.remove("in-focus");
    if (id != null) list.querySelector(`[data-paper-id="${CSS.escape(id)}"]`)?.classList.add("in-focus");
  };
  let pointerPreview = false; // a neighbour preview this cell set for a pointed row (#140)
  // A map redrawn mid-reading (projection, colors, filters) picks the focus up again at once
  const tracker = trackListFocus(list, (id, source) => {
    listFocusState.active = id != null;
    mapInput.focusPaper(id);
    mark(id);
    // Pointing at a row previews its neighbours, like hovering its dot (#140). Any other reason
    // clears only that preview (never the map's own hover or the keyboard's), and a row that
    // still has keyboard focus gets its preview back
    if (source === "pointer" && neighbourStore.value.enabled) {
      pointerPreview = true;
      mapInput.previewNeighbours(id);
    } else if (pointerPreview) {
      pointerPreview = false;
      const focused = document.activeElement;
      const keyboardRow = list.contains(focused) && focused.matches(":focus-visible") ? focused.closest("[data-paper-id]")?.dataset.paperId : null;
      mapInput.previewNeighbours(keyboardRow ?? null);
    }
  }, {
    // Wherever the map stays beside or above the list: desktop, and the phone split (#144), whose
    // reading line sits in the list's half
    enabled: () => !matchesMedia(STACKED_QUERY) || (layout.classList.contains("phone-split") && !layout.classList.contains("hide-map")),
    line: () => (layout.classList.contains("phone-split") ? 0.72 : 0.4),
    start: listFocusState.active,
  });
  if (!listFocusState.active) mark(null);
  listFocusState.tracker = tracker;
  // A click on the map pins a paper and scrolls the list to it: that paper keeps the ring
  const onPin = (event) => event.detail?.pinned != null && tracker.hold(event.detail.pinned);
  mapInput.addEventListener("neighbours", onPin);
  invalidation.then(() => {
    tracker.stop();
    mapInput.removeEventListener("neighbours", onPin);
  });
}
```

```js
// Phones: the chart ignores touches (so the page scrolls), but a tap on a point still shows its
// paper: find the nearest point to the tap, pin its neighbours (#102) and scroll the list to it;
// a tap on empty map space unpins
{
  const phone = matchMedia(PHONE_QUERY);
  const onTap = (event) => {
    if (!phone.matches || layout.classList.contains("select-mode")) return;
    // Taps on controls in the map area (Color by, labels) aren't point taps
    if (event.target.closest("button, select, input, label, a")) return;
    const paper = mapInput.pointAt(event.clientX, event.clientY);
    if (paper) mapInput.pinNeighbours(paper.id);
    else {
      // The chart takes no pointer events here, so the tap's target is the section: test the area
      const r = mapInput.getBoundingClientRect();
      if (event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom) mapInput.unpinNeighbours();
    }
  };
  const area = document.getElementById("explore-map");
  area.addEventListener("click", onTap);
  invalidation.then(() => area.removeEventListener("click", onTap));
}
```

```js
// navio (and the popper.js it brings) loads only when its section in Map options is open (#124)
const navioSummary = html`<div></div>`;
{
  const rows = selected.map(({ typeLabel, room, sessionName, score }) => ({ typeLabel, room, sessionName, score }));
  const draw = async () => {
    if (navioSummary.dataset.drawn) return;
    navioSummary.dataset.drawn = "true";
    // navio throws on an empty dataset (e.g. Strong with 0 matches)
    if (!rows.length) return navioSummary.replaceChildren(html`<p class="muted">No matching papers to summarize.</p>`);
    try {
      const { NavioWidget } = await import("navio/dist/navio.esm.js");
      navioSummary.replaceChildren(NavioWidget(rows, { height: 300 }));
    } catch {
      // Offline before navio was ever loaded: try again the next time the section opens
      delete navioSummary.dataset.drawn;
      navioSummary.replaceChildren(html`<p class="muted">Summary unavailable offline</p>`);
    }
  };
  // toggle doesn't bubble: listen in the capture phase
  const onToggle = (event) => event.target.matches?.("details.navio-summary") && event.target.open && draw();
  document.addEventListener("toggle", onToggle, true);
  invalidation.then(() => document.removeEventListener("toggle", onToggle, true));
  if (document.querySelector("details.navio-summary")?.open) draw();
}
```

```js
const ordered = hasQuery ? selected : keywordOrder ? [...selected].sort((a, b) => keywordOrder.get(a.id) - keywordOrder.get(b.id)) : byTime(selected);
// Keep "Show more" expansion while only My Papers changes; reset it when the matches change
const listKey = ordered.map((p) => p.id).join();
if (listKey !== listState.key) Object.assign(listState, { key: listKey, shown: 100 });
// reads the store, not `followed`, so adding/removing doesn't rebuild the list (see the next cell)
const listToggles = followToggles({
  inMyPapers: (id) => store.value.some((d) => d.id === id),
  onToggle: (p) => {
    if (store.value.some((d) => d.id === p.id)) {
      const undo = store.remove([p.id]);
      showToast("Removed from My Papers", { actionLabel: "Undo", onAction: undo });
    } else {
      const undo = addWithUndo(store, [p], hasQuery ? `★ ${rankingLabel}` : rankingMode === "keyword" ? `★ ${query.trim()}` : "★ Added by hand");
      showToast("Added to My Papers", { actionLabel: "Undo", onAction: undo });
    }
  },
});
const papersList = PapersList(ordered, {
  max: 100,
  shown: listState.shown,
  onShow: (n) => (listState.shown = n),
  tz,
  tzLabel,
  header: "",
  authorHref: authorUrl,
  // The title opens the paper's details here; "Conference page ↗" goes to the conference site
  details: { href: (p) => paperRoute.href(p.shortId ?? p.id), open: (p) => openPaper(p.shortId ?? p.id) },
  // DESIGN.md → Paper row: follow toggle and score on the right ("54%"); with several My
  // research abstracts, also the one the paper is closest to ("54% · abstract 2")
  actions: (p) => html`<span class="paper-actions">${listToggles.toggle(p)}${conferenceLink(p)}${paperScore(p, researchAbstracts.length > 1 ? `abstract ${p.abstractIndex + 1}` : "")}</span>`,
});
papersList.update = listToggles.update;
```

```js
// New list rows (relevance, region, filters) on the same map: put the #136 row marker back on
// the paper in focus, or let the reading line take over if it left the list
papersList;
requestAnimationFrame(() => listFocusState.tracker?.refresh());
```

```js
followed;
papersList.update();
```

```js
// Paper details (#22) and related papers (#23): ?paper=<shortId> is the source of truth
// (shared with My Papers, #70); Close goes back past related papers and returns focus
// beforeOpen: the paper's entry starts from the latest view (URL writes are debounced, #92)
const paperRoute = createPaperRoute({ resolveId: (key) => papers.find((p) => p.shortId === key || p.id === key)?.id, beforeOpen: urlSync.flush });
invalidation.then(() => paperRoute.stop());
const paperParam = Generators.input(paperRoute);
const openPaper = (key) => paperRoute.open(key);
```

```js
// Related papers need the embeddings (#124): an open paper asks for them if they haven't
// arrived yet (they load right after the first render) and its details redraw when they do
const embeddingMatrix = Generators.observe((notify) => {
  notify(embeddings.matrix);
  if (paperParam && !embeddings.matrix) embeddings.load().then((e) => notify(e.matrix), () => {});
});
```

```js
const paperDetail = paperPanel(paperParam, {
  papers,
  tz,
  tzLabel,
  store,
  route: paperRoute,
  related: (paper) => (embeddingMatrix ? relatedPapers(paper.id, embeddingMatrix, papers) : []),
  // The mini-map (#101) places papers as the map draws them (projection, alignment)
  mapRows: () => mapState.everyPaper ?? papers,
  animation: animationStore,
});
invalidation.then(paperDetail.dispose);
```

```js
followed;
paperDetail.update?.();
```

```js
// The projection (or alignment) changed with details open: the mini-map follows the map (#101)
paperDetail.refreshMiniMap(projectionKey);
```
