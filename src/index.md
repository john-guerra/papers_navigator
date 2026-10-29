---
title: Explore
toc: false
---

```js
import { createFollowedStore } from "./lib/followed.js";
import { defaultScoreRange, rankBySimilarity, toMatrix } from "./lib/search.js";
import { getEmbedder } from "./lib/embedder.js";
import { applyProjection } from "./lib/projections.js";
import { applyFilters, facetValues, typeNames } from "./lib/filters.js";
import { scentedCheckbox } from "./widgets/scentedCheckbox.js";
import { BrushableScatterPlot } from "./widgets/brushableScatterPlot.js";
import { BrushableHistogram } from "./widgets/brushableHistogram.js";
import { PapersList } from "./widgets/papersList.js";
import { addToFollowed } from "./components/addToFollowed.js";
import { whereToGo } from "./lib/whereToGo.js";
import { renderWhereToGo } from "./components/whereToGo.js";
import MultiAutoSelect from "multi-auto-select/dist/MultiAutoSelect.esm.js";
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

<div class="explore-header">
  <h1>${conference.name} Papers</h1>
  ${filtersToggle}
</div>

<p class="lede">Explore ${filtered.length}/${papers.length} papers, workshops, posters and talks by meaning. Search for a topic (e.g. ${exampleChips}), drag on the map to filter, and follow the ones you want to attend. Your list lives in <a href="./my-papers">My Papers</a> (${followed.length} followed).</p>

<div id="explore" class="explore-layout">
<section id="explore-map" class="explore-map">
  <div class="search-row">${queryInput}${liveSearchInput}</div>
  <div class="search-status">${searchStatus}</div>
  <div class="map-controls">${projectionInput}${colorByInput}${sizeByInput}</div>
  ${mapInput}
  ${scoreRangeInput ?? ""}
  <div class="follow-actions">${followActions}</div>
  <details class="navio-summary">
    <summary>Summary of the current selection (navio)</summary>
    ${navioSummary}
  </details>
</section>
<section class="explore-list">
  ${whereToGoSection}
  <h2>Selected papers</h2>
  ${maxPapersInput}
  ${papersList}
</section>
<aside id="filters-panel" class="filters-panel" aria-label="Options and Filtering">
  <div class="filters-header"><h2>Options and Filtering</h2>${filtersClose}</div>
  ${typesInput}
  ${authorsInput}
  ${affiliationsInput}
  ${keywordsInput}
  ${sessionsInput}
  ${filtersDone}
</aside>
</div>

```js
// Filters live in an offcanvas sidebar on the right (as in the CHI 2026 explorer); closed by default.
const layout = document.getElementById("explore");
const filtersOpenKey = `papersNavigator:${conference.id}:filtersOpen`;
const filtersToggle = html`<button class="filters-toggle" aria-controls="filters-panel">◂ Options and Filtering</button>`;
const filtersClose = html`<button class="filters-close" aria-label="Close filters">Close ✕</button>`;
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
const liveSearchInput = Inputs.toggle({ label: "Live search" });
const liveSearch = Generators.input(liveSearchInput);
```

```js
const queryInput = Inputs.text({
  placeholder: "Describe what you are looking for, e.g. LLM agents for scientific visualization",
  submit: liveSearch ? false : "Search",
  width: 420,
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
const searchStatus =
  modelStatus === "loading"
    ? html`<span>⏳ Loading the language model…</span>`
    : modelStatus === "ready"
      ? html`<span>✓ Language model ready</span>`
      : html`<span class="error">⚠ The language model failed to load, so search is unavailable (${modelStatus.slice(7)}). The map and filters still work.</span>`;
```

```js
const scored = await (async () => {
  if (!query?.trim()) return papers.map((p) => ({ ...p, score: null }));
  const embed = await getEmbedder();
  const matrix = toMatrix(embeddingsBuffer, papers.length);
  return rankBySimilarity(await embed(query), matrix, papers);
})();
```

```js
const defaultTypes = (conference.defaultTypes ?? []).filter((t) => typeLabels.has(t));
const typesInput = scentedCheckbox(facetValues(papers, "type"), {
  label: "Type",
  format: (v) => typeLabels.get(v),
  value: defaultTypes,
});
const types = Generators.input(typesInput);
const authorsInput = MultiAutoSelect(facetValues(papers, "authors").map((d) => d.value), {
  label: "Authors",
  placeholder: "Type an author",
});
const authors = Generators.input(authorsInput);
const affiliationsInput = MultiAutoSelect(
  facetValues(papers, "affiliations").map((d) => d.value),
  { label: "Institutions", placeholder: "Type an institution" },
);
const affiliations = Generators.input(affiliationsInput);
const keywordsInput = MultiAutoSelect(facetValues(papers, "keywords").map((d) => d.value), {
  label: "Keywords",
  placeholder: "Type a keyword",
});
const keywords = Generators.input(keywordsInput);
const sessionsInput = MultiAutoSelect(facetValues(papers, "sessionName").map((d) => d.value), {
  label: "Sessions",
  placeholder: "Type a session",
});
const sessions = Generators.input(sessionsInput);
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
```

```js
const positioned = applyProjection(filtered, projections[projection]).papers;
// Similarity only exists after a search; until then color by type
const hasQuery = Boolean(query?.trim());
const mapInput = await BrushableScatterPlot(positioned, {
  color: colorBy === "score" && !hasQuery ? "typeLabel" : colorBy,
  colorType: colorBy === "score" && hasQuery ? "quantitative" : "nominal",
  size: hasQuery ? sizeBy : null,
  tooltip: ["title", "authorNames", "typeLabel", "sessionName", "score"],
  width: Math.max(260, mapWidth - 20),
  height: Math.min(620, Math.max(320, mapWidth * 0.75)),
  title: `${positioned.length} papers${hasQuery ? ` by similarity to “${query}”` : ""}`,
});
const map = Generators.input(mapInput);
```

```js
const scoreRangeInput = query?.trim()
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
const maxPapersInput = Inputs.range([10, 500], { label: "Max papers to list", step: 10, value: 100 });
const maxPapers = Generators.input(maxPapersInput);
```

```js
const inRange = scoreRange
  ? map.brushed.filter((d) => d.score >= scoreRange[0] && d.score <= scoreRange[1])
  : map.brushed;
const selected = map.clicked.length ? map.clicked : inRange;
```

```js
const sameSet = (a, b) => a.length === b.length && a.every((v) => b.includes(v));
const filtersActive =
  authors.length || affiliations.length || keywords.length || sessions.length || !sameSet(types, defaultTypes);
const filterReason = [
  authors.length && `🧑🏼‍🔬 Authors: ${authors.join(", ")}`,
  affiliations.length && `🏫 Institutions: ${affiliations.join(", ")}`,
  types.length && `Types: ${types.map((t) => typeLabels.get(t)).join(", ")}`,
  keywords.length && `Keywords: ${keywords.join(", ")}`,
  sessions.length && `Sessions: ${sessions.join(", ")}`,
]
  .filter(Boolean)
  .join(" ");
const followActions = html`${addToFollowed(store, map.brushed.length < positioned.length ? map.brushed : [], { label: "Map selection", reason: "By scatterplot selection" })}
  ${query?.trim() ? addToFollowed(store, inRange, { label: "Search results in score range", reason: `🔍 ${query}` }) : ""}
  ${filtersActive ? addToFollowed(store, filtered, { label: "Filtered papers", reason: filterReason }) : ""}`;
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
const followedIds = new Set(followed.map((d) => d.id));
const ordered = query?.trim() ? selected : [...selected].sort((a, b) => d3.ascending(a.start ?? a.sessionStart ?? "~", b.start ?? b.sessionStart ?? "~"));
const papersList = PapersList(ordered, {
  tz,
  max: maxPapers,
  header: `${selected.length} papers${map.clicked.length ? " (clicked)" : ""}`,
  preamble: (p) => (p.score != null ? `🔍 ${(p.score * 100).toFixed(1)}%` : ""),
  actions: (p) => {
    const following = followedIds.has(p.id);
    const button = html`<button class="btn-follow ${following ? "following" : ""}">${following ? "★ Following" : "☆ Follow"}</button>`;
    button.onclick = () =>
      following ? store.remove([p.id]) : store.add([p], query?.trim() ? `🔍 ${query}` : "Picked from list");
    return button;
  },
});
```
