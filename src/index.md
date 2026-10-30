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
import { myResearch } from "./components/myResearch.js";
import { topicWatch } from "./components/topicWatch.js";
import { rankBySimilarity, relatedPapers, relevanceCounts, relevanceCuts, toMatrix } from "./lib/search.js";
import { createPaperRoute } from "./components/paperRoute.js";
import { paperPanel } from "./components/paperPanel.js";
import { followToggles } from "./components/followToggles.js";
const scoreRampDomain = (papers, cutsOf = relevanceCuts) => {
  const scores = papers.map((d) => d.score).filter((s) => s != null);
  return scores.length ? [cutsOf(scores).good, Math.max(...scores)] : null;
};
import { getEmbedder } from "./lib/embedder.js";
import { applyProjection } from "./lib/projections.js";
import { applyFilters, filterAccessor, typeNames } from "./lib/filters.js";
import { clusterLabels } from "./lib/clusters.js";
import { facetStrip } from "./widgets/facetStrip.js";
import { BrushableScatterPlot, topCategories } from "./widgets/brushableScatterPlot.js";
import { bindMyPapersBadge } from "./components/badge.js";
import { relevanceControl } from "./widgets/relevanceControl.js";
import { themeControl } from "./components/themeControl.js";
import { PapersList } from "./widgets/papersList.js";
import { addWithUndo, planAdd, selectionReason } from "./lib/selection.js";
import { showToast } from "./components/toast.js";
import { renderAddBar } from "./components/addBar.js";
import { renderChips } from "./components/chips.js";
import { NavioWidget } from "navio/dist/navio.esm.js";
```

```js
const conference = FileAttachment("data/conference.json").json();
const papers = FileAttachment("data/papers.json").json();
const projections = FileAttachment("data/projections.json").json();
const embeddingsBuffer = FileAttachment("data/embeddings.bin").arrayBuffer();
```

```js
const tz = conference.timezone;
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
```

<h1>${conference.name} Papers</h1>

<p class="lede">Explore ${filtered.length}/${papers.length} papers, workshops, posters and talks by meaning. Search for a topic (e.g. ${exampleChips}), drag on the map to filter, and add the ones you want to attend to <a href="./my-papers">My Papers</a> (${followed.length}).</p>

<div id="explore" class="explore-layout">
<section class="explore-controls">
  <div class="search-row">${queryInput}${myResearchInput}</div>
  ${facetsInput}
  ${chipsRow}
  ${relevanceInput ?? ""}${topicWatchInput ?? ""}
  <div class="map-controls">${mapToggle}</div>
</section>
<section id="explore-map" class="explore-map">
  ${selectRegionButton}
  <p class="map-hint">Tap a point to see its paper. To select an area, tap <strong>Select region</strong>, then drag.</p>
  ${mapInput}
  <div class="map-controls">${colorByInput}${topicLabelsInput ?? ""}<span class="map-legend-note"><span class="ring" aria-hidden="true"></span> In My Papers</span></div>
</section>
<section class="explore-list">
  ${addBar}
  ${papersList}
</section>
${paperDetail}
<aside id="filters-panel" class="filters-panel" aria-label="Map options">
  <div class="filters-header"><h2>Map options</h2>${filtersClose}</div>
  <h3>Dimensionality reduction</h3>
  ${projectionInput}
  <h3>Appearance</h3>
  ${themeControl()}
  <h3>Advanced</h3>
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
const closeOnEscape = (event) => event.key === "Escape" && !document.querySelector(".paper-detail") && setFiltersOpen(false);
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
const queryInput = Inputs.text({ placeholder: queryPlaceholder, value: researchStore.value.active ? "" : (conference.defaultQuery ?? "") });
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
const clearQuery = () => {
  queryInput.querySelector("input").value = "";
  queryInput.value = "";
  queryInput.dispatchEvent(new Event("input", { bubbles: true }));
};
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
// Load the language model as soon as the page opens, not on the first search.
const modelStatus = Generators.observe((notify) => {
  notify("loading");
  getEmbedder().then(
    () => notify("ready"),
    (error) => notify(`error: ${error?.message ?? error}`),
  );
});
```

```js
// Research topics (#24): re-evaluate their cached matches against this program in the
// background (Explore loads the model anyway, so Save-Data doesn't skip it here)
const topicRefresh = startTopicRefresh({
  rules: rulesStore,
  papers,
  loadEmbedder: getEmbedder,
  loadMatrix: async () => toMatrix(embeddingsBuffer, papers.length),
  nav: {},
  vectorCache: researchVectorCache,
  onRefresh: ({ updated, ms }) => console.info(`Research topics re-evaluated in ${ms} ms (${updated} updated)`),
});
invalidation.then(() => topicRefresh.stop());
```

```js
// Search stays disabled, with the reason inside the box, until the model is ready.
{
  const input = queryInput.querySelector("input");
  const button = queryInput.querySelector("button");
  const ready = modelStatus === "ready";
  if (!ready) {
    input.dataset.query ??= input.value;
    input.value = "";
    input.placeholder =
      modelStatus === "loading"
        ? "⏳ Loading the language model…"
        : `⚠ Search unavailable: the language model failed to load (${modelStatus.slice(7)})`;
  } else if (input.dataset.query != null) {
    input.value = input.dataset.query;
    delete input.dataset.query;
    input.placeholder = queryPlaceholder;
  }
  input.disabled = !ready;
  if (button) button.disabled = !ready;
}
```

```js
// Draw the map right away; scores (color/size) arrive once the model is ready.
const scored = await (async () => {
  if ((!researchMode && !query?.trim()) || modelStatus !== "ready") return papers.map((p) => ({ ...p, score: null }));
  const embed = await getEmbedder();
  const matrix = toMatrix(embeddingsBuffer, papers.length);
  // My research: each paper scored by its closest abstract (long abstracts are chunked)
  if (researchMode) return rankByMaxSimilarity(await researchVectors(embed, researchAbstracts, researchVectorCache), matrix, papers);
  return rankBySimilarity(await embed(query), matrix, papers);
})();
```

```js
// Facet strip (#35): crossfilter-style counts; facet ids are applyFilters' option names.
const sameSet = (a, b) => a.length === b.length && a.every((v) => b.includes(v));
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
  value: { types: defaultTypes },
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
const setLive = ({ projections, clusters }) => {
  if (projections !== liveProjections.value) liveProjections.value = projections;
  if (clusters !== liveClusters.value) liveClusters.value = clusters;
};
const formatProjection = (d) => (conference.projections.includes(d) ? d.toUpperCase() : d);
const mapState = { projection: conference.projections[0], panel: null };
```

```js
const advancedDr = html`<details class="advanced-dr"><summary>Live projections, clusters and quality</summary></details>`;
advancedDr.addEventListener("toggle", async () => {
  if (!advancedDr.open || advancedDr.dataset.loaded) return;
  advancedDr.dataset.loaded = "true";
  const loading = html`<p class="muted">Loading…</p>`;
  advancedDr.append(loading);
  const { advancedPanel } = await import("./components/advancedPanel.js");
  const panel = advancedPanel({
    papers,
    embeddings: toMatrix(embeddingsBuffer, papers.length),
    dims: embeddingsBuffer.byteLength / 4 / papers.length,
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
  value: Object.keys(liveProjections).at(-1),
});
const projection = Generators.input(projectionInput);
```

```js
const colorByInput = Inputs.select(new Map([["Similarity", "score"], ["Type", "typeLabel"], ["Room", "room"], ["Session", "sessionName"], ...(hasTopics ? [["Topic", "clusterLabel"]] : []), ...(liveClusters ? [["Cluster (live)", "liveCluster"]] : [])]), {
  label: "Color by",
  value: liveClusters ? "liveCluster" : undefined,
});
const colorBy = Generators.input(colorByInput);
```

```js
// Topic labels at the cluster centers (#25), on by default
const topicLabelsInput = hasTopics ? Inputs.toggle({ label: "Topic labels", value: true }) : null;
const showTopics = topicLabelsInput ? Generators.input(topicLabelsInput) : false;
```

```js
// Phones: the map shows after search and filters (John wants the visualization on his phone);
// "Hide map" tucks it away. It never hijacks scrolling: "Select region" turns brushing on for
// one selection, then off again.
const mapToggle = html`<button class="btn-secondary map-toggle" aria-controls="explore-map" aria-expanded="true">Hide map</button>`;
mapToggle.onclick = () => {
  const hidden = layout.classList.toggle("hide-map");
  mapToggle.textContent = hidden ? "Show map" : "Hide map";
  mapToggle.setAttribute("aria-expanded", String(!hidden));
};
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
// Survive re-runs: the paper last scrolled to, and how far the list is expanded
const lastScrolled = { id: null };
const scrollToPaper = (id) => {
  const row = document.querySelector(".explore-list .papers-list")?.showThrough?.(id);
  if (!row?.isConnected) return;
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.classList.add("flash");
  setTimeout(() => row.classList.remove("flash"), 1500);
};
const relevanceState = { level: "good", people: 0 };
const topicWatchState = { open: false };
const researchPanelState = { open: false };
const listState = { key: null, shown: 100 };
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
const resetMap = () => ++mapReset.value;
```

```js
mapReset; // redraw (clearing the brush) when the map-region chip is cleared
theme; // and when Appearance changes (colors come from the tokens)
// Live clusters (#28) are a per-paper field, so they color any projection
// (papers in no cluster: null, so they color as Other; the tooltip says None)
const withLiveClusters = (list) => (liveClusters ? list.map((p) => ({ ...p, liveCluster: liveClusters.byId[p.id], liveClusterName: liveClusters.byId[p.id] ?? "None" })) : list);
const positioned = withLiveClusters(applyProjection(filtered, { ...projections, ...liveProjections }[projection]).papers);
mapState.projection = projection;
mapState.panel?.refreshCurrent();
const hasQuery = (researchMode || Boolean(query?.trim())) && modelStatus === "ready";
// Similarity only exists after a search; until then one neutral color
const colorField = colorBy === "score" && !hasQuery ? null : colorBy;
const colorTitles = { score: "Similarity", typeLabel: "Type", room: "Room", sessionName: "Session", clusterLabel: "Topic", liveCluster: "Cluster (live)" };
const mapInput = await BrushableScatterPlot(positioned, {
  color: colorField,
  colorType: colorBy === "score" && hasQuery ? "quantitative" : "nominal",
  colorTitle: colorTitles[colorField],
  // Size only echoes similarity, subtly (DESIGN.md: never a second variable)
  size: hasQuery ? "score" : null,
  // Hues for the 3 largest categories of the whole program, so filtering never repaints them
  categories: colorField && colorField !== "score" ? topCategories(withLiveClusters(papers), colorField) : undefined,
  // Read once (not reactive); later changes go through the "mine" signal below
  ringIds: store.value.map((d) => d.id),
  // Largest topics first: a label that would overlap a bigger topic's is left out
  labels: showTopics ? clusterLabels(positioned) : null,
  labelSize: mapWidth < 500 ? 10 : 11,
  // The similarity ramp's light end starts at the Good cut (cuts depend only on the search)
  scoreDomain: hasQuery ? scoreRampDomain(scored, cutsFor) : null,
  tooltip: ["title", "authorNames", "typeLabel", "sessionName", ...(hasTopics ? ["clusterLabel"] : []), ...(liveClusters ? ["liveClusterName"] : []), "score"],
  width: Math.max(260, mapWidth - 20),
  height: Math.min(620, Math.max(320, mapWidth * 0.75)),
  title: `${positioned.length} papers${hasQuery ? ` by similarity to ${researchMode ? rankingLabel : `“${query}”`}` : ""}`,
});
const map = Generators.input(mapInput);
```

```js
// Points below the chosen relevance level are drawn in viz-dim, live (no redraw)
// null = no cut ("All"): cosine scores can be negative, so 0 would dim some papers
mapInput.view.signal("levelCut", hasQuery && relevance !== "all" ? cuts[relevance] : null).runAsync();
// Rings follow My Papers live without redrawing the map (a redraw would drop the brush)
mapInput.view.signal("mine", followed.map((d) => d.id)).runAsync();
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
  showToast("Showing All matches for the people and institutions you picked");
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
const inRange = relevance === "all" ? map.brushed : map.brushed.filter((d) => d.score >= cuts[relevance]);
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
        previews: Object.fromEntries(["strong", "good"].map((l) => [l, topicPreview(scored, thresholdFor(cuts, l), { inMyPapers, current: watchedTopic?.matches })])),
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
          const saved = store.watch({ ...rule, program: programFingerprint(papers, toMatrix(embeddingsBuffer, papers.length)) });
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
  query: hasQuery ? rankingLabel : null,
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
  hasQuery || regionActive || authors.length || affiliations.length || keywords.length || sessions.length || topics.length || !sameSet(types, defaultTypes);
const addBar = renderAddBar(planAdd(selected, new Set(followed.map((d) => d.id))), {
  disabledHint: narrowed ? null : "Search, filter or select a map region to add papers in bulk",
  onAdd: (fresh) => {
    const undo = addWithUndo(store, fresh, addReason);
    showToast(`Added ${fresh.length} to My Papers`, { actionLabel: "Undo", onAction: undo });
  },
});
const levelName = { strong: "Strong", good: "Good", all: "All" }[relevance];
const leaveResearch = () => researchStore.value.active && researchStore.set({ active: false });
const chips = [
  hasQuery && researchMode && { label: rankingLabel, value: `${levelName} matches`, onClear: leaveResearch },
  hasQuery && !researchMode && {
    label: "Search",
    value: `${query} · ${levelName} matches`,
    onClear: clearQuery,
  },
  regionActive && { label: "Map region", value: "selected area", onClear: resetMap },
].filter(Boolean);
const chipsRow = renderChips(chips, {
  onClearAll:
    chips.length > 1
      ? () => {
          clearQuery();
          leaveResearch();
          resetMap();
        }
      : null,
});
```

```js
// Clicking a point on the map scrolls the list to that paper (no hidden "clicked" mode).
// Vega keeps the click selected, so only scroll when the clicked paper changes. A click also
// re-renders the list, so wait a frame and use the list that is actually on the page.
{
  const id = map.clicked[0]?.id ?? null;
  const changed = id !== lastScrolled.id;
  lastScrolled.id = id;
  if (changed && id)
    requestAnimationFrame(() => scrollToPaper(id));
}
```

```js
// Phones: the chart ignores touches (so the page scrolls), but a tap on a point still shows its
// paper: find the nearest point to the tap and scroll the list to it
{
  const phone = matchMedia("(max-width: 576px)");
  const onTap = (event) => {
    if (!phone.matches || layout.classList.contains("select-mode")) return;
    // Taps on controls in the map area (Select region, Hide map, Color by) aren't point taps
    if (event.target.closest("button, select, input, label, a")) return;
    const paper = mapInput.pointAt(event.clientX, event.clientY);
    if (paper) scrollToPaper(paper.id);
  };
  const area = document.getElementById("explore-map");
  area.addEventListener("click", onTap);
  invalidation.then(() => area.removeEventListener("click", onTap));
}
```

```js
// navio throws on an empty dataset (e.g. Strong with 0 matches)
const navioSummary = selected.length
  ? NavioWidget(
      selected.map(({ typeLabel, room, sessionName, score }) => ({ typeLabel, room, sessionName, score })),
      { height: 300 },
    )
  : html`<p class="muted">No matching papers to summarize.</p>`;
```

```js
const ordered = hasQuery ? selected : [...selected].sort((a, b) => d3.ascending(a.start ?? a.sessionStart ?? "~", b.start ?? b.sessionStart ?? "~"));
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
      const undo = addWithUndo(store, [p], hasQuery ? `★ ${rankingLabel}` : "★ Added by hand");
      showToast("Added to My Papers", { actionLabel: "Undo", onAction: undo });
    }
  },
});
const papersList = PapersList(ordered, {
  max: 100,
  shown: listState.shown,
  onShow: (n) => (listState.shown = n),
  tz,
  header: "",
  // My research with several abstracts: which one the paper is closest to
  preamble: (p) =>
    p.score == null ? "" : `🔍 ${(p.score * 100).toFixed(1)}%${researchAbstracts.length > 1 ? ` · abstract ${p.abstractIndex + 1}` : ""}`,
  actions: (p) => {
    const details = html`<button class="btn-text paper-details-open">Details</button>`;
    details.onclick = () => openPaper(p.shortId ?? p.id);
    return html`<span class="paper-actions">${listToggles.toggle(p)}${details}</span>`;
  },
});
papersList.update = listToggles.update;
```

```js
followed;
papersList.update();
```

```js
// Paper details (#22) and related papers (#23): ?paper=<shortId> is the source of truth
// (shared with My Papers, #70); Close goes back past related papers and returns focus
const paperRoute = createPaperRoute({ resolveId: (key) => papers.find((p) => p.shortId === key || p.id === key)?.id });
invalidation.then(() => paperRoute.stop());
const paperParam = Generators.input(paperRoute);
const openPaper = (key) => paperRoute.open(key);
const embeddingMatrix = toMatrix(embeddingsBuffer, papers.length);
```

```js
const paperDetail = paperPanel(paperParam, {
  papers,
  tz,
  store,
  route: paperRoute,
  related: (paper) => relatedPapers(paper.id, embeddingMatrix, papers),
});
invalidation.then(paperDetail.dispose);
```

```js
followed;
paperDetail.update?.();
```
