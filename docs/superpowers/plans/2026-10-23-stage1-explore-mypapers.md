# Stage 1 — Explore + My Papers (VIS 2026) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the VIS 2026 navigator's Stage 1 (spec §11): scraped data pipeline, Explore page (semantic search, map, filters, details, add-to-followed) and My Papers (list, import/export, desktop itinerary, mobile Now/Next, QR share link), deployed by ~Mon Nov 3, 2026.

**Architecture:** An offline Python pipeline turns ieeevis.org into `conferences/ieeevis2026/data/{papers.json, embeddings.bin}`. An Observable Framework site (repo root, pages in `src/`) loads those through data loaders. Pure logic lives in `src/lib/` (unit-tested with Vitest), and UI widgets live in `src/widgets/` as plain ES modules following the reactive-widget contract.

**Tech Stack:** Observable Framework 1.13.x, Vitest + jsdom, ESLint 9 flat config + Prettier, `@huggingface/transformers` (browser query embedding), `vega`/`vega-lite`/`vega-lite-api`/`vega-embed`, `navio`, `vega-selected`, `reactive-widget-helper`, `qrcode`. Python 3.12 venv: `requests`, `beautifulsoup4`, `sentence-transformers`, `umap-learn`, `scikit-learn`, `pytest`.

**Spec:** `docs/superpowers/specs/2026-10-23-papers-navigator-design.md`

## Global Constraints

- Conference timezone for every displayed time and every day boundary: `US/Eastern` (from config, never the device).
- Embedding model `all-MiniLM-L6-v2`, text = `title + "\n" + abstract` (title only if no abstract), 384 dims, L2-normalized (Python `normalize_embeddings=True`; browser `Xenova/all-MiniLM-L6-v2` with `{ pooling: "mean", normalize: true }`).
- `embeddings.bin` = little-endian Float32, row *i* ↔ `papers.json[i]`, byteLength = N × 384 × 4.
- Scraper: cache raw HTML under `pipeline/cache/` (gitignored); ≤ 1 request/second; never fetch PDF links.
- Content included: every listing card except `data-type="session-role"` (expected 492 items on the 2026-10-23 snapshot).
- Share link carries short ids only, format `#follow=<id>.<id>…`; shortId = shared prefix length L ≥ 8 that makes all ids unique.
- Followed list localStorage key: `papersNavigator:<conferenceId>:followed`.
- No backend; no runtime imports from skypack/esm.sh/unpkg; heavy pieces (Transformers.js model) load on first query.
- JS style: ES modules, double quotes, semicolons, 2-space indent.
- Repo is public: never commit `pipeline/cache/`, `*.tgz`, or `data/`.

## Review Focus

1. **Program changes between scrapes**: a followed id disappears from `papers.json` → My Papers keeps it, shows "no longer in program", and never crashes (test in Task 7).
2. **Device in another timezone / talks near midnight UTC**: `2026-11-11T03:30:00Z` must fall on **Nov 10** (Eastern) in the itinerary (test in Task 9).
3. **Followed items with no session or room**: they go into an "Unscheduled" group, not a phantom slot (test in Task 9).
4. **Corrupt localStorage or bad import file**: load returns `[]`; import throws a readable error and leaves the current list untouched (test in Task 7).
5. **Share link with unknown or garbled ids, or an empty hash**: unknown ids are ignored and counted, and an empty hash means nothing happens (test in Task 11).

---

### Task 1: Project scaffold + conference config

**Files:**
- Create: `package.json`, `observablehq.config.js`, `vitest.config.js`, `eslint.config.js`, `.prettierrc`, `conferences/ieeevis2026/config.json`, `src/lib/conference.js`, `src/index.md` (placeholder), `pipeline/requirements.txt`, `pipeline/conftest.py`
- Modify: `.gitignore` (add `pipeline/cache/`, `.venv/`, `src/.observablehq/cache/`)
- Test: `test/conference.test.js`

**Interfaces:**
- Produces: `conferences/<id>/config.json` with keys `id, name, year, timezone, days (["2026-11-10", …]), baseUrl, listingUrl, deployPath, ogImage`. `getConferenceId(env = process.env) -> string` (default `"ieeevis2026"`), `loadConferenceConfig(id) -> Promise<object>` (Node only, used by config and loaders).

- [ ] **Step 1:** `npm init -y`, then install `@observablehq/framework@^1.13.4`, plus dev deps `vitest jsdom eslint @eslint/js globals eslint-config-prettier prettier`. Set scripts: `dev: observable preview`, `build: observable build`, `test: vitest run`, `lint: eslint src test`. Also set `"type": "module"`.
- [ ] **Step 2:** Write `config.json` for VIS 2026 with `timezone: "US/Eastern"`, `days: ["2026-11-08" … "2026-11-13"]`, `listingUrl: "https://ieeevis.org/year/2026/program/content/"`, `deployPath: "/var/www/viz/ieeevis2026Papers"`.
- [ ] **Step 3:** Write the failing test `test/conference.test.js`: `getConferenceId({})` is `"ieeevis2026"`; `getConferenceId({CONFERENCE: "chi2027"})` is `"chi2027"`; `(await loadConferenceConfig("ieeevis2026")).timezone` is `"US/Eastern"`.
- [ ] **Step 4:** Run `npx vitest run test/conference.test.js`. Expected: FAIL, module not found.
- [ ] **Step 5:** Implement `src/lib/conference.js`. Make `observablehq.config.js` read the config for `title` (`"IEEE VIS 2026 Papers"`), `root: "src"` and pages `[Explore → /, My Papers → /my-papers]`, and a `head` with the `og:image`/`og:title` meta tags taken from config.
- [ ] **Step 6:** Run `npm test && npm run build`. Expected: tests PASS, and `dist/index.html` exists.
- [ ] **Step 7:** Create `.venv` with `/opt/homebrew/Caskroom/miniforge/base/bin/python -m venv .venv`, `pip install -r pipeline/requirements.txt`, then `.venv/bin/pytest pipeline` (expected: "no tests ran", exit 5 is acceptable).
- [ ] **Step 8:** Commit `chore: scaffold Framework app, config, test tooling`.

### Task 2: VIS 2026 fetcher → normalized papers

**Files:**
- Create: `pipeline/fetch_ieeevis.py`, `pipeline/normalize.py`
- Test: `pipeline/tests/test_fetch_ieeevis.py` (fixtures already in `pipeline/tests/fixtures/ieeevis2026_listing.html`, `ieeevis2026_paper_3121c4fc.html`)

**Interfaces:**
- Produces: `parse_listing(html: str) -> list[dict]` (keys: `id, type, eventName, sessionKey, sessionName, startMs, url, award`), `parse_paper(html: str) -> dict` (keys: `title, authors [{name, affiliation}], keywords, sessionName, sessionId, start, end, sessionStart, sessionEnd, room, abstract, links`), `assign_short_ids(ids: list[str], min_len=8) -> dict[str,str]`, `fetch_cached(url, cache_dir, min_interval=1.0) -> str`, CLI `python -m pipeline.fetch_ieeevis --conference ieeevis2026` writing `conferences/ieeevis2026/data/papers.raw.json` (spec §5.2 fields plus `shortId`).

- [ ] **Step 1: Write failing tests.**
  - `test_listing_counts`: `len(items) == 492`. Type counts: `full 145, workshop 100, short 68, tvcg 59, poster 58, challenge 30, visap 15, "cg&a" 11, invited-talk 5, vis 1`. HTML entities must be unescaped.
  - `test_listing_item`: the item with id `3121c4fc-2fc3-4c4c-a716-fc64018061ec` has `type == "short"`, `sessionKey == "v-short-short3"`, `startMs == 1794420000000`, `url` ending in `/program/content/3121c4fc-2fc3-4c4c-a716-fc64018061ec`.
  - `test_parse_paper`: `title == "Exploring LLM Agent Designs and Interaction Modalities for Scientific Visualization"`; 5 authors, first `{"name": "Jackson Vonderhorst", "affiliation": "University of Notre Dame"}`, fourth affiliation `"Lawrence Livermore National Laboratory"` (stripped); `keywords == ["Scientific visualization", "LLM agents", "interaction modalities", "evaluation"]`; `sessionName == "Me, Myself, and AI"`; `sessionId == "v-short-short3"`; `start == "2026-11-11T18:00:00.000Z"`, `end == "2026-11-11T18:09:00.000Z"`; `room == "America center"`; `abstract.startswith("This paper examines how large language model")`.
  - `test_short_ids`: `assign_short_ids(["abcdefgh1", "abcdefgh2"])` returns 9-char prefixes; `assign_short_ids(["aaaaaaaa-1", "bbbbbbbb-2"])` returns 8-char prefixes.
- [ ] **Step 2:** Run `.venv/bin/pytest pipeline/tests/test_fetch_ieeevis.py -v`. Expected: FAIL (import error).
- [ ] **Step 3:** Implement with BeautifulSoup. Listing cards are `article.program-card` with `data-*` attributes; skip `data-type="session-role"`. On paper pages: `h1` is the title; authors are `.paper-hero__meta` links, with the affiliation in the following `span` "(…)"; keywords are `.paper-keywords span`; `dl.presentation-details` holds Session/Time/Room; the talk time comes from the first `[data-tz-start]` and the session time from the `[data-tz-start]` inside `.presentation-details__note`; the abstract is in `.paper-abstract p`. Missing fields become `None`, never an exception. `fetch_cached` keys the cache file by URL hash.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Run the CLI against the live site (about 9 minutes at 1 req/s). Check that `papers.raw.json` has 492 items and that every item with `abstract == None` is printed as a warning.
- [ ] **Step 6:** Commit `feat(pipeline): VIS 2026 scraper and normalized papers` (code, tests, fixtures; not the cache).

### Task 3: Embeddings + UMAP → final data files

**Files:**
- Create: `pipeline/embed.py`
- Test: `pipeline/tests/test_embed.py`

**Interfaces:**
- Consumes: `papers.raw.json` (Task 2).
- Produces: `embed_texts(papers) -> list[str]`, `write_embeddings(matrix: np.ndarray, path)`, `run(conference_id, encoder=None, reducer=None)`. Writes `conferences/<id>/data/papers.json` (raw fields plus `x`, `y`, plus `authorNames` and `affiliations` joined strings for tooltips) and `embeddings.bin`. The UMAP pipeline matches CHI 2026: StandardScaler, then `umap.UMAP(random_state=42)`.

- [ ] **Step 1: Write failing tests**, using an injected fake encoder (returns `np.ones((n, 384))`) and a fake reducer (returns `np.zeros((n, 2))`):
  - `embed_texts` uses `"T\nA"` when an abstract exists and `"T"` when it doesn't.
  - After `run`, `embeddings.bin` size is `n*384*4`; `papers.json` keeps input order and every item has numeric `x`, `y`.
- [ ] **Step 2:** Run `.venv/bin/pytest pipeline/tests/test_embed.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement. The default encoder is `SentenceTransformer("all-MiniLM-L6-v2").encode(texts, normalize_embeddings=True)`. Write float32 little-endian with `matrix.astype("<f4").tofile(path)`.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then run the real pipeline: `.venv/bin/python -m pipeline.embed --conference ieeevis2026`.
- [ ] **Step 5:** Commit `feat(pipeline): embeddings and UMAP outputs` together with `conferences/ieeevis2026/data/papers.json` and `embeddings.bin` (both derived from public pages).

### Task 4: Data loaders + semantic search

**Files:**
- Create: `src/data/papers.json.js`, `src/data/embeddings.bin.js`, `src/lib/search.js`, `src/lib/embedder.js`
- Test: `test/search.test.js`

**Interfaces:**
- Consumes: `getConferenceId`, `loadConferenceConfig` (Task 1); data files (Task 3).
- Produces: `toMatrix(buffer: ArrayBuffer, n: number, dims = 384) -> Float32Array` (throws `"embeddings/papers mismatch"` when `byteLength !== n*dims*4`), `rankBySimilarity(query: Float32Array, matrix: Float32Array, papers: object[], dims = 384) -> object[]` (copies of the papers with a `score` in [-1, 1], sorted descending), `getEmbedder() -> Promise<(text: string) => Promise<Float32Array>>` (lazy and memoized; dynamically imports `@huggingface/transformers`).

- [ ] **Step 1: Write failing tests:** `toMatrix(new ArrayBuffer(8), 1, 384)` throws `"embeddings/papers mismatch"`. With 3 papers and 2-dim unit vectors `[1,0]`, `[0,1]`, `[0.6,0.8]`, querying `[1,0]` ranks ids `a, c, b` with scores `1, 0.6, 0`. Ranking does not mutate the input papers.
- [ ] **Step 2:** Run `npx vitest run test/search.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. The loaders read `conferences/${getConferenceId()}/data/*` and write to stdout. Vectors are already normalized, so the dot product is the cosine.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat: data loaders and semantic search core`.

### Task 5: Filters + filter widgets

**Files:**
- Create: `src/lib/filters.js`, `src/widgets/scentedCheckbox.js`, `src/widgets/multiAutoSelect.js`
- Test: `test/filters.test.js`, `test/widgets.test.js`

**Interfaces:**
- Produces: `facetValues(papers, key: "type"|"authors"|"affiliations"|"keywords"|"sessionName") -> {value, count}[]` sorted by count desc. `applyFilters(papers, {types?, authors?, affiliations?, keywords?, sessions?}) -> object[]`: AND across facets, OR within a facet; an empty or missing facet means no filter. `scentedCheckbox(values: {value,count}[], {label, value?}) -> HTMLElement` with `.value: string[]`. `multiAutoSelect(options: string[], {label, placeholder, value?}) -> HTMLElement` with `.value: string[]`. Port both from the notebook exports: `notebooks/ieeevis2025-papers.tgz`, files `af8899339492063b@415.js` and `9ac406907b45efa2@262.js`.

- [ ] **Step 1: Write failing tests:**
  - `facetValues` on authors counts one author across two papers as `2`.
  - `applyFilters` with `{types: ["full"], affiliations: ["MIT"]}` returns only full papers that have an MIT author; `{}` returns all papers.
  - Widget contract (jsdom): each widget's `.value` matches its option `value`. Setting `.value` and dispatching `new Event("input", {bubbles: true})` updates the checked/selected UI, and user clicks fire `input`.
- [ ] **Step 2:** Run `npx vitest run test/filters.test.js test/widgets.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement the code and port the widgets, removing Observable globals (`htl`/`Inputs` come from npm `htl` and `@observablehq/inputs`).
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat: faceted filters and filter widgets`.

### Task 6: Brushable scatterplot + brushable histogram

**Files:**
- Create: `src/widgets/brushableScatterPlot.js`, `src/widgets/brushableHistogram.js`
- Test: `test/widgets.test.js` (extend)

**Interfaces:**
- Produces: `BrushableScatterPlot(data, {x = "x", y = "y", color, size = "score", sizeRange = [1, 200], id = "id", tooltip: string[], width, height}) -> Promise<HTMLElement>` with `.value = {brushed: object[], clicked: object|null}`. Port from `cb912116cc3f5c34@517.js` plus the VIS notebook's `getVegaView`, without the clustering branches (those belong to Stage 2). `BrushableHistogram(data, {x: (d) => number, value: [lo, hi], height, xLabel}) -> HTMLElement` with `.value = [lo, hi]`, ported from `data/chi2026-mypapers.tgz` file `829856ddf7db05c0@179.js`.

- [ ] **Step 1: Write failing tests** (jsdom; renderer `"svg"`): the scatterplot's initial `.value.brushed.length === data.length` and `.value.clicked === null`. The histogram's initial `.value` equals the `value` option.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with `vega-selected` / `vega-embed`. Selections update `.value` and dispatch `input`.
- [ ] **Step 4:** Run. Expected: PASS. Then check by hand in `npm run dev` on a scratch page: brushing changes the count shown by `view()`.
- [ ] **Step 5:** Commit `feat: brushable scatterplot and histogram widgets`.

### Task 7: Followed-papers store

**Files:**
- Create: `src/lib/followed.js`
- Test: `test/followed.test.js`

**Interfaces:**
- Produces: `createFollowedStore(conferenceId, storage = globalThis.localStorage) -> EventTarget & {value: Followed[], add(papers, reason, now = new Date()), remove(ids), replace(list), merge(list), exportJSON(): string, importJSON(text)}`, where `Followed = {id, reason, addedOn: ISO string}`. Every mutation persists to key `papersNavigator:<id>:followed` and dispatches `input`, so `Generators.input(store)` works in Framework. `resolveFollowed(followed, papers) -> {items: (paper & Followed)[], missing: Followed[]}`.

- [ ] **Step 1: Write failing tests** (with an in-memory storage stub):
  - `add` twice for the same paper with reasons `"🔍 llm"` then `"Authors: X"` gives one entry with reason `"🔍 llm · Authors: X"` and keeps the first `addedOn`; adding the same reason twice doesn't duplicate it.
  - `remove(["a"])` persists, and a new store on the same storage loads without `a`.
  - **Review Focus 4:** storage value `"{not json"` loads as `[]`. `importJSON("[{\"nope\":1}]")` throws an Error whose message contains `"invalid"` and leaves `.value` unchanged.
  - `merge` unions by id and concatenates reasons.
  - **Review Focus 1:** `resolveFollowed([{id:"gone",…}], papers)` returns `missing.length === 1` and `items.length === 0`.
- [ ] **Step 2:** Run `npx vitest run test/followed.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: followed papers store`.

### Task 8: Explore page

**Files:**
- Create: `src/index.md`, `src/widgets/papersList.js`, `src/components/addToFollowed.js`, `src/style.css`
- Test: `test/widgets.test.js` (extend for `papersList`)

**Interfaces:**
- Consumes: Tasks 4–7.
- Produces: `PapersList(papers, {actions?: (p) => Node, preamble?: (p) => Node, header?}) -> HTMLElement`, ported from `d97257fb03e0681b@230.js` plus the myPapers `renderItem`. It shows a title link to `url`, authors with affiliations, type, session, room, the time in the conference timezone, an award emoji, public links (preprint/video) and a scrollable abstract. `addToFollowed(store, papers, {label, reason}) -> HTMLElement`: Add/Remove buttons showing the selection count.

- [ ] **Step 1: Write a failing test:** `PapersList` renders one item per paper, and the time for `2026-11-11T18:00:00.000Z` reads `13:00` under `US/Eastern`.
- [ ] **Step 2:** Run. Expected: FAIL. Then implement until it PASSES.
- [ ] **Step 3:** Assemble `src/index.md`:
  - a query input with a live-search toggle; the score comes from `rankBySimilarity` once the embedder resolves, and the page shows "loading model…" until then
  - filters for type, authors, affiliations, keywords and session
  - the map sized by score, with a color-by control (default `type`)
  - a navio summary (npm `navio`) of the current filtered set
  - a histogram of the score range
  - max-papers and min-score controls
  - a list of brushed ∩ filtered ∩ score-range papers
  - three add actions with the reasons `By scatterplot selection`, `🔍 <query>`, and `Authors: … Affiliations: …` (the copy follows the myPapers notebook)
- [ ] **Step 4:** Verify in `npm run dev`:
  - The map shows before the model loads.
  - The query "LLM agents for scientific visualization" puts `3121c4fc…` in the top 5.
  - Adding papers shows up on `/my-papers` after a reload.
- [ ] **Step 5:** Run `npm run build`, serve `dist/`, and check Chrome DevTools (Fast 4G throttling). The map should be visible in ≤ 2 s with no request to huggingface.co before the first query. Write down the measured time in the commit message.
- [ ] **Step 6:** Commit `feat: Explore page`.

### Task 9: Schedule grouping

**Files:**
- Create: `src/lib/schedule.js`, `src/lib/time.js`
- Test: `test/schedule.test.js`

**Interfaces:**
- Consumes: resolved followed items (Task 7).
- Produces:
  - `dayKey(iso, tz) -> "YYYY-MM-DD"` and `formatTime(iso, tz) -> "HH:MM"`, both via `Intl.DateTimeFormat`.
  - `groupIntoSlots(items, tz) -> {days: Day[], unscheduled: item[]}`.
    - `Day = {date, slots: Slot[]}`.
    - `Slot = {start, end, sessions: SessionGroup[], recommended: SessionGroup, alternatives: SessionGroup[]}`.
    - `SessionGroup = {sessionId, sessionName, room, start, end, items}`.
  - `nowNext(days, now: Date) -> {now: Slot|null, nowItem: item|null, next: Slot[]} | null`. It returns `null` when `now` is not on a conference day that has slots.

Algorithm (spec §7.2):
```text
group items by sessionId → SessionGroup (interval = sessionStart..sessionEnd, falling back to min(start)..max(end))
bucket groups by dayKey(group.start, tz)
per day: sort groups by start; sweep: a group joins the current slot if group.start < slot.end, else start a new slot; slot.end = max(end)
recommended = most items; tie → earliest min(item.start); alternatives = the rest
items inside a group: timed items by start, then untimed items
items without sessionId or start → unscheduled
nowItem = first item of now.recommended whose end > now
```

- [ ] **Step 1: Write failing tests:**
  - Two sessions 10:00–11:30 Eastern in different rooms with 3 and 1 items form 1 slot; the recommended one has 3 items and there is 1 alternative.
  - A workshop 09:00–12:30 overlapping both makes all three sessions one slot.
  - A 13:00 session forms a second slot.
  - Ties go to the group with the earlier first talk.
  - **Review Focus 2:** an item at `2026-11-11T03:30:00Z` lands on day `2026-11-10`.
  - **Review Focus 3:** an item with `sessionId: null` goes to `unscheduled`.
  - `nowNext` at 10:14 Eastern on Nov 10 gives `now` = the 10:00 slot and `nowItem` = the first followed talk whose end is after 10:14. On Nov 20 it returns `null`.
- [ ] **Step 2:** Run `npx vitest run test/schedule.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: schedule slot grouping and now/next`.

### Task 10: My Papers page (itinerary + Now/Next)

**Files:**
- Create: `src/my-papers.md`, `src/components/itinerary.js`, `src/components/nowNext.js`
- Test: `test/itinerary.test.js`

**Interfaces:**
- Consumes: Tasks 7, 8 (`PapersList`) and 9.
- Produces: `renderItinerary({days, unscheduled}, {tz, onUnfollow}) -> HTMLElement`, which has day tabs and one `<details>` per slot whose summary reads `📍 <room> — <sessionName> <badge count>`, and expands to the papers plus "⚠ also" alternatives (each its own `<details>`). `renderNowNext(result, {tz}) -> HTMLElement` shows a NOW card (room, session, until-time, count, `next up: <nowItem.title>`) and the next-slot cards with conflict markers.

- [ ] **Step 1: Write a failing test** (jsdom): from a 2-slot fixture, the itinerary renders 2 slot `<details>`. A slot with an alternative contains the text `⚠ also`. A day tab shows `Tue Nov 10`.
- [ ] **Step 2:** Run. Expected: FAIL. Then implement until it PASSES.
- [ ] **Step 3:** Assemble `src/my-papers.md`:
  - the followed list (search, sort by time/room/addedOn/title/reason, unfollow), using `PapersList` with reason and addedOn in the preamble
  - a "no longer in program" list of `missing` entries
  - JSON export and import
  - Now/Next by default when `matchMedia("(max-width: 640px)")` matches and `nowNext(...)` is not `null`, otherwise the itinerary, plus a toggle between the two
- [ ] **Step 4:** In `npm run dev` with mobile emulation, use a temporary `?now=2026-11-10T15:14:00Z` override (kept as a debug query param) to confirm that the Now/Next card matches the mockup in `.superpowers/brainstorm/*/content/my-schedule.html`.
- [ ] **Step 5:** Commit `feat: My Papers page with itinerary and now/next`.

### Task 11: Share link + QR

**Files:**
- Create: `src/lib/share.js`, `src/components/shareDialog.js`
- Modify: `src/my-papers.md`
- Test: `test/share.test.js`

**Interfaces:**
- Consumes: `shortId` on papers (Task 2); store `merge`/`replace` (Task 7).
- Produces: `encodeShareHash(shortIds: string[]) -> string` (`"#follow=a1b2c3d4.e5f6a7b8"`; `""` when empty), `decodeShareHash(hash: string) -> string[]`, `resolveShortIds(shortIds, papers) -> {ids: string[], unknown: string[]}`, `renderShareDialog(url) -> HTMLElement` (link with copy button plus a QR code drawn by `qrcode`'s `toCanvas`).

- [ ] **Step 1: Write failing tests:** round-trip `decodeShareHash(encodeShareHash(x))` equals `x`. **Review Focus 5:** `decodeShareHash("")`, `"#"` and `"#other=1"` each return `[]`; `decodeShareHash("#follow=..a1b2c3d4..")` returns `["a1b2c3d4"]`; `resolveShortIds(["zzzzzzzz"], papers)` returns `unknown: ["zzzzzzzz"]`. A 50-id hash is ≤ 460 characters.
- [ ] **Step 2:** Run `npx vitest run test/share.test.js`. Expected: FAIL. Then implement until it PASSES.
- [ ] **Step 3:** Wire it into `my-papers.md`:
  - a "Send to my phone" button opens the dialog
  - when the page loads with a `#follow=` hash, show a banner "N papers shared with you (M unknown) — Merge / Replace / Ignore"; each choice gives the papers the reason `📱 shared` and then clears the hash with `history.replaceState`
- [ ] **Step 4:** Check by hand: scan the QR with a phone against `npm run dev` on the LAN (`observable preview --host 0.0.0.0`) and confirm the merge works.
- [ ] **Step 5:** Commit `feat: share followed papers via link and QR`.

### Task 12: Deploy + docs

**Files:**
- Create: `scripts/deploy.sh`, `README.md`
- Modify: `CLAUDE.md` (replace the "Status" section with real commands)

- [ ] **Step 1:** `scripts/deploy.sh` runs `CONFERENCE=${1:-ieeevis2026} npm run build`, then `rsync -avz --delete -e "ssh -i /Users/aguerra/Dropbox/dutoVizNew.pem" dist/ ubuntu@johnguerra.co:<deployPath from config>/`. It reads `deployPath` with `node -e`.
- [ ] **Step 2:** Write a README covering what the site is, the pipeline commands (Tasks 2–3), `npm run dev/test/build`, deploying, and how to add a conference (config + fetcher emitting the §5.2 format).
- [ ] **Step 3:** Update CLAUDE.md: commands, a single-test example (`npx vitest run test/schedule.test.js -t "workshop"`, `.venv/bin/pytest pipeline/tests/test_fetch_ieeevis.py::test_parse_paper`), and the data flow.
- [ ] **Step 4:** Run `npm test && npm run lint && .venv/bin/pytest pipeline`. Expected: all green.
- [ ] **Step 5:** Ask John before running `scripts/deploy.sh` (it publishes to his server). After he confirms, open https://johnguerra.co/viz/ieeevis2026Papers/ on desktop and on a phone.
- [ ] **Step 6:** Commit `docs: deploy script, README, CLAUDE.md commands` and push.
