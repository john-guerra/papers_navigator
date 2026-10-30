---
title: Explore
toc: false
---

```js
import { createFollowedStore } from "./lib/followed.js";
import { createMyPapers, createRulesStore, matches } from "./lib/rules.js";
import { watchButton } from "./components/watchButton.js";
import { rankBySimilarity, relevanceCounts, relevanceCuts, toMatrix } from "./lib/search.js";
import { getEmbedder } from "./lib/embedder.js";
import { applyProjection } from "./lib/projections.js";
import { applyFilters, filterAccessor, typeNames } from "./lib/filters.js";
import { facetStrip } from "./widgets/facetStrip.js";
import { BrushableScatterPlot, topCategories } from "./widgets/brushableScatterPlot.js";
import { bindMyPapersBadge } from "./components/badge.js";
import { relevanceControl } from "./widgets/relevanceControl.js";
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
const typeLabels = typeNames(papers, conference.typeNames);
```

<h1>${conference.name} Papers</h1>

<p class="lede">Explore ${filtered.length}/${papers.length} papers, workshops, posters and talks by meaning. Search for a topic (e.g. ${exampleChips}), drag on the map to filter, and add the ones you want to attend to <a href="./my-papers">My Papers</a> (${followed.length}).</p>

<div id="explore" class="explore-layout">
<section class="explore-controls">
  <div class="search-row">${queryInput}</div>
  ${facetsInput}
  ${chipsRow}
  ${relevanceInput ?? ""}
  <div class="map-controls">${liveSearchInput}${mapToggle}</div>
</section>
<section id="explore-map" class="explore-map">
  ${selectRegionButton}
  ${mapInput}
  <div class="map-controls">${colorByInput}<span class="map-legend-note"><span class="ring" aria-hidden="true"></span> In My Papers</span></div>
  <details class="navio-summary">
    <summary>Summary of the current selection (navio)</summary>
    ${navioSummary}
  </details>
</section>
<section class="explore-list">
  ${addBar}
  ${papersList}
</section>
<aside id="filters-panel" class="filters-panel" aria-label="Map options">
  <div class="filters-header"><h2>Map options</h2>${filtersClose}</div>
  <h3>Dimensionality reduction</h3>
  ${projectionInput}
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
const closeOnEscape = (event) => event.key === "Escape" && setFiltersOpen(false);
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
const liveSearchInput = Inputs.toggle({ label: "Live search", value: true });
const liveSearch = Generators.input(liveSearchInput);
```

```js
const queryPlaceholder = "Describe what you are looking for, e.g. LLM agents for scientific visualization";
const queryInput = Inputs.text({
  placeholder: queryPlaceholder,
  submit: liveSearch ? false : "Search",
  value: conference.defaultQuery ?? "",
});
const query = Generators.input(queryInput);
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
  if (!query?.trim() || modelStatus !== "ready") return papers.map((p) => ({ ...p, score: null }));
  const embed = await getEmbedder();
  const matrix = toMatrix(embeddingsBuffer, papers.length);
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
const { types, authors, affiliations, keywords, sessions } = facetSelection;
```

```js
const filtered = applyFilters(scored, { types, authors, affiliations, keywords, sessions });
```

```js
const projectionInput = Inputs.select(conference.projections, {
  label: "Projection",
  format: (d) => d.toUpperCase(),
});
const projection = Generators.input(projectionInput);
const colorByInput = Inputs.select(new Map([["Similarity", "score"], ["Type", "typeLabel"], ["Room", "room"], ["Session", "sessionName"]]), {
  label: "Color by",
});
const colorBy = Generators.input(colorByInput);
```

```js
// Phones (DESIGN.md → Mobile): list first, the map behind a toggle; the map never hijacks
// scrolling — "Select region" turns brushing on for one selection, then off again.
const mapToggle = html`<button class="btn-secondary map-toggle" aria-controls="explore-map" aria-expanded="false">Show map</button>`;
mapToggle.onclick = () => {
  const shown = layout.classList.toggle("show-map");
  mapToggle.textContent = shown ? "Hide map" : "Show map";
  mapToggle.setAttribute("aria-expanded", String(shown));
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
const relevanceState = { level: "good", people: 0 };
const listState = { key: null, shown: 100 };
// Bumped by the "Map region ✕" chip: redraws the map without its brush
const mapReset = Mutable(0);
const resetMap = () => ++mapReset.value;
```

```js
mapReset; // redraw (clearing the brush) when the map-region chip is cleared
const positioned = applyProjection(filtered, projections[projection]).papers;
const hasQuery = Boolean(query?.trim()) && modelStatus === "ready";
// Similarity only exists after a search; until then one neutral color
const colorField = colorBy === "score" && !hasQuery ? null : colorBy;
const colorTitles = { score: "Similarity", typeLabel: "Type", room: "Room", sessionName: "Session" };
const mapInput = await BrushableScatterPlot(positioned, {
  color: colorField,
  colorType: colorBy === "score" && hasQuery ? "quantitative" : "nominal",
  colorTitle: colorTitles[colorField],
  // Size only echoes similarity, subtly (DESIGN.md: never a second variable)
  size: hasQuery ? "score" : null,
  // Hues for the 3 largest categories of the whole program, so filtering never repaints them
  categories: colorField && colorField !== "score" ? topCategories(papers, colorField) : undefined,
  // Read once (not reactive); later changes go through the "mine" signal below
  ringIds: store.value.map((d) => d.id),
  tooltip: ["title", "authorNames", "typeLabel", "sessionName", "score"],
  width: Math.max(260, mapWidth - 20),
  height: Math.min(620, Math.max(320, mapWidth * 0.75)),
  title: `${positioned.length} papers${hasQuery ? ` by similarity to “${query}”` : ""}`,
});
const map = Generators.input(mapInput);
```

```js
// Rings follow My Papers live without redrawing the map (a redraw would drop the brush)
mapInput.view.signal("mine", followed.map((d) => d.id)).runAsync();
```

```js
// Relevance (#9): Strong / Good / All with counts, one threshold for list, Add and map region.
// Adding a person or institution during a search switches to All, so all their papers show
// (decided in #1); the choice survives re-renders.
const peopleCount = authors.length + affiliations.length;
if (hasQuery && peopleCount > relevanceState.people && relevanceState.level !== "all") {
  relevanceState.level = "all";
  showToast("Showing All matches: every paper by the people and institutions you picked");
}
relevanceState.people = peopleCount;
const cuts = relevanceCuts(map.brushed.map((d) => d.score));
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
// Three ways into My Papers (DESIGN.md): this is "Add N", bound to exactly the listed papers
const regionActive = map.brushed.length < positioned.length;
const addReason = selectionReason({
  query: hasQuery ? query : null,
  authors,
  affiliations,
  keywords,
  sessions,
  types,
  defaultTypes,
  typeLabel: (t) => typeLabels.get(t) ?? t,
  region: regionActive,
});
// With nothing narrowing the list, one click would add the whole program: ask to narrow first
const narrowed =
  hasQuery || regionActive || authors.length || affiliations.length || keywords.length || sessions.length || !sameSet(types, defaultTypes);
const addBar = renderAddBar(planAdd(selected, new Set(followed.map((d) => d.id))), {
  disabledHint: narrowed ? null : "Search, filter or select a map region to add papers in bulk",
  onAdd: (fresh) => {
    const undo = addWithUndo(store, fresh, addReason);
    showToast(`Added ${fresh.length} to My Papers`, { actionLabel: "Undo", onAction: undo });
  },
});
const clearQuery = () => {
  queryInput.querySelector("input").value = "";
  queryInput.value = "";
  queryInput.dispatchEvent(new Event("input", { bubbles: true }));
};
const chips = [
  hasQuery && {
    label: "Search",
    value: `${query} · ${{ strong: "Strong", good: "Good", all: "All" }[relevance]} matches`,
    onClear: clearQuery,
  },
  regionActive && { label: "Map region", value: "selected area", onClear: resetMap },
].filter(Boolean);
const chipsRow = renderChips(chips, {
  onClearAll:
    chips.length > 1
      ? () => {
          clearQuery();
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
    requestAnimationFrame(() => {
      const row = document.querySelector(".explore-list .papers-list")?.showThrough?.(id);
      if (!row?.isConnected) return;
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.classList.add("flash");
      setTimeout(() => row.classList.remove("flash"), 1500);
    });
}
```

```js
const navioSummary = NavioWidget(
  selected.map(({ typeLabel, room, sessionName, score }) => ({ typeLabel, room, sessionName, score })),
  { height: 300 },
);
```

```js
const ordered = hasQuery ? selected : [...selected].sort((a, b) => d3.ascending(a.start ?? a.sessionStart ?? "~", b.start ?? b.sessionStart ?? "~"));
// Keep "Show more" expansion while only My Papers changes; reset it when the matches change
const listKey = ordered.map((p) => p.id).join();
if (listKey !== listState.key) Object.assign(listState, { key: listKey, shown: 100 });
const papersList = PapersList(ordered, {
  max: 100,
  shown: listState.shown,
  onShow: (n) => (listState.shown = n),
  tz,
  header: "",
  preamble: (p) => (p.score != null ? `🔍 ${(p.score * 100).toFixed(1)}%` : ""),
  actions: (p) => {
    const entry = followed.find((d) => d.id === p.id);
    const toggle = html`<button class="follow-toggle" aria-pressed=${entry ? "true" : "false"}
      title=${entry ? "In My Papers — remove" : "Add to My Papers"}>
      <span class="ring" aria-hidden="true"></span>${entry ? "In My Papers" : "Add to My Papers"}</button>`;
    toggle.onclick = () => {
      if (entry) {
        const undo = store.remove([p.id]);
        showToast("Removed from My Papers", { actionLabel: "Undo", onAction: undo });
      } else {
        const undo = addWithUndo(store, [p], hasQuery ? `★ ${query}` : "★ Added by hand");
        showToast("Added to My Papers", { actionLabel: "Undo", onAction: undo });
      }
    };
    return toggle;
  },
});
```
