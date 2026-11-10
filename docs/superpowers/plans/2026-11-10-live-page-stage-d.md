# Live Page, Stage D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native). Steps use `- [ ]`.

**Goal:**
- **"Soon"**: a floating button with a badge that opens a sheet (phone) or popover (desktop) with "Worth moving for" (the next two talks per other room that are in My Papers or have an award; "Go there →") and "On now". It replaces the "Switch room" list.
- **👎 "Not for me"**, a separate store.
- **Attended papers**: automatic by check-in overlap of 5 minutes or more on the real clock, plus manual; "Papers I attended"; ✓ marks; export/import.

**Architecture:**
- **Pure logic in `src/lib/`:** `live.js` gains `worthMoving`, plus the new stores `disliked.js` and `attended.js`.
- **UI:**
  - `src/components/soonWidget.js` replaces `switchBar` in `liveSession.js`.
  - `src/widgets/starRating.js` stays as it is. A new `src/components/verdict.js` combines the stars and 👎 and is used by the session rows and the details panel.
  - `src/components/attendedPapers.js` is the "Papers I attended" list.
  - `bindRatingMarkers` learns 👎 and ✓.
- **Wiring:** `src/live.md`, plus small edits to the other pages.

**Spec:** `docs/superpowers/specs/2026-11-10-live-page-design.md`, Stage D section (binding).

**Worktree:** `/Users/aguerra/workspace/papersNavigator-d`, branch `issue-208-live-stage-d` (from `main` 3d7d0b9; merge `main` 8aa84e1 in before the PR).

## Global Constraints

- **Window.** Per room, the window is the next two talks after the talk on now, plus a talk that started less than 2 minutes ago ("just started"). Only timed talks count.
- **Badge.** It counts qualifying rows in **other** rooms. Rows in the current room show "this room" and have no Go button.
- **Reasons.**
  - My Papers: the entry's `manual`, shown as the chip "★ My Papers"; each rule reason, from `entry.reasons` minus the manual ones, as written (they already carry 👥/🏫/🔍).
  - Award: "🏆 Best", "🏅 Honorable mention" or "🎖️ Award", from `AWARD_TIERS`.
- **Sort:** any My Papers reason first, then award, then start time.
- **Storage keys:**
  - `papersNavigator:<id>:disliked`: `{id: true}`
  - `papersNavigator:<id>:attended`: `{id: {at, how: "auto" | "manual"} | {off: true}}`
  - Both are added to the About storage list.
- **Export/import.** Export gets optional `disliked` and `attended` fields (version 2). They are merged on import with yours winning, are part of undo, and appear in the import offer and status ("n not for me", "n attended").
- **Mutual exclusion.** Setting stars clears 👎 for that paper, and setting 👎 clears the stars. The verdict control is where this happens.
- **Automatic attendance.**
  - It runs only when `clock.value.override` is false (the real clock).
  - It marks a talk of the checked-in session whose overlap with [checkIn.at, now] is 5 minutes or more.
  - It never marks a paper with `{off: true}`.
- **The sheet never rebuilds the session view.** It updates in place on ticks and store changes. Focus moves into it on open and back to the button on close. Esc, ✕, and a click outside or on the dim close it.
- **Formatting.** Small edits to shared pages. Prettier only on the touched `.js`/`.css` files.

## Review Focus

1. **The last talk of a session, or a slot whose other rooms are posters or workshops (untimed).** Empty rows and "On now" lines without a talk show "No timed talks". There's no badge, and nothing crashes.
2. **Two reasons on one talk** (a hand-added paper that is also a watched author's and has an award). One row, all the chips, sorted as My Papers.
3. **The phone sleeping through a session and then waking.** The talks slept through are auto-marked once on the next tick. A talk the user unticked is never re-marked.
4. **A dislike set in paper details while the Live stars are showing.** Both controls follow the store, and the stars clear.
5. **An imported file with `attended` entries for papers already `{off: true}` here.** The local entry wins.

---

### Task 1: `worthMoving` (pure)

**Files:** `src/lib/live.js`, `test/live.test.js`

**Interfaces:**
- **`reasonChips(paper, entry)`** → `string[]`
  - "★ My Papers" when `entry?.manual`
  - plus the rule reasons (`entry.reasons` that start with 👥, 🏫 or 🔍)
  - plus the award chip
- **`worthMoving(slot, session, at, mine: Map<id, entry>)`** → `{rows, onNow, badge}`
  - **`rows`:** `[{paper, session, minutes, state: "soon" | "just started", here: boolean, chips}]`, sorted as in Global Constraints.
  - **`onNow`:** `[{session, talk | null, chips}]`, one per other session in the slot.
  - **`badge`:** the count of rows with `!here`.

- [ ] **Step 1: Failing tests**, with a slot of 3 sessions of 12-minute talks and the time 10:40:
  - **Window:** the next two talks per room are in the window, and the third is not.
  - **"Just started":** a talk that started at 10:39 is in, with state "just started". One that started at 10:36 is not, and shows in `onNow`.
  - **Rows:** only talks with chips. "this room" rows have `here: true` and aren't counted in the badge.
  - **Sort:** My Papers, then award, then time.
  - **Two reasons:** a talk with both gets both chips.
  - **Untimed sessions:** they contribute no rows, and their `onNow` talk is null.
  - **Badge:** 0 when nothing qualifies.
- [ ] **Step 2:** Run `npx vitest run test/live.test.js`. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Expect PASS.
- [ ] **Step 5:** Commit.

### Task 2: Disliked and attended stores, export/import

**Files:**
- Create: `src/lib/disliked.js`, `src/lib/attended.js`
- Modify: `src/lib/myPapersFile.js`, `src/my-papers.md`, `src/lib/about.js`
- Test: `test/disliked.test.js`, `test/attended.test.js`, `test/myPapersFile.test.js`

**Interfaces:**
- **`createDislikedStore(id, storage, events)`:**
  - `.has(paperId)`, `.set(paperId, bool)`, `.value`, `.merge(incoming) → {added, undo}`, `.dispose()`
  - re-reads storage before each write
  - `cleanDisliked(obj)` keeps only `true` values
- **`createAttendedStore(id, storage, events)`:**
  - `.isAttended(paperId)`
  - `.set(paperId, on: boolean)`: on gives `{at: now, how: "manual"}`, off gives `{off: true}`
  - `.markAuto(paperIds, now)`: skips any id that has an entry
  - `.value`, `.merge(incoming) → {added, undo}`, `.dispose()`
  - `cleanAttended(obj)` keeps only valid entries
- **`autoAttended(session, checkIn, now, {minMinutes = 5})`** → `paperIds[]`: the talks whose overlap with [checkIn.at, now] is 5 minutes or more.
- **Export/import:**
  - `exportMyPapers({..., disliked, attended})`
  - `parseMyPapersFile` returns `disliked` and `attended`, cleaned
  - `importedDislikedText(n)` / `importedAttendedText(n)`: " · n not for me added" / " · n attended added"
- **`my-papers.md`:** export, import (merge, undo, offer, status) and `exportNote` ("your ratings and attended papers").

- [ ] **Step 1: Failing tests:**
  - **The cleaners:** bad entries are dropped.
  - **Merge:** yours win. Undo removes only the unchanged entries it added.
  - **`markAuto`:** skips `{off: true}` and existing entries.
  - **`autoAttended`:**
    - a 12-minute talk with 5 minutes or more of overlap is in
    - a check-in 8 minutes into a 12-minute talk leaves 4 minutes of overlap, so it's out
    - talks that ended before the check-in are out
    - a phone that slept through 3 talks while checked in gets all 3 at the next tick
  - **The export file:** round-trips; old files give `{}`.
  - **The About test** stays green with the 2 new keys.
- [ ] **Steps 2–5:** FAIL, implement, PASS, commit.

### Task 3: The Soon widget (replaces Switch room)

**Files:**
- Create: `src/components/soonWidget.js`
- Modify: `src/components/liveSession.js` (remove `switchBar`; mount the widget; `setNow` also updates the widget)
- Modify: `src/style.css` (Live block)
- Test: `test/soonWidget.test.js`, `test/liveSession.test.js` (replace the Switch room tests)

**Interfaces:**
- **`soonWidget({slot, session, at, mine, tz, onSwitch, onOpen, detailsHref})`** → an element with:
  - a `button.soon-button`: "Soon", plus a `.soon-badge` when the badge is above 0, with `aria-expanded` and `aria-controls`
  - a `.soon-panel` (`role="dialog"`, `aria-label="Worth moving for"`, hidden): a "✕" close, `<h2>Worth moving for</h2>`, then the rows or "Nothing worth moving for in the next two talks", then `<h3>On now</h3>` with one line per other room
  - **each row:** "in 8 min · 10:48 · 📍 Room" (or "just started"), the pill, award and title link, the chips, and "Go there →" (only when `!here`, calling `onSwitch(session)` and closing the panel), or "this room"
  - **each On-now line:** a `<details>` with the talk now and its chips, expanding to that room's talks and "Go there →"
  - `.update(at, mine)` re-renders the contents in place, keeping the open state
  - `.dispose()`
  - Esc, ✕ and a click on `.soon-dim` close it. Focus moves to the panel heading on open and back to the button on close.
- **Phone (under 640px):** fixed bottom sheet, `max-height: 60vh`, scrolling, above the tab bar, with a `.soon-dim` overlay.
- **Desktop:** an absolutely positioned popover under the button, `width: 320px`, `max-height: 70vh`.
- **The button:** fixed bottom-right above the tab bar on phones; sticky top-right of the session header on desktop.

- [ ] **Step 1: Failing tests (jsdom):**
  - the badge count and its absence at 0
  - opening and closing (`aria-expanded`, hidden, Esc, ✕, dim), with focus returning to the button
  - rows: text, chips, Go there calls `onSwitch` and closes; "this room" rows have no Go button
  - `update` changes the rows while the panel stays open
  - On now has a line per other room
  - `liveSession` has no `.live-switch` and mounts the widget
- [ ] **Steps 2–5:** FAIL, implement, PASS, commit.

### Task 4: 👎 Not for me

**Files:**
- Create: `src/components/verdict.js`
- Modify: `src/components/liveSession.js` (stars to verdict), `src/components/paperPanel.js` (`ratingControl` to verdict; new `disliked` option), `src/components/ratingMarkers.js` (👎 marker; `disliked` option), `src/components/ratedPapers.js` ("Not for me" section), `src/live.md` and the pages (pass the disliked store), `src/style.css`
- Test: `test/verdict.test.js`, `test/ratingMarkers.test.js`, `test/ratedPapers.test.js`, `test/paperPanel.test.js`

**Interfaces:**
- **`verdict(paper, {ratings, disliked, label})`:** an element with the stars plus `button.not-for-me`, labelled "Not for me", showing "👎", with `aria-pressed`.
  - A star press calls `ratings.set(id, n)` and `disliked.set(id, false)`.
  - 👎 calls `disliked.set(id, !on)` and `ratings.set(id, 0)`.
  - It follows both stores. `.dispose()`.
- **`bindRatingMarkers(root, ratings, {disliked, attended} = {})`:** "★n", or "👎" (title "Not for me"), then "✓" (title "You attended").
- **`renderRatedPapers(..., {dislikedIds = []})`:** a "Not for me" section after the starred papers. The 4★ filter hides it.

- [ ] **Steps 1–5:** test the exclusion both ways, the markers, the section and the details control; FAIL, implement, PASS, commit.

### Task 5: Attended

**Files:**
- Create: `src/components/attendedPapers.js`
- Modify: `src/components/liveSession.js` ("✓ Attended" toggle per talk), `src/components/paperPanel.js` ("I was there" toggle; `attended` option), `src/live.md` (auto marking on each tick when not overridden; the attended list; stores), the pages (markers), `src/style.css`
- Test: `test/attendedPapers.test.js`, `test/liveSession.test.js`, `test/paperPanel.test.js`

**Interfaces:**
- **`attendedToggle(paper, attended, label)`:** a `button` with `aria-pressed`, following the store.
- **`renderAttendedPapers(papers, {attended, ratings, disliked, notes, tz, onOpen, detailsHref})`:**
  - grouped by day (`formatDay`), in time order
  - each row: the time, the pill, the title link, "★n" or "👎" or "Rate it?" (a link that opens the details), and the 📝 note
  - empty state: "Papers you attend show up here: check in with Going here, or tap I was there."

- [ ] **Steps 1–5:** test the toggle both ways, the list's grouping, order and "Rate it?", the empty state, and the details toggle; FAIL, implement, PASS, commit.

### Task 6: Docs, merge main, verify, review

- [ ] **Step 1: Docs.**
  - **`DESIGN.md`:** the Soon widget, 👎, ✓/attended, and the emoji table rows 👎 and ✓. Lint with 0 errors.
  - **About:** the new storage keys (Task 2) and a sentence on attended.
- [ ] **Step 2: Merge** `main` (8aa84e1) into the branch and resolve.
- [ ] **Step 3: Full checks:** `npm test`, `npm run lint` and `npm run build`.
- [ ] **Step 4: Browser check** at 400×860 and 1600×1000 (Wed 10:40, checked in), using the preview's own storage only:
  - Soon: the badge, the sheet and popover, Go there
  - 👎 ↔ stars
  - an auto-attended talk after a tick (real clock: simulate by checking in at a past time through the check-in store)
  - "Papers I attended"
- [ ] **Step 5:** Push (HTTPS), then the independent review, fixes, a PR (`Closes #208`), and a deploy with John's go-ahead.
