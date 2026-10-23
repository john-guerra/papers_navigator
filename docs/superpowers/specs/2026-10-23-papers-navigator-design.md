# Papers Navigator — Design

Date: 2026-10-23
Author: John Alexis Guerra Gómez (design written with Claude)
Repo: `git@github.com:john-guerra/papers_navigator.git` (public)
First target: **IEEE VIS 2026** — must be live before sessions start on **Tue Nov 10, 2026** (Boston, US/Eastern).

## 1. Intent

John builds a paper explorer for each major conference (IEEE VIS 2025, CHI 2026, …) to help attendees find papers through semantic search, a 2D embedding map, and filters, and to build a personal list of papers to follow. Live examples: https://johnguerra.co/viz/ieeevis2025Papers/ and https://johnguerra.co/viz/chi2026Papers/.

Today each conference is a copied static page that embeds cells from a large remote Observable notebook (~1,700 lines, ~130 cells) which imports ~13 helper notebooks and pulls several libraries from CDNs at runtime. Problems:

- **Slow**: every visit boots the notebook runtime, resolves all notebook imports and CDN libs before showing anything; many cells recompute together.
- **Not future-proof**: Observable moved to Notebooks 2.0; the 1.0 embed path is legacy.
- **Hard to extend with AI coding**: logic lives in remote notebooks, not in files.
- **Copy-and-patch per conference.**

The new version is **one reusable codebase with a config per conference**, built as an ordinary codebase that John and AI agents edit as files.

## 2. Goals

1. Reusable navigator: adding a conference = adding a config + a fetcher that outputs the normalized data format (§5). VIS 2026 is the first config.
2. Feature parity with the current VIS 2025 / CHI 2026 explorer (§6).
3. Followed-papers ("My Papers") with a clear **per-day schedule of which session/room to go to** (§7).
4. Fast: map visible in roughly 2 s on a normal connection from precomputed data; heavy computation loads lazily.
5. Reuse John's existing widgets, ported to plain ES modules following the **reactive widgets** pattern (https://reactivewidgets.org): a widget is an HTMLElement whose `.value` holds the current selection and that emits/listens to `input` events.
6. Static output deployed by `rsync` to johnguerra.co, as today.

## 3. Non-goals

- No backend, no logins, no cross-device sync service.
- No in-notebook editing workflow (Notebook Kit / Observable Desktop not used).
- Not migrating old conference sites (VIS 2025, CHI 2026 stay as they are). CHI support in the new codebase is a later step; the design must allow it but it is not built now.

## 4. Anti-goals (failure even if it "works")

- Slower first paint than the current site.
- Followed papers lost on reload, or no way to get them onto the phone.
- Schedule showing times in the phone's timezone instead of the conference's.
- VIS-specific assumptions hard-coded into pages/widgets (breaks reuse).
- Hammering ieeevis.org with uncached requests.

## 5. Architecture (decided)

**Stack: Observable Framework** (Markdown pages + `.js` modules, npm imports, data loaders, static build). Chosen over Notebook Kit because: multi-page support, build-time data loaders (fits the Python pipeline), file-based code friendly to AI editing, and John has used it successfully. Known risk: Framework release cadence is slow (v1.13.4, Mar 2026); mitigated because output is static and widgets are framework-agnostic ES modules (could move to Notebook Kit or plain Vite later).

### 5.1 Repo layout (proposed; builder may adjust)

```
papers_navigator/
  conferences/
    ieeevis2026/config.js        # name, year, timezone, dates, base URL, branding, fetcher id, types
  pipeline/                      # Python, run offline per conference
    fetch_ieeevis.py             # scrape → normalized papers JSON (cached raw HTML)
    embed.py  umap.py  clusters.py  (reuse existing scripts/notebook logic)
  src/
    index.md                     # Explore
    clusters.md                  # Clusters view
    my-papers.md                 # Followed papers + schedule
    components/                  # app-level glue
    widgets/                     # ported reactive widgets (plain ES modules)
    data/                        # Framework data loaders reading pipeline outputs
  docs/superpowers/specs/
```

Selecting which conference to build: one conference per build (e.g. env var `CONFERENCE=ieeevis2026`), output deployed to its own folder, e.g. `johnguerra.co/viz/ieeevis2026Papers/`. *(Claude's call; builder may choose another mechanism as long as one codebase serves many conferences.)*

### 5.2 Normalized paper format (contract between fetchers and the app)

One JSON array; each item:

| field | notes |
|---|---|
| `id` | stable id (VIS: the content UUID from the URL) |
| `type` | e.g. Full, Short, TVCG, CG&A, Workshop, Challenge, Arts… |
| `title`, `abstract` | |
| `authors` | `[{name, affiliation}]` |
| `keywords` | `[string]` |
| `session` | `{id, name}` |
| `room` | string |
| `start`, `end` | ISO timestamps of the **presentation** slot (VIS pages give per-talk times, e.g. 13:00–13:09) |
| `sessionStart`, `sessionEnd` | ISO timestamps of the session |
| `url` | conference page for the paper |
| `links` | preprint, video, supplemental when public |
| `award` | optional |

Plus pipeline outputs keyed by `id`: embeddings (384-dim, `all-MiniLM-L6-v2`, title + "\n" + abstract), UMAP `x,y`, cluster id, and cluster topic labels (c-TF-IDF, as in `chi2026_papers/scripts/compute_topic_labels.py`). Items with no abstract embed title only.

### 5.3 VIS 2026 data source

- `https://ieeevis.org/year/2026/program/content/` lists ~488 content items linking to `/year/2026/program/content/<uuid>`.
- Each page contains title, authors with affiliations, keywords, session, per-talk time, session time, room, links, abstract. PDF links require sign-in; don't scrape those.
- The repo `ieee-vgtc/ieeevis.org` (branch `vis2026`) has `src/data/early_program/papers_list.tsv` (218 Full/CG&A papers, no abstracts) and a schedule JSON; the full `paper_list.json` it builds from is not committed. Use these only as cross-checks.
- Fetcher must cache raw HTML locally, rate-limit (≈1 req/s), and be re-runnable as the program changes before the conference.

## 6. Explore & Clusters pages (parity with current site)

Keep all current features (reference: VIS 2025 notebook `@john-guerra/ieeevis2025-papers`, CHI 2026 notebook `@john-guerra/chi2026-papers`; exported sources in `notebooks/*.tgz`; current page shell in `/Users/aguerra/workspace/chi2026_papers/page/` and `/Users/aguerra/workspace/ieeevis2025_papers/page/`):

- **Semantic search**: query embedded in-browser with Transformers.js (same model as the pipeline), cosine similarity against precomputed paper embeddings; result score drives point size and list ordering; min-score / max-papers controls; live-search toggle.
- **Embedding map**: brushable scatterplot (current `BrushableScatterPlot` / Vega-Lite) from precomputed UMAP; color by attribute; brushing selects papers.
- **Filters**: type, authors, institutions/affiliations, keywords, session (faceted search, multi-auto-select, scented checkboxes), navio summary.
- **Clusters**: precomputed HDBScan clusters with topic labels drawn on the map; clusters page as today.
- **Advanced (lazy-loaded)**: live DR with Druid (method + params), HDBScan / k-means re-clustering, ZADU trustworthiness/continuity metrics, choice of embeddings file. Not loaded until the user opens the Advanced panel.
- **Paper list** with details (title link, authors+affiliations, type, session, room, time, abstract, award).
- Add-to-followed actions on: current brush, search results (within a score range, via brushable histogram), current filter result — each recording a *reason* (as in the myPapers notebook).

## 7. My Papers & Schedule

Reference: myPapers notebook `@john-guerra/chi2026-mypapers` (export in `data/chi2026-mypapers.tgz`): `PersistentTable`, `AddRemove`, `BrushableHistogram`, `PapersList`, `renderToAttend`.

### 7.1 Followed papers

- Stored in browser `localStorage`, keyed per conference.
- Each entry: paper `id`, `reason` (e.g. `🔍 <query>`, `Authors: …`, `By scatterplot selection`), `addedOn`.
- List view: search within, sort (time, room, addedOn, score, title, reason), remove, JSON import/export.
- **Send to phone**: a share link (and QR code) that encodes followed paper ids in the URL; opening it on another device offers to merge into or replace that device's list. No backend.
  - *Claude's call:* the link carries **short ids only, no reasons**, to keep QR codes scannable (~1 KB practical limit). Short id = shortest UUID prefix (≥8 hex chars) unique within the conference, emitted by the pipeline as a stable field `shortId` (prefixes stay stable across re-scrapes since UUIDs don't change). Papers arriving via link get reason `📱 shared`. Full reasons travel via JSON export/import. 50 papers ≈ 450 chars.

### 7.2 Schedule grouping rules (*Claude's call*)

- Every content type is followable and appears in the schedule (John asked for "everything").
- A **slot** = a maximal group of followed items whose session intervals overlap (connected components of overlapping `[sessionStart, sessionEnd]`), within a day. This handles workshops/half-day sessions that don't align with 90-min paper sessions: they show up in every slot they overlap, so conflicts aren't hidden.
- Items without per-talk times use session times and are listed after timed items.
- Recommended room per slot = session with the most followed items; ties → earliest next followed talk.
- This grouping logic is pure and unit-tested.

### 7.3 Schedule — desktop: collapsible daily itinerary (chosen, mockup option A)

- Tabs per conference day.
- One row per session time slot containing followed papers; collapsed row shows the **recommended room** (session with most followed papers in that slot), session name, and count badge.
- Expanding shows the followed papers in presentation order with time, reason, unfollow.
- Other sessions in the same slot with followed papers appear as "⚠ also" alternatives, also expandable.

### 7.4 Schedule — mobile: Now / Next (chosen, mockup option C)

- Default on small screens. Uses the **conference timezone** from config.
- Big "NOW" card: room, session, until-time, number of followed papers, which followed paper is next (from per-talk times).
- Following cards for the next slots of the day, with conflict markers.
- Outside conference hours it falls back to the itinerary.

Mockups: `.superpowers/brainstorm/*/content/my-schedule.html` (local, not committed).

## 8. Widgets to port (to `src/widgets/`, plain ES modules, reactive-widget contract)

Already on npm (use package; local repos exist under `/Users/aguerra/workspace/`): `navio`, `reactive-widget-helper`, `vega-selected`.

Port from notebook exports (`notebooks/*.tgz`, `data/chi2026-mypapers.tgz`): BrushableScatterPlot, FacetedSearch, scentedCheckbox, searchCheckbox, multiAutoSelect, BrushableHistogram, PersistentTable (incl. localStorage + import/export), PapersList, OnClickButton, CachedWidget / PersistInput, Tree, DruidGenerator, progress, conditionalShow. Prefer Framework built-ins (`Inputs`, `view()`) where a helper notebook only wrapped them. Each widget must work outside Framework (no Observable-runtime globals).

## 9. Performance

- First paint from precomputed data: papers JSON, UMAP coords, clusters, labels. Embeddings shipped compactly (e.g. Float32 binary or quantized) and loaded in parallel; required only once a query is typed.
- Transformers.js model loaded on first query (or idle prefetch), not at page load.
- Advanced features dynamically imported.
- Dependencies bundled via npm/Framework, no runtime CDN imports of skypack/esm.sh.

## 10. Deployment

`npm run build` (with conference selected) → `dist/` → `rsync` to `johnguerra.co:/var/www/viz/<conference>Papers` (same SSH key pattern as current `page/update.sh`). Social/OG image per conference in config.

## 11. Release staging (decided with John)

| Stage | Target | Scope |
|---|---|---|
| 1 | **~Mon Nov 3, 2026** (so attendees can plan) | Pipeline for VIS 2026; Explore (semantic search, map, filters type/authors/institutions/keywords/session, paper details, add-to-followed); My Papers (list, import/export, desktop itinerary, mobile Now/Next, QR/share link); deployed. |
| 2 | **by Tue Nov 10, 2026** | Clusters page with precomputed HDBScan clusters + topic labels on the map. |
| 3 | after launch | Advanced panel: live Druid DR, HDBScan/k-means re-clustering, ZADU metrics, embeddings-file choice. |

Widgets are ported as each stage needs them; a minimal version for launch is acceptable if the reactive-widget contract holds, with a faithful port later. During the conference week the pipeline may be re-run for program changes.

## 12. Left to the builder

- Exact repo layout, config schema shape, and build-selection mechanism.
- Port vs rewrite per widget, as long as behavior and the reactive-widget contract are kept.
- Embedding binary format; caching strategy for the scraper.
- Visual styling (keep current Bootstrap-ish look unless a better fit emerges).
- Testing approach (at minimum: fetcher output validated against the normalized format; schedule grouping logic unit-tested).

## 13. Calls Claude made (for John to check)

- One conference per build, deployed to its own folder.
- Per-paper `start/end` uses per-talk times when available, session times otherwise.
- Recommended room = session with most followed papers in the slot; ties broken by earliest next followed talk.
- Share link merges or replaces on the receiving device (user chooses).
- Embeddings: same model and text (title + abstract) as CHI 2026 pipeline.
- Share link carries short ids only (no reasons); reasons via JSON export (§7.1).
- All content types followable; slots = overlapping session intervals (§7.2).
