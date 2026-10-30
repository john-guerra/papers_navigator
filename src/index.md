---
title: Explore
toc: false
---

```js
import { createFollowedStore } from "./lib/followed.js";
import { defaultScoreRange, rankBySimilarity, toMatrix } from "./lib/search.js";
import { getEmbedder } from "./lib/embedder.js";
import { applyProjection } from "./lib/projections.js";
import { applyFilters, filterAccessor, typeNames } from "./lib/filters.js";
import { facetStrip } from "./widgets/facetStrip.js";
import { BrushableScatterPlot } from "./widgets/brushableScatterPlot.js";
import { BrushableHistogram } from "./widgets/brushableHistogram.js";
import { PapersList } from "./widgets/papersList.js";
import { addWithUndo, planAdd, selectionReason } from "./lib/selection.js";
import { showToast } from "./components/toast.js";
import { renderAddBar } from "./components/addBar.js";
import { renderChips } from "./components/chips.js";
import { whereToGo } from "./lib/whereToGo.js";
import { renderWhereToGo } from "./components/whereToGo.js";
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
const store = createFollowedStore(conference.id);
const followed = Generators.input(store);
const typeLabels = typeNames(papers, conference.typeNames);
```

<h1>${conference.name} Papers</h1>

<p class="lede">Explore ${filtered.length}/${papers.length} papers, workshops, posters and talks by meaning. Search for a topic (e.g. ${exampleChips}), drag on the map to filter, and add the ones you want to attend to <a href="./my-papers">My Papers</a> (${followed.length}).</p>

<div id="explore" class="explore-layout">
<section id="explore-map" class="explore-map">
  <div class="search-row">${queryInput}</div>
  ${facetsInput}
  ${chipsRow}
  <div class="map-controls">${liveSearchInput}</div>
  ${mapInput}
  <div class="map-controls">${colorByInput}${sizeByInput}</div>
  ${scoreRangeInput ?? ""}
  <details class="navio-summary">
    <summary>Summary of the current selection (navio)</summary>
    ${navioSummary}
  </details>
</section>
<section class="explore-list">
  ${whereToGoSection}
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
  rowAction: null, // Watch arrives in #6
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
const sizeByInput = Inputs.select(new Map([["Similarity", "score"], ["None", null]]), { label: "Size by" });
const sizeBy = Generators.input(sizeByInput);
```

```js
const mapWidth = Generators.width(document.getElementById("explore-map"));
// Survive re-runs: the paper last scrolled to, and how far the list is expanded
const lastScrolled = { id: null };
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
  size: hasQuery ? sizeBy : null,
  tooltip: ["title", "authorNames", "typeLabel", "sessionName", "score"],
  width: Math.max(260, mapWidth - 20),
  height: Math.min(620, Math.max(320, mapWidth * 0.75)),
  title: `${positioned.length} papers${hasQuery ? ` by similarity to “${query}”` : ""}`,
});
const map = Generators.input(mapInput);
```

```js
const scoreRangeInput = hasQuery
  ? BrushableHistogram(map.brushed, {
      x: (d) => d.score,
      value: defaultScoreRange(map.brushed.map((d) => d.score)),
      xLabel: "Similarity score",
      width: Math.max(260, mapWidth - 20),
    })
  : null;
const scoreRange = scoreRangeInput ? Generators.input(scoreRangeInput) : null;
```

```js
const inRange = scoreRange
  ? map.brushed.filter((d) => d.score >= scoreRange[0] && d.score <= scoreRange[1])
  : map.brushed;
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
  hasQuery && { label: "Search", value: query, onClear: clearQuery },
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
// Vega keeps the click selected, so only scroll when the clicked paper changes.
{
  const id = map.clicked[0]?.id ?? null;
  const changed = id !== lastScrolled.id;
  lastScrolled.id = id;
  const row = changed && id ? papersList.showThrough(id) : null;
  if (row) {
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("flash");
    setTimeout(() => row.classList.remove("flash"), 1500);
  }
}
```

```js
const minScoreInput = html`<input type="number" class="min-score" min="0" max="100" step="1" value="30">`;
const minScore = Generators.input(minScoreInput);
```

```js
const whereToGoSection = hasQuery
  ? html`<h2>Where to go?</h2>
      <p class="where-intro">For your query <i>${query}</i>, with a min score of ${minScoreInput}% you should go to:</p>
      ${renderWhereToGo(whereToGo(map.brushed, { minScore: minScore / 100, tz }), { tz })}`
  : html`<h2>Where to go?</h2>
      <p class="where-intro">Search for a topic to see which rooms and sessions to attend each day.</p>`;
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
        store.remove([p.id]);
        showToast("Removed from My Papers", { actionLabel: "Undo", onAction: () => store.merge([entry]) });
      } else {
        const undo = addWithUndo(store, [p], hasQuery ? `★ ${query}` : "★ Added by hand");
        showToast("Added to My Papers", { actionLabel: "Undo", onAction: undo });
      }
    };
    return toggle;
  },
});
```
