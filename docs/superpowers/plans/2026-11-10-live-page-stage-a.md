# Live Page, Stage A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a phone-first **Live** page with these parts:
- a time control: now, or a time set by hand
- the next slot's parallel sessions, ranked by how many of My Papers each has
- "Later today"
- "Going here" and "Switch room"
- a checked-in session view with a 1–5 ★ rating and a quick note per paper
- "Papers I rated"

**Architecture:**
- **Pure logic in `src/lib/`:** the slots of the whole program, the ranking, the clock offset, check-in, and ratings.
- **Rendering in `src/components/`** (break view, session view, rated list, clock control) and `src/widgets/` (star rating).
- **`src/live.md`** wires the stores to the components, the same way `my-papers.md` does.
- **Existing parts reused:** `groupIntoSlots` for slots, the notes store for quick notes, `typePill` and `awardMark` for paper marks, and the existing paper details panel and its `?paper=` route.

**Tech Stack:** Observable Framework 1.13, htl 0.3.1, Vitest + jsdom, ESLint/Prettier.

**Spec:** `docs/superpowers/specs/2026-11-10-live-page-design.md` (Stage A section, plus everything it references)

**Worktree:** `/Users/aguerra/workspace/papersNavigator-live`, branch `issue-203-live-page`. Run `npm ci` there first.

## Global Constraints

- **Conference timezone.** Times and day boundaries use the conference timezone via `src/lib/time.js` (`dayKey`, `formatTime`, `formatDay`), never the device's.
- **Storage keys** (localStorage, this device only, never in URLs or share links):
  - `papersNavigator:<conferenceId>:ratings`: `{paperId: 1..5}`
  - `papersNavigator:<conferenceId>:liveCheckIn`: `{sessionId, at}`
  - `papersNavigator:<conferenceId>:liveClock`: `{offsetMs, day}`
- **Existing data is untouched.** Never change existing stores, keys, paper ids, `conferences/*/data/`, or the export format. Ratings in export/import are Stage B.
- **Vocabulary** (DESIGN.md):
  - Buttons: "Add to My Papers", "Going here", "Leave session", "Switch room", "Back to now".
  - Rating buttons are labelled "Rate n of 5". A rating shows as "★4" outside the stars control.
- **Phone first.** Works at 400×860 with no horizontal scroll and 44px tap targets. On desktop: a single column, max-width 720px, centered.
- **Hot shared files.** `src/style.css` gets only an appended `/* #203 Live */` block. Do not edit `src/index.md`.
- **Formatting.** Run `npx prettier --write` only on the `.js`/`.css` files you touch, never on `src/*.md`.
- **Session cards.** Show 10 papers before "Show all n".
- **Already done:** My Papers' Now card already shows the running session's name (`src/components/nowNext.js`). No task for it.

## Review Focus

1. **Time between days or after the last slot of the day.** With no slot left today, the break view says "No more sessions today" and offers the next day's first slot. It is never an empty screen.
2. **A check-in that has ended, or that points at a session no longer in the program.** Fall back to the break view. Never throw on a stale stored `sessionId`.
3. **Corrupt or hand-edited localStorage** (ratings not 1–5, non-JSON, a missing check-in field). The stores drop bad entries and keep the rest, like `cleanNotes`.
4. **The hand-set time and a day change.** An offset stored on Tuesday is ignored on Wednesday's first load, and the page shows real time.
5. **Sessions whose papers have no own time** (workshops and posters have only `sessionStart`). They still appear in slots and still rank. The "talk now" highlight is simply absent.

---

### Task 1: Ratings store

**Files:**
- Create: `src/lib/ratings.js`
- Test: `test/ratings.test.js`

**Interfaces:**
- Produces:
  - `cleanRatings(obj) → {id: 1..5}`. Keeps only integer values 1–5 under non-empty string keys.
  - `createRatingsStore(conferenceId, storage = globalThis.localStorage, events = globalThis)` → an EventTarget with:
    - `.value` (`{id: n}`)
    - `.get(id)` → number or 0
    - `.set(id, n)`: n = 0 deletes, values outside 1–5 are ignored
    - `.dispose()`
  - It dispatches `input` on change and follows `storage` events for its key, the same as `createNotesStore` (`src/lib/notes.js:76`).

- [ ] **Step 1: Write failing tests** in `test/ratings.test.js` (use an in-memory storage stub like the one in `test/notes.test.js`):
  - `cleanRatings({a: 4, b: 0, c: 6, d: "5", e: 2.5, "": 3})` → `{a: 4}`
  - `set("p1", 4)` then `get("p1") === 4`. The stored JSON under `papersNavigator:ieeevis2026:ratings` is `{"p1":4}`. One `input` event fires.
  - `set("p1", 0)` deletes the key. `set("p1", 7)` changes nothing and fires no event.
  - Non-JSON in storage gives `value` `{}` and no throw.
  - A `storage` event for the key reloads `value`.
- [ ] **Step 2:** Run `npx vitest run test/ratings.test.js`. Expect FAIL (module missing).
- [ ] **Step 3:** Implement `src/lib/ratings.js`, mirroring the structure of `createNotesStore`.
- [ ] **Step 4:** Run `npx vitest run test/ratings.test.js`. Expect PASS.
- [ ] **Step 5:** Commit `"Live: ratings store (#203)"`.

### Task 2: Live clock (offset, cleared on a new day)

**Files:**
- Create: `src/lib/liveClock.js`
- Test: `test/liveClock.test.js`

**Interfaces:**
- Produces:
  - `liveTime(stored, now, tz) → {at: Date, override: boolean}`. `stored` is `{offsetMs, day} | null`. The override applies only when `dayKey(now, tz) === stored.day`. Then `at = now + offsetMs`.
  - `createLiveClock(conferenceId, {tz, storage, now = () => new Date()})` → an EventTarget with:
    - `.value` (`{at, override}`)
    - `.setTo(date)`: stores `offsetMs = date − now()` and `day = dayKey(now(), tz)`
    - `.reset()`: removes the key
    - `.tick()`: recomputes `.value` and dispatches `input`
  - The page calls `tick()` every 30 s.

- [ ] **Step 1: Failing tests:**
  - Without anything stored, `liveTime(null, T, tz)` is `{at: T, override: false}`.
  - Stored `{offsetMs: 3_600_000, day: "2026-11-11"}` at `T = 2026-11-11T15:00Z` gives `at = 16:00Z`, `override: true`.
  - The same stored value at `T = 2026-11-12T15:00Z` gives `override: false`, `at = T`.
  - At `2026-11-12T03:00Z`, which is still Nov 11 in US/Eastern, the override still applies.
  - `setTo(new Date("2026-11-11T18:00Z"))`, with `now` fixed at 15:00Z, stores `offsetMs 10_800_000`. After `reset()`, `value.override` is false.
- [ ] **Step 2:** Run `npx vitest run test/liveClock.test.js`. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Expect PASS.
- [ ] **Step 5:** Commit `"Live: clock with a per-day offset (#203)"`.

### Task 3: Program slots, ranking, check-in

**Files:**
- Create: `src/lib/live.js`
- Test: `test/live.test.js`

**Interfaces:**
- Consumes: `groupIntoSlots(items, tz)` from `src/lib/schedule.js`. Its slots look like `{start, end, sessions: [{sessionId, sessionName, room, start, end, items}]}`, with times as numbers in ms.
- Produces:
  - `programDays(papers, tz)` → `groupIntoSlots(papers, tz).days` for **all** papers.
  - `slotsAt(days, at, tz) → {now: slot|null, next: slot|null, later: slot[], nextDay: {date, slot}|null}`:
    - `now` is the slot where `start <= at < end`.
    - `next` is the first slot today starting after `at`.
    - `later` is the slots after `next` today.
    - `nextDay` is the first slot of a later day, set only when `next` is null.
  - `rankSessions(slot, mineIds: Set) → [{...session, mine: number, recommended: boolean}]`:
    - sorted by `mine` descending, then `room` ascending
    - `recommended` is true only on the first session, and only when its `mine > 0`
  - `sessionSummary(session) → string`:
    - The pattern is `"7 papers · 2 Full · 1 Short · 🏆 1 · Perception, Uncertainty"`.
    - Type counts use the `typeShort` labels, largest first.
    - Award icons come from `AWARD_TIERS` (`src/lib/paperMeta.js`), one part per tier present, `"🏆 1"`.
    - Then up to 2 of the most common `clusterLabel` values, ties alphabetical.
    - Parts that would be empty are omitted. Use "paper" for 1.
  - `talkAt(session, at) → paper|null`: the item with `start <= at < end`.
  - `createCheckInStore(conferenceId, storage, events)` → EventTarget with:
    - `.value` (`{sessionId, at}` or null)
    - `.commit(sessionId, at: Date)`
    - `.leave()`
    - A bad stored value gives null.
  - `activeSession(checkIn, days, at, tz) → session|null`: the checked-in session when it is in today's slots and `at < session.end`, else null.

- [ ] **Step 1: Failing tests** with a small fixture of three sessions in one slot and one later slot:
  - **`rankSessions`:** with mine = {two papers in session B}, the order is B, then A and C by room. B is `recommended`. With mine = ∅, nothing is recommended.
  - **`sessionSummary`:** the exact string for a fixture session with 3 Full, 1 Short, one `awardTier: "best"`, and clusters `["Perception", "Perception", "Color"]`: `"4 papers · 3 Full · 1 Short · 🏆 1 · Perception, Color"`.
  - **`slotsAt`:**
    - during slot 1, `now` is slot 1 and `next` is slot 2
    - after the last slot, `next` is null and `nextDay` points to the next day
  - **`talkAt`:** finds the talk in progress. For papers with no `start`, it returns null.
  - **`activeSession`:**
    - returns the session while it runs
    - returns null once `at >= end`
    - returns null for an unknown `sessionId`
  - **Check-in store:** non-JSON or missing fields in storage give `value` null.
  - **Real data:** `programDays` on the real `conferences/ieeevis2026/data/papers.json` (read it with `fs`) has 15 slots in total, and at most 6 sessions in one slot.
- [ ] **Step 2:** Run `npx vitest run test/live.test.js`. Expect FAIL.
- [ ] **Step 3:** Implement `src/lib/live.js`.
- [ ] **Step 4:** Expect PASS.
- [ ] **Step 5:** Commit `"Live: program slots, session ranking, check-in (#203)"`.

### Task 4: Star rating widget and quick note

**Files:**
- Create: `src/widgets/starRating.js`, `src/components/quickNote.js`
- Test: `test/starRating.test.js`, `test/quickNote.test.js`

**Interfaces:**
- Produces:
  - `starRating(value: 0..5, {label})` is a reactive widget (reactivewidgets.org):
    - an element with `.value` (0–5) that dispatches `input` on change
    - 5 `<button type="button">`s with `aria-label="Rate n of 5"`, and `aria-pressed` on the stars up to `value`
    - a tap on the current value sets 0
    - group `role="group"` with `aria-label=label`
  - `quickNote(paper, {notes, delay = 500})`:
    - a one-line `<textarea rows="1" class="quick-note">` that grows with its content, placeholder "Quick note…", value `notes.get(paper.id)`
    - saves through `notes.set(paper.id, text)` `delay` ms after typing stops, and at once on blur
    - `.flush()` saves pending typing, `.dispose()` stops listening
    - follows the store's `input` events unless it has focus, the same as `renderPaperNote` (`src/components/paperNote.js`)

- [ ] **Step 1: Failing tests:**
  - Click star 4: `value === 4`, one `input` event, stars 1–4 have `aria-pressed="true"`.
  - Click star 4 again: `value === 0`.
  - The labels are "Rate 1 of 5" … "Rate 5 of 5".
  - `quickNote`: typing "great" then blur calls `notes.set("p1", "great")`. A store change from another tab updates the textarea when it isn't focused. (Use the fake store from `test/paperNote.test.js`.)
- [ ] **Step 2:** Run the two test files. Expect FAIL.
- [ ] **Step 3:** Implement both.
- [ ] **Step 4:** Expect PASS.
- [ ] **Step 5:** Commit `"Live: star rating widget and quick note (#203)"`.

### Task 5: Break view, Later today, clock control

**Files:**
- Create: `src/components/liveBreak.js`, `src/components/liveClockControl.js`
- Test: `test/liveBreak.test.js`

**Interfaces:**
- Consumes: Task 3 (`rankSessions`, `sessionSummary`) and `typePill` / `awardMark` from `src/widgets/paperMarks.js`.
- Produces:
  - `renderBreakView(slots: {now, next, later, nextDay}, {tz, mineIds, onGoing(session), onPickSlot(slot), onOpen(paper), detailsHref(paper)})`
    - It renders a "Now" section if `now`, then a "Next · 10:30" section, with one card per ranked session. Each card has:
      - the session name
      - 📍 room
      - start–end time
      - the count of your papers, shown large ("2 of yours"; 0 shows "0 of yours", muted)
      - the summary line
      - a `<details>` that expands into compact rows: pill, award, title link (`detailsHref`, a plain click calls `onOpen`), authors, and topic, with "In My Papers" on your papers
      - after 10 rows, "Show all n"
      - a "Going here" button calling `onGoing(session)`
    - The recommended card carries a "Recommended" label.
    - "Later today" lists one button per slot in `later`: `"14:00 · 5 sessions · 3 of yours"`, calling `onPickSlot(slot)`.
    - With no `next`: "No more sessions today", plus a `nextDay` button if there is one.
  - `liveClockControl(clock, {tz})`: an element with:
    - a `<input type="datetime-local">`, read and written in the conference timezone, which calls `clock.setTo` on change
    - while `clock.value.override` is true: the text "Set time: Wed 10:40" and a "Back to now" button calling `clock.reset()`

- [ ] **Step 1: Failing tests (jsdom):**
  - Cards come in `rankSessions` order, and only the first has "Recommended".
  - A session with 12 papers shows 10 rows and then "Show all 12". Clicking it shows 12.
  - "Going here" calls `onGoing` with the session.
  - A "Later today" button calls `onPickSlot`.
  - With `next: null` and a `nextDay`, the view says "No more sessions today".
  - For the clock control, use a fake clock with `value.override = true`: the control shows "Back to now", and clicking it calls `reset`.
- [ ] **Step 2:** Run `npx vitest run test/liveBreak.test.js`. Expect FAIL.
- [ ] **Step 3:** Implement. Datetime conversion: build the `datetime-local` string from `dayKey(at, tz)` + `formatTime(at, tz)`. Parse it back by finding the UTC instant whose `dayKey` and `formatTime` in `tz` match. Put this as `zonedInput(at, tz)` / `fromZonedInput(str, tz)` in `src/lib/time.js`, with tests in `test/liveBreak.test.js`, including a round trip for `2026-11-11T14:05` in US/Eastern.
- [ ] **Step 4:** Expect PASS.
- [ ] **Step 5:** Commit `"Live: break view, later today, clock control (#203)"`.

### Task 6: Session view with Switch room

**Files:**
- Create: `src/components/liveSession.js`
- Test: `test/liveSession.test.js`

**Interfaces:**
- Consumes: Task 3 (`talkAt`, `rankSessions`), Task 4 (`starRating`, `quickNote`), Task 1 (ratings store).
- Produces: `renderSessionView(session, {slot, at, tz, mineIds, ratings, notes, onSwitch(session), onLeave(), onAdd(paper), onOpen(paper), detailsHref(paper)})`. It renders:
  - **Header:** the session name, 📍 room and time, and a "Leave session" button that calls `onLeave`.
  - **"Switch room" bar:**
    - a `<details>`, collapsed on phones, with summary "Switch room · n others"
    - one button per other session in `slot` (ranked): room, name, "n of yours", "Now: <title of talkAt>", and the next of your papers in that room with its time
    - a click calls `onSwitch(session)`
  - **One row per paper in talk order** with:
    - pill, award and title link
    - authors
    - `starRating` bound to `ratings`, so a change calls `ratings.set`
    - `quickNote`
    - "Add to My Papers", hidden for papers in `mineIds`, which calls `onAdd`
  - **The talk now** (`talkAt(session, at)`) has class `is-now`, and the view exposes `.scrollToNow()`.
  - **`.dispose()`** flushes and disposes the quick notes.

- [ ] **Step 1: Failing tests:**
  - Rows come in talk order, and the talk at `at` has `is-now`.
  - Clicking star 5 on row 2 calls `ratings.set(id, 5)`.
  - "Add to My Papers" is hidden for papers already in My Papers, and clicking it calls `onAdd`.
  - The Switch room bar lists the other sessions with "Now: <title>". Clicking one calls `onSwitch` with that session.
  - "Leave session" calls `onLeave`.
- [ ] **Step 2:** Run `npx vitest run test/liveSession.test.js`. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Expect PASS.
- [ ] **Step 5:** Commit `"Live: session view with ratings, quick notes, Switch room (#203)"`.

### Task 7: Papers I rated

**Files:**
- Create: `src/components/ratedPapers.js`
- Test: `test/ratedPapers.test.js`

**Interfaces:**
- Produces: `renderRatedPapers(papers, {ratings: {id: n}, notes: {id: text}, tz, minRating = 0, day = null, onFilter({minRating, day}), onOpen, detailsHref})`:
  - rated papers sorted by rating descending, then by `start ?? sessionStart`
  - each row: "★★★★☆" with the sr text "Rated 4 of 5", pill, award, title link, and the note when there is one
  - filters: a day select (the days of the rated papers, "All days") and a "4★ and up" checkbox
  - empty state: "Rate papers in a session and they show up here."

- [ ] **Step 1: Failing tests:**
  - Ordering by rating, then time.
  - `minRating: 4` hides 3★ papers.
  - `day` filters by `paper.day`.
  - The empty state text.
  - The note text appears on its row.
- [ ] **Step 2:** Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Expect PASS.
- [ ] **Step 5:** Commit `"Live: papers I rated (#203)"`.

### Task 8: The page, nav, offline, styles, docs

**Files:**
- Create: `src/live.md`
- Modify:
  - `observablehq.config.js`: `pages` gets `{ name: "Live", path: "/live" }` after My Papers; add the nav and tabbar links `./live` after `./my-papers`
  - `src/sw.js`: `PRECACHE_PAGES` gets `"./live.html"` after `"./my-papers.html"`; `VERSION` goes `"v4"` → `"v5"`
  - `src/style.css`: an appended `/* #203 Live */` block
  - `docs/DESIGN.md`: a Live page component entry; the ★ rating ("★4" outside the control) and the 💬 marker in Emoji & Iconography
- Test: `test/navigation.test.js` (expected hrefs), `test/sw.test.js` (expected precache list)

**Interfaces:**
- Consumes: Tasks 1–7, plus:
  - `createMyPapers` / `createFollowedStore` / `createRulesStore` (as in `src/my-papers.md:43-47`)
  - `createNotesStore`
  - `createPaperRoute` + `paperPanel` (as in `src/my-papers.md:512-528`)
  - `bindMyPapersBadge`
  - `addWithUndo(store, [p], "★ Rated on Live")` from `src/lib/selection.js`

- [ ] **Step 1: Update the expectations in `test/navigation.test.js` and `test/sw.test.js`** to include `./live` and `./live.html`. Run them and expect FAIL.
- [ ] **Step 2: Edit the config and `sw.js`.** Run the two tests and expect PASS. Check the 5 tabs at 400px in step 5.
- [ ] **Step 3: Write `src/live.md`.** It stays thin. Its cells:
  - the stores
  - the clock, ticked every 30 s
  - `days = programDays(papers, tz)`
  - `slots = slotsAt(days, clock.at, tz)`
  - `session = activeSession(checkIn, days, clock.at, tz)`
  - **Output order:** the clock control; then either `renderSessionView` (when `session`) or `renderBreakView`; then a "Papers I rated" section rendered by `renderRatedPapers`; then the paper details panel.
  - "Going here" and "Switch room" call `checkIn.commit(session.sessionId, clock.at)`.
  - After rendering the session view, call `.scrollToNow()` once per check-in.
- [ ] **Step 4: Styles** (appended block only):
  - session cards on `surface` with the `outline` hairline
  - the "of yours" count in `title-paper` size
  - `.is-now` row with a left `primary` rule
  - star buttons at 44px tap size, filled stars in `on-surface`
  - the Switch room bar sticky under the nav
  - at most 720px wide, centered
- [ ] **Step 5: Verify:**
  - Run `npm test`, `npm run lint` and `npm run build`. All must pass. `dist/live.html` exists and `dist/sw.js` contains `./live.html`.
  - Run `npx @google/design.md lint docs/DESIGN.md`: 0 errors.
  - In Chrome at 1600×1000 and 400×860, light and dark, on `live.html`, using the clock control to set Wed Nov 11 10:40:
    - Break view → Going here → rate 2 papers + a note.
    - Switch room.
    - Leave.
    - Papers I rated shows both papers.
    - No horizontal scroll. The tab bar shows 5 tabs.
- [ ] **Step 6:** Commit `"Live page (#203)"`, push, and open a PR. The PR body says `Closes` nothing (#203 stays open for Stages B and C) and `Part of #203`, and follows the `.github` template. Then request the independent review before any deploy.
