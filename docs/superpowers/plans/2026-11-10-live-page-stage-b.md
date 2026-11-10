# Live Page, Stage B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen: native). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make ratings travel and show everywhere, and fold in the deferred review fixes.
- **Ratings travel:** ratings go into Export / Import JSON.
- **Ratings show everywhere:** "★n" marks on paper rows, and stars in paper details on every page.
- **Deferred fixes:** the Live page minors (#204 review) and the map-legend minors (#202 review).

**Architecture:**
- **Ratings in export/import:** follow the notes pattern (`src/lib/notes.js` merge + `myPapersFile.js`).
- **Row marks:** follow `bindNoteMarkers` (a DOM binder that marks any rendered paper row).
- **Stars in details:** the details panel takes a `ratings` store and renders `starRating` next to "📝 My note".

**Tech Stack:** Observable Framework 1.13, htl, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-10-live-page-design.md` (Stage B section; ratings storage rules). Review minors are in PR #204's and PR #202's bodies.

**Worktree:** `/Users/aguerra/workspace/papersNavigator-b`, branch `issue-203-stage-b` (from `main` 1c6ac6e).

## Global Constraints

- **Export/import is backward compatible.** Export stays `version: 2`, with an optional `ratings` field (`{paperId: 1..5}`). Files without the field import as before. Older versions ignore the field.
- **On import, the local rating wins** over an incoming one. Ratings are merged even on Replace, like notes. Undo restores the ratings exactly as they were.
- **Ratings are never put in share links or URLs.**
- **Vocabulary:**
  - Row marker "★4", with the title "Your rating: 4 of 5".
  - The details control is labelled "Your rating".
- **Shared files.** Only small edits to the shared pages (`src/index.md`, `src/my-papers.md`, `src/authors.md`, `src/live.md`): one line each to create or pass the ratings store and bind the markers. Styles go in the existing `/* #203 Live */` block.
- **Formatting.** Run Prettier only on the touched `.js`/`.css` files.

## Review Focus

1. **An exported file with `ratings` holding bad values** (6, "5", 0, nested objects). It imports with the bad entries dropped, never throws, and the rest of the import still works.
2. **The same paper rated in another tab while the details panel is open.** The stars follow the store.
3. **A paper row rendered later** ("Show n more", or a list redraw after a filter). It gets its "★n" marker without the list knowing about ratings.
4. **A legend category pinned, then the map redrawn** (filter or theme). The pin resets with the widget, and the legend shows no stale dimming.
5. **Esc with paper details open.** It closes the details first, as today; only with nothing else open does it clear the legend pin.

---

### Task 1: Ratings in Export / Import

**Files:**
- Modify: `src/lib/ratings.js`, `src/lib/myPapersFile.js`, `src/my-papers.md` (the export/import cells)
- Test: `test/ratings.test.js`, `test/myPapersFile.test.js`

**Interfaces:**
- Produces:
  - `mergeRatings(current, incoming) → {ratings, added}`: entries of `cleanRatings(incoming)` whose id is not already in `current`.
  - `store.merge(incoming) → {added, undo}`: `undo` removes only the ratings it added that are still unchanged.
  - `exportMyPapers({..., ratings = {}})` puts `ratings` in the JSON.
  - `parseMyPapersFile` returns `ratings: cleanRatings(data.ratings)`, or `{}` for the old list format.
  - `exportNote(rules, notes, ratings = {})` mentions "your ratings" when any exist. Example: "Includes your notes and your ratings".
  - `importedRatingsText(added) → string`: " · 3 ratings added", or "" when none.

- [ ] **Step 1: Failing tests:**
  - `mergeRatings({a: 2}, {a: 5, b: 4, c: 9})` → `{ratings: {a: 2, b: 4}, added: 1}`
  - the store's `merge` then `undo()` restores the value. A rating changed after the merge survives undo.
  - an export round-trips `ratings`
  - parsing `{followed: [], ratings: {x: 6, y: 3}}` gives `ratings: {y: 3}`
  - an old plain-list file gives `ratings: {}`
  - `exportNote([], {}, {a: 1})` → "Includes your ratings"
- [ ] **Step 2:** Run `npx vitest run test/ratings.test.js test/myPapersFile.test.js`. Expect FAIL.
- [ ] **Step 3:** Implement. In `my-papers.md`:
  - create `ratingsStore = createRatingsStore(conference.id)`
  - pass `ratings: ratingsStore.value` to `exportMyPapers` and `exportNote`
  - in the import's `run`, call `ratingsStore.merge(parsed.ratings)` next to the notes merge, fold its undo into `undo`, and append `importedRatingsText`
  - add ", n ratings" to the import's `contents` line
- [ ] **Step 4:** Expect PASS.
- [ ] **Step 5:** Commit `"Ratings in Export / Import JSON (#203 Stage B)"`.

### Task 2: "★n" on paper rows

**Files:**
- Create: `src/components/ratingMarkers.js`
- Modify: `src/index.md`, `src/my-papers.md`, `src/authors.md` (bind next to `bindNoteMarkers`)
- Test: `test/ratingMarkers.test.js`

**Interfaces:**
- Produces: `bindRatingMarkers(root, ratings) → stop()`.
  - On every `.paper[data-paper-id]` and `.itinerary-item[data-paper-id]` row under `root`, including rows added later (use a `MutationObserver`, as `bindNoteMarkers` does), it adds `<span class="rating-marker" title="Your rating: 4 of 5">★4</span>`.
  - **Where it goes:** in `.paper-head`, right after the title link for list rows; after the title for itinerary items.
  - It follows the store: it updates the text or removes the marker.

- [ ] **Step 1: Failing tests (jsdom):**
  - a row for a rated paper gets "★4" with the title text
  - a row appended later is marked
  - `ratings.set(id, 0)` removes the marker; `set(id, 2)` updates it to "★2"
  - `stop()` disconnects the binder
- [ ] **Step 2:** Run `npx vitest run test/ratingMarkers.test.js`. Expect FAIL.
- [ ] **Step 3:** Implement. Bind it on the same roots as `bindNoteMarkers` (`.explore-list`, `.mp-list`, `.mp-schedule`, `.author-page`). Each page creates a `createRatingsStore(conference.id)` and disposes it on invalidation.
- [ ] **Step 4:** Expect PASS.
- [ ] **Step 5:** Commit `"★ marks on rated paper rows (#203 Stage B)"`.

### Task 3: Stars in paper details

**Files:**
- Modify: `src/components/paperDetail.js` (new option `rating = null`, an element shown before `note`), `src/components/paperPanel.js` (new option `ratings = null`), and the four pages' `paperPanel(...)` calls (`ratings: ratingsStore`)
- Test: `test/paperDetail.test.js`, `test/paperPanel.test.js`

**Interfaces:**
- Consumes: `starRating` (`src/widgets/starRating.js`).
- Produces: `paperPanel(key, {..., ratings})`. With `ratings`, it renders:

  ```html
  <div class="paper-detail-rating"><span class="label">Your rating</span>{starRating}</div>
  ```

  - The stars are bound to `ratings`: input calls `ratings.set(id, value)`, and the stars follow the store's `input` events.
  - Its listener is removed in `el.dispose()`.
  - Without `ratings`, nothing changes.

- [ ] **Step 1: Failing tests:**
  - the panel with a fake ratings store `{p: 3}` shows 3 pressed stars
  - clicking star 5 calls `set("p", 5)`
  - a store change updates the stars
  - without `ratings`, there's no `.paper-detail-rating`
- [ ] **Step 2:** Run `npx vitest run test/paperDetail.test.js test/paperPanel.test.js`. Expect FAIL.
- [ ] **Step 3:** Implement and wire the four pages.
- [ ] **Step 4:** Expect PASS.
- [ ] **Step 5:** Commit `"Stars in paper details on every page (#203 Stage B)"`.

### Task 4: Live page fixes (#204 review minors)

**Files:**
- Modify: `src/components/quickNote.js`, `src/components/liveBreak.js`, `src/components/liveSession.js`, `src/live.md`, `src/style.css` (Live block), `observablehq.config.js` (tab bar indentation)
- Test: `test/starRating.test.js` (quickNote), `test/liveBreak.test.js`, `test/liveSession.test.js`

**Interfaces / behavior:**
- **`quickNote` grows to fit an existing multi-line note once connected:**
  - calls `grow()` in `requestAnimationFrame` after creation, and on store updates
  - test: with a fake rAF, a note "a\nb\nc" sets `style.height` after a frame
- **`renderBreakView`, last slot of the day:** with `now` set and no `next`, it says "Nothing after this today" instead of "No more sessions today". Test.
- **Switch room on short phones:**
  - the bar is not sticky while open: `.live-switch[open] { position: static; }`
  - picking a room closes it
  - test: clicking an option sets `details.open = false` before `onSwitch`
- **Add-to-My-Papers reason:** "★ Added on Live" (`live.md`).
- **Indentation:** the tab bar `Live` link is indented like its siblings in `observablehq.config.js`.

- [ ] **Step 1:** Write the failing tests above. Run them and expect FAIL.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** Expect PASS.
- [ ] **Step 4:** Commit `"Live page polish from the #204 review (#203 Stage B)"`.

### Task 5: Map legend fixes (#202 review minors)

**Files:**
- Modify: `src/widgets/brushableScatterPlot.js`, `src/lib/paperLabels.js`, `src/widgets/paperLabels.js`, `src/index.md` (Esc)
- Test: `test/charts.test.js`, `test/paperLabels.test.js`

**Interfaces / behavior:**
- **The legend shows the pick.** `interactiveLegends` also sets the symbols' and labels' `update.opacity` to `{signal: "legendPick == null || datum.value === legendPick ? 1 : 0.35"}`, keeping any existing encode. Test on the patched spec object.
- **Labels follow the pick.** `labelFilter({..., keep = null})` (`keep` is an extra predicate or null) ANDs `keep(d)`. The widget passes `keep` while `legendPick` is set: the paper's category, as the map colors it (one of the highlighted categories, else Other), must equal the pick. It reschedules labels on `legendPick` changes.
  - Test `labelFilter` with `keep`.
  - Test that the widget calls the labels with the pick, through its exposed `labelKeep()`, which returns null without a pick.
- **Esc clears a pinned category.** The widget exposes `clearCategory()` (pinned = null, highlight null). In `index.md`'s Esc handler: when `shouldUnpinOnEscape` is true and no paper is pinned, call `mapInput.clearCategory?.()`. Test `clearCategory` in charts.test.js.

- [ ] **Step 1:** Write the failing tests above. Run them and expect FAIL.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** Expect PASS.
- [ ] **Step 4:** Commit `"Map legend: show the pick, labels follow it, Esc clears it (#203 Stage B)"`.

### Task 6: Docs and verification

- [ ] **Step 1: Update `DESIGN.md`:**
  - the ★n row marker and the "Your rating" control in paper details
  - ratings in Export / Import (Data & privacy part)
  - the legend's pick dimming and Esc
  - the Live wording fixes

  Then run `npx @google/design.md lint docs/DESIGN.md` and expect 0 errors. Update the About page text if it describes what Export contains (grep `src/lib/about.js` for "Export").
- [ ] **Step 2: Run the full checks:** `npm test`, `npm run lint` and `npm run build`. All must pass.
- [ ] **Step 3: Browser check** at 400×860 and 1600×1000:
  - rate in Live
  - "★n" shows on Explore and My Papers rows
  - stars appear in details on Explore, and changing them there updates Live
  - Export, then Import into a fresh profile, brings the ratings
  - map legend: the pick dims the other entries, paper labels show only on colored papers, and Esc clears the pick
- [ ] **Step 4:** Commit. Then the independent whole-branch review, fixes, a PR (`Part of #203`), and a deploy only with John's go-ahead.
