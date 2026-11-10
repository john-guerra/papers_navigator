# Stage E Implementation Plan: My Papers as the place to review; keeping your data safe

> **For agentic workers:** superpowers:executing-plans (native). Steps use `- [ ]`.

**Goal:**
- **"All my papers" becomes the review place:** an Include control, a rating filter, Group by, and compact rows.
- **Live's lists** link to it, and their rows get the My Papers toggle.
- **The data stays safe:** the app says it's stored only in this browser, catches failed saves, nudges a backup, and asks the browser to keep the data.

**Spec:** `docs/superpowers/specs/2026-11-10-live-page-design.md`, Stage E (with "Settled from the builder check").

**Worktree:** `/Users/aguerra/workspace/papersNavigator-e`, branch `stage-e-review`.

## Global Constraints

- **My Papers stays your list everywhere else.** Badge, "My Papers (n)", Share, Now/Next, the itinerary, Recommended, and Export's `followed` are unchanged.
- **Scope of the new controls.** Include, the rating filter and Group by apply only to "All my papers". Included rows appear only when Show is "All".
- **Remembered per device:**
  - the Include boxes: `papersNavigator:<id>:reviewInclude` → `{ratedOrAttended: bool, disliked: bool}`
  - the last export: `papersNavigator:<id>:lastExport` → `{at, count}`
  - the nudge dismissal: `papersNavigator:<id>:backupDismissed` → ISO time

  All three are added to the About storage list.
- **Storage failures** are reported only by: followed, rules, notes, ratings and the keyed stores (disliked, attended).
- **URL fragment for Live's links.** On My Papers, `#review=rating` or `#review=attended` turns both Include boxes on and sets Group by to rating or attended.
- **Formatting.** Small edits to the shared pages. Prettier only on the touched `.js`/`.css`.

## Review Focus

1. **Nothing in My Papers, but rated or attended papers exist.** "All my papers" shows the Include control and the header "0 · +n not in My Papers". It is never an empty dead end.
2. **A paper both rated and in My Papers.** It shows once, never twice.
3. **A reason string that matches no known group** (imported or free text). It goes under "★ Added by hand".
4. **localStorage throwing on every write** (e.g. Safari private mode). The banner shows once per page view, and the page keeps working.
5. **Clicking "Add to My Papers" on an included row.** It becomes a My Papers row in place (or re-renders) without a duplicate.

---

### Task 1: Reason groups and the split Show filter

**Files:** `src/lib/rules.js`, `test/rules.test.js` (or the existing tests for `reasonOptions` and `filterByReason`)

**Interfaces:**
- **`reasonGroup(reason)` → `{key, label}`:**
  - "★ Rated" → `rated`
  - "★ Added on Live" → `live`
  - starts with ✨ → `recommended` ("✨ Recommended")
  - starts with 📱 → `shared` ("📱 Shared")
  - starts with 👤 → `author` ("👤 From an author")
  - anything else (non-rule) → `manual` ("★ Added by hand")
- **`reasonOptions(items, rules)`:** All, then the manual groups that are present (in the order above), then the rules.
- **`filterByReason(items, key)`:** handles the new keys. A manual key matches items whose manual reasons (`d.reasons` minus rule reasons) include one in that group. `"manual"` keeps its meaning for the rest.

- [ ] **Steps:** failing tests, FAIL, implement, PASS, commit.

### Task 2: The review model (pure)

**Files:** create `src/lib/review.js`, `test/review.test.js`

**Interfaces:**
- **`reviewRows({items, papers, ratings, disliked, attended, include})`** → `[{...paper, entry | null, notInMine}]`
  - your items first, then the included papers not in My Papers
  - `ratedOrAttended` means rating > 0 or attended, and not disliked
  - `disliked` means 👎
  - no duplicates
- **`ratingKey(id, {ratings, disliked})`** → "5" … "1", "no" (👎) or "none"
- **`filterByRating(rows, keys: Set, ctx)`:** an empty set means all.
- **`groupRows(rows, by, ctx)`** → `[{key, label, rows}]`
  - `by` is one of: day, reason, topic, rating, attended, type, session, award, none
  - Days come in order. Rating: 5★ … 1★, 👎, Not rated. Award: 🏆, 🏅, 🎖️, No award. The other groups go by count, descending, then by label.
  - Reason groups use `reasonGroup` plus the rule reasons, plus "Not in My Papers". A row may appear in several reason groups.
- **`includeCounts(...)`** → `{ratedOrAttended, disliked}`, for the box labels.
- **`notInMineCount(rows)`**

- [ ] **Steps:** tests for each function and for Review Focus 1–3; FAIL, implement, PASS, commit.

### Task 3: Keeping the data safe (logic and components)

**Files:**
- Create: `src/lib/storageHealth.js`, `src/components/dataSafety.js`
- Modify: `src/lib/followed.js`, `src/lib/rules.js`, `src/lib/notes.js`, `src/lib/ratings.js`, `src/lib/keyedStore.js` (call `reportStorageFailure(key)` in their catch blocks), `src/lib/about.js`
- Test: `test/storageHealth.test.js`, `test/dataSafety.test.js`

**Interfaces:**
- **`storageHealth`:** an EventTarget with `.failed` (boolean), emitting `failure` once per page view. `reportStorageFailure(key)`.
- **`backupNudge({total, lastExport, dismissedAt, now, lastDay, tz})`** → boolean:
  - true when (`total - (lastExport?.count ?? 0) >= 10`, or `dayKey(now) >= lastDay`)
  - and no export or dismissal in the last 24 h
  - `total` counts ratings + notes + disliked + attended entries
- **`isIosSafariTab(navigator)`:** iPhone or iPad, and not `navigator.standalone`.
- **`requestPersistence(storage = navigator.storage)`:** calls `persist()` once per page view if available, and swallows errors.
- **`storageBanner({exportHref | onExport})`:** hidden until `storageHealth` fails. Text: "This browser isn't saving your changes (storage full or blocked, e.g. private browsing). Export JSON now to keep them." It has an Export button (or the "Open My Papers to export" link) and ✕.
- **`dataNote({onExport | exportHref, nudge: boolean, ios: boolean, onDismiss})`:**
  - always the standing line: "**Saved only in this browser.** Your list, notes, ratings and attended papers aren't sent anywhere. Export JSON to keep a copy or move them to another device." ("Export JSON" is a link or button.)
  - with `nudge`: a dismissible line above it, "Back up your notes and ratings: Export JSON", plus the iOS sentence when `ios`

- [ ] **Steps:** tests:
  - a store whose `setItem` throws reports a failure, and the event fires once
  - `backupNudge`: thresholds, last day, the 24 h quiet after export or dismissal
  - iOS detection
  - the banner shows on a failure and ✕ hides it
  - `dataNote` text, its nudge and the iOS line

  Then FAIL, implement, PASS, commit.

### Task 4: My Papers review UI

**Files:**
- Create: `src/components/reviewTools.js`, `src/components/reviewList.js`
- Modify: `src/my-papers.md` (the "All my papers" cells, export records `lastExport`, the data note and banner, the `#review=` fragment), `src/style.css`
- Test: `test/reviewTools.test.js`, `test/reviewList.test.js`

**Interfaces:**
- **`reviewTools({include, counts, ratingKeys, groupBy, phone})`:** an element with `.value` = `{include, ratingKeys: Set, groupBy}` that emits `input`.
  - Include: two checkboxes, hidden when both counts are 0.
  - Rating chips: 5★ 4★ 3★ 2★ 1★ 👎 "Not rated", as toggle buttons with `aria-pressed`. Choosing 👎 turns on Include 👎.
  - Group by: a select of None, Day, Reason, Topic, Rating, Attended, Type, Session, Award.
  - On phones it's wrapped in `<details>` "Filter & group (n active)".
- **`renderReviewList(groups, {tz, tzLabel, authorHref, detailsHref, onOpen, inMyPapers, onToggle, notesOf})`:**
  - Groups are `<details open>` with "Label (n)" (no wrapper when `by = none`).
  - Each row is a `li.paper[data-paper-id]` containing `compactPaperRow`:
    - extra: the reason chips, or the muted "Not in My Papers" label
    - actions: a follow toggle (Remove or Add to My Papers)
  - The rating, ✓ and note markers come from the existing binders on `.mp-list`.
- **Header:** "All my papers n · +m not in My Papers".

- [ ] **Steps:** tests:
  - the tools' value, the 👎 chip turning on Include 👎, the active count on phones
  - the list's groups, labels and counts; "Not in My Papers" rows with Add; rows in My Papers with Remove

  Then FAIL, implement, PASS. Wire `my-papers.md` and run the browser check. Commit.

### Task 5: Live page

**Files:** `src/components/ratedPapers.js`, `src/components/attendedPapers.js`, `src/components/quickNote.js`, `src/live.md`; their tests

**Interfaces:**
- "Review all in My Papers →" under each list: `my-papers.html#review=rating` and `#review=attended`.
- Rows not in My Papers get the follow toggle (the `inMyPapers` and `onToggle` options).
- `quickNote` shows "Saved" for 2 s after a save (`.quick-note-status`, `aria-live="polite"`).
- Live gets the data note (`exportHref: "my-papers.html#export"`) and the banner. It calls `requestPersistence()` on the first rating, note or attended change.

- [ ] **Steps:** tests for the links, the toggles and the "Saved" cue. Wire the pages: the banner and `requestPersistence` on Explore, Researchers, My Papers and Live. Commit.

### Task 6: Docs, verify, review

- [ ] DESIGN.md (the review tools, compact rows, data note, banner, nudge) and the About storage list. Lint DESIGN.md with 0 errors.
- [ ] `npm test`, `npm run lint`, `npm run build`.
- [ ] Browser check at 400×860 and 1600×1000:
  - Include, the rating filter and Group by
  - adding an included row
  - the `#review=` link from Live
  - the banner (simulate it by making `localStorage.setItem` throw)
  - the nudge
- [ ] Push (HTTPS), then the independent review, fixes, a PR, and a deploy with John's go-ahead.
