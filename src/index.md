---
title: Explore
toc: false
---

```js
import { createFollowedStore } from "./lib/followed.js";
import { defaultScoreRange, rankBySimilarity, toMatrix } from "./lib/search.js";
import { getEmbedder } from "./lib/embedder.js";
import { applyProjection } from "./lib/projections.js";
import { applyFilters, facetValues } from "./lib/filters.js";
import { scentedCheckbox } from "./widgets/scentedCheckbox.js";
import { BrushableScatterPlot } from "./widgets/brushableScatterPlot.js";
import { BrushableHistogram } from "./widgets/brushableHistogram.js";
import { PapersList } from "./widgets/papersList.js";
import { addToFollowed } from "./components/addToFollowed.js";
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
const typeLabels = new Map(papers.map((p) => [p.type, p.typeLabel ?? p.type]));
```

<h1>${conference.name} Papers</h1>

<p class="lede">Search ${papers.length} papers, workshops, posters and talks by meaning, explore the map, and follow the ones you want to attend. Your list lives in <a href="./my-papers">My Papers</a> (${followed.length} followed).</p>

<div class="search-row">${queryInput}${liveSearchInput}</div>
<div class="search-status">${searchStatus}</div>

```js
const liveSearchInput = Inputs.toggle({ label: "Live search" });
const liveSearch = Generators.input(liveSearchInput);
```

```js
const queryInput = Inputs.text({
  placeholder: "Describe what you are looking for, e.g. LLM agents for scientific visualization",
  submit: liveSearch ? false : "Search",
  width: 520,
});
const query = Generators.input(queryInput);
```

```js
const searchStatus = html`<span></span>`;
```

```js
const scored = await (async () => {
  if (!query?.trim()) return papers.map((p) => ({ ...p, score: null }));
  searchStatus.textContent = "Loading the language model (first search only)…";
  const embed = await getEmbedder();
  searchStatus.textContent = "";
  const matrix = toMatrix(embeddingsBuffer, papers.length);
  return rankBySimilarity(await embed(query), matrix, papers);
})();
```

<div class="grid grid-cols-4">
  <div class="card">${typesInput}</div>
  <div class="card">${authorsInput}</div>
  <div class="card">${affiliationsInput}</div>
  <div class="card">${keywordsInput}${sessionsInput}</div>
</div>

```js
const typesInput = scentedCheckbox(facetValues(papers, "type"), {
  label: "Type",
  format: (v) => typeLabels.get(v),
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

<div class="map-controls">${projectionInput}${colorByInput}</div>

```js
const projectionInput = Inputs.select(conference.projections, {
  label: "Projection",
  format: (d) => d.toUpperCase(),
});
const projection = Generators.input(projectionInput);
const colorByInput = Inputs.select(new Map([["Score", "score"], ["Type", "typeLabel"], ["Room", "room"], ["Session", "sessionName"]]), {
  label: "Color by",
});
const colorBy = Generators.input(colorByInput);
```

```js
const positioned = applyProjection(filtered, projections[projection]).papers;
const map = view(
  await BrushableScatterPlot(positioned, {
    // Score only exists after a search; until then color by type
    color: colorBy === "score" && !query?.trim() ? "typeLabel" : colorBy,
    colorType: colorBy === "score" && query?.trim() ? "quantitative" : "nominal",
    size: query?.trim() ? "score" : null,
    tooltip: ["title", "authorNames", "typeLabel", "sessionName", "score"],
    width: Math.max(300, width - 40),
    height: Math.min(600, Math.max(320, width * 0.55)),
    title: `${positioned.length} papers${query?.trim() ? ` by similarity to “${query}”` : ""}`,
  }),
);
```

```js
const scoreRange = query?.trim()
  ? view(
      BrushableHistogram(map.brushed, {
        x: (d) => d.score,
        value: defaultScoreRange(map.brushed.map((d) => d.score)),
        xLabel: "Similarity score",
        width: Math.max(300, width - 40),
      }),
    )
  : null;
```

```js
const maxPapers = view(Inputs.range([10, 500], { label: "Max papers to list", step: 10, value: 100 }));
```

```js
const inRange = scoreRange
  ? map.brushed.filter((d) => d.score >= scoreRange[0] && d.score <= scoreRange[1])
  : map.brushed;
const selected = map.clicked.length ? map.clicked : inRange;
```

<div class="follow-actions">
  ${addToFollowed(store, map.brushed.length < positioned.length ? map.brushed : [], { label: "Map selection", reason: "By scatterplot selection" })}
  ${query?.trim() ? addToFollowed(store, inRange, { label: "Search results in score range", reason: `🔍 ${query}` }) : ""}
  ${authors.length || affiliations.length || types.length || keywords.length || sessions.length ? addToFollowed(store, filtered, { label: "Filtered papers", reason: filterReason }) : ""}
</div>

```js
const filterReason = [
  authors.length && `🧑🏼‍🔬 Authors: ${authors.join(", ")}`,
  affiliations.length && `🏫 Institutions: ${affiliations.join(", ")}`,
  types.length && `Types: ${types.map((t) => typeLabels.get(t)).join(", ")}`,
  keywords.length && `Keywords: ${keywords.join(", ")}`,
  sessions.length && `Sessions: ${sessions.join(", ")}`,
]
  .filter(Boolean)
  .join(" ");
```

<details class="navio-summary">
  <summary>Summary of the current selection (navio)</summary>
  ${navioSummary}
</details>

```js
const navioSummary = NavioWidget(
  selected.map(({ typeLabel, room, sessionName, score }) => ({ typeLabel, room, sessionName, score })),
  { height: 300 },
);
```

```js
const followedIds = new Set(followed.map((d) => d.id));
const ordered = query?.trim() ? selected : [...selected].sort((a, b) => d3.ascending(a.start ?? a.sessionStart ?? "~", b.start ?? b.sessionStart ?? "~"));
display(
  PapersList(ordered, {
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
  }),
);
```
