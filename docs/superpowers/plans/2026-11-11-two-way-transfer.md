# Two-Way Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One file (or paste) carries everything (list, watches, exceptions, notes, ratings, 👎, attended) from one device to the other. Removals and edits travel, real clashes go to the person, and nothing is ever lost.

**Architecture:** A **sidecar change log** (`src/lib/sync/`) watches the existing stores instead of changing them:
- Every page that opens the stores reconciles their current values against a per-entry record (`papersNavigator:<id>:sync`). The record holds a version vector, a time, a hash of the value and a tombstone flag. Reconciling happens on load and on every store `input`.
- A local change bumps this device's counter for that entry. The first run is the migration: everything gets `{device: 1}`.
- Export v3 carries the values plus those records.
- Import runs a pure merge: dominance means a silent apply; concurrent changes are a clash for the person to settle. The merge result goes through the stores' own write methods, with an undo kept for 7 days and a snapshot taken before.

**Tech Stack:** Observable Framework 1.13 pages, plain ES modules in `src/lib`, htl components in `src/components`, Vitest (+ jsdom), the existing stores (`followed.js`, `rules.js`, `notes.js`, `ratings.js`, `disliked.js`, `attended.js`).

**Spec:** `docs/superpowers/specs/2026-11-11-two-way-transfer-design.md` (approved by John 2026-11-11). Its Goals, the no-data-loss rules and its decided mechanism are binding.

**Worktree:** `/Users/aguerra/workspace/papersNavigator-transfer`, branch `two-way-transfer` (from `main` 97e6882).

## Rulings against the spec (Claude's calls; John reviews them with this plan)

1. **A sidecar log, not "stores move onto one shared timestamped keyed store".**
   - **Why:** the stored formats stay exactly as they are, so an older tab still running the previous version (the service worker keeps it until reload) can't strip version fields when it writes. Reconcile-on-load also catches changes such a tab made. The hot store code barely changes.
   - **Cost if wrong:** diffing a few hundred entries on each store `input` (cheap). The vectors, tombstones and rules in the spec are kept exactly.
2. **The QR code stays the existing list-only share link.** The full payload is too large for a QR code. The spec left the QR limit to the builder.
3. **Where things live:** Import, the clash list, Undo and the snapshots live on **My Papers** (where Import is today). "Send to my other device" is on My Papers next to Export. Live gets no new controls.
4. **Undo and snapshots:**
   - **Undo** covers the last import only, kept for 7 days.
   - **Snapshots:** the last 3 per conference, in localStorage.

## Global Constraints

- **Storage keys**, per conference `<id>`:
  - `papersNavigator:<id>:sync`: `{device: string, entries: {[key]: {v: {[device]: n}, t: ISO, h: string, deleted?: true}}}`
  - `papersNavigator:<id>:syncUndo`: `{at: ISO, from: device, changes: [{key, before, beforeMeta, afterHash}]}`
  - `papersNavigator:<id>:syncSnapshots`: `[{at: ISO, label: string, payload: string}]`, at most 3, newest first.
- **Entry keys:**
  - `followed/<paperId>` → `{reason, addedOn}`
  - `rule/<ruleId>` → `{type, value, threshold?, level?, research?}`. Never `matches`, `evaluatedOn`, `program`, `addedOn` or `seen`: those are derived.
  - `exception/<paperId>` → `true`
  - `note/<paperId>` → text (also `note/session:<sessionId>`)
  - `rating/<paperId>` → 1..5
  - `disliked/<paperId>` → `true`
  - `attended/<paperId>` → `{at, how}` or `{off: true}`
- **Hash:** `stableHash(value)` = a stable JSON stringify (sorted keys) run through the existing `hashText` in `src/lib/myResearch.js`. Values are canonicalized with the stores' own clean functions before hashing, so what a store saves hashes the same as what was applied.
- **Device id:** `crypto.randomUUID().slice(0, 8)` when available, else 8 random base-36 characters. It is created once and stored in `:sync`.
- **Format v3:** the v2 fields stay as they are, plus `version: 3`, `device`, `sync: {[key]: {v, t, deleted?}}` (the `h` is not exported). `parseMyPapersFile` refuses `version > 3` with: "This file was made by a newer version of Papers Navigator. Reload the page and try again." Files of v2 and earlier keep today's add-only import.
- **Data safety:**
  - Nothing changes in the stores until the person confirms an import.
  - Parsing is all-or-nothing.
  - A clash never changes local data until it is answered.
  - A note text is never dropped without a choice. "Keep both" joins the two texts with a blank line, as `mergeNotes` does. Notes discarded by "keep the other one" go into the undo record.
- **Copy** (DESIGN.md vocabulary): "Send to my other device", "Copy for my other device", "Paste from my other device", "Undo this import", "Restore data from before the import of <day time>", "Keep phone's" / "Keep laptop's" / "Keep both". The device names come from the file's `deviceName`, a navigator-based label ("iPhone", "Mac", "Android", else "other device") computed at export.
- **Privacy:** the payload goes only into a file, the share sheet or the clipboard, never into a URL. Update the About storage list (`src/lib/about.js`, `test/about.test.js`).
- **Prettier** only on the `.js`/`.css` files you touched. Never on `src/*.md`.

## Review Focus

1. **Migration on the first load after deploy, with existing data.** Every entry gets `v={me:1}` and nothing is dropped. A second load bumps nothing.
2. **Two tabs open.** One tab's change must not be bumped twice, and an import in tab A must not look like a local change in tab B. The meta is written before the stores, and every tab re-reads it.
3. **An older tab writes in the old format** (no sync meta). On the next load in a new tab, reconcile sees a hash change and bumps it as a local change. Nothing is lost.
4. **A file from this same device** (backup). Offer "Restore this backup" or "Merge". Restore must snapshot first and be undoable.
5. **Note clash or "Use the newest for all".** Never discards text. "Keep the other one" keeps the dropped text in the undo record.

---

### Task 1: Vector clocks and entries

**Files:**
- Create: `src/lib/sync/clock.js`, `src/lib/sync/entries.js`
- Test: `test/syncClock.test.js`, `test/syncEntries.test.js`

**Interfaces:**
- Produces:
  - `bump(v, device) → v'` (a new object)
  - `compare(a, b) → "equal" | "a" | "b" | "concurrent"`, where "a" means a dominates b
  - `join(a, b) → v`
  - `stableHash(value) → string`
  - `toEntries({followed, rules, exceptions, notes, ratings, disliked, attended}) → {[key]: value}`
  - `fromEntries(entries) → {followed: [{id, reason, addedOn}], rules: [rule], exceptions: [id], notes, ratings, disliked, attended}`
  - `STORES = ["followed","rule","exception","note","rating","disliked","attended"]`
  - `keyOf(store, id)` / `splitKey(key) → [store, id]`, where the id may contain ":" or "/"

- [ ] **Step 1: Write failing tests.**
  - `compare({a:2},{a:1})==="a"`, `compare({a:1},{a:1,b:1})==="b"`, `compare({a:2},{a:1,b:1})==="concurrent"`, `compare({},{})==="equal"`.
  - `join({a:2,b:1},{a:1,c:3})` deep-equals `{a:2,b:1,c:3}`.
  - `bump({a:1},"a")` → `{a:2}`, and the input is unchanged.
  - `stableHash({b:1,a:2}) === stableHash({a:2,b:1})`.
  - `toEntries` maps a rule `{id:"topic:x",type:"topic",value:"x",threshold:0.3,level:"good",matches:{p:1},evaluatedOn:"…",addedOn:"…"}` to the key `rule/topic:x` with value `{type:"topic",value:"x",threshold:0.3,level:"good"}`.
  - `fromEntries(toEntries(state))` round-trips the followed entries, the rules minus derived fields, exceptions, notes including `session:x`, ratings, disliked and attended `{off:true}`.
  - `splitKey("note/session:a/b")` → `["note","session:a/b"]`.
- [ ] **Step 2:** Run `npx vitest run test/syncClock.test.js test/syncEntries.test.js`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.**
  - `toEntries` canonicalizes with `cleanNotes`, `cleanRatings`, `cleanDisliked` and `cleanAttended`.
  - It canonicalizes rules with `normalizeRule` (from `rules.js`), then keeps only `type, value, threshold, level, research`, without undefined values.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with the message `sync: vector clocks and the entries of every store`.

### Task 2: Sync meta and reconcile (includes the migration)

**Files:**
- Create: `src/lib/sync/meta.js`
- Test: `test/syncMeta.test.js`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `createSyncMeta(conferenceId, storage = localStorage, newDevice?) → {device, read() → entries, write(entries), reconcile(currentEntries, now = new Date()) → changedKeys[]}`
  - `reconcile` re-reads storage first. For each current key whose hash differs from the record, or which has no record, it bumps this device's counter, sets `t` and `h`, and clears `deleted`. For each recorded key that isn't current and isn't already deleted, it writes `{v: bump, t, h: "", deleted: true}`. It writes once, and only if something changed.

- [ ] **Step 1: Write failing tests**, using a `Map`-backed fake storage:
  - The first reconcile of 3 entries gives each `v={dev:1}`, and a second reconcile with the same values changes nothing (it returns `[]`).
  - Editing one value bumps only it, to `{dev:2}`.
  - Removing a key writes a tombstone. Re-adding the key bumps the counter again and clears `deleted`.
  - The device id persists across `createSyncMeta` calls.
  - Corrupt JSON in storage is treated as empty and nothing throws.
  - Two metas on the same storage (two tabs): A reconciles a change, then B reconciles the same current entries and changes nothing.
- [ ] **Step 2:** Run `npx vitest run test/syncMeta.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Storage failures are caught and reported with `reportStorageFailure`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with the message `sync: per-entry versions, tombstones and the first-load migration`.

### Task 3: The merge

**Files:**
- Create: `src/lib/sync/merge.js`
- Test: `test/syncMerge.test.js`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces `mergeTransfer(local, incoming) → {apply: {[key]: {value?, deleted?, v, t}}, clashes: [{key, local: {value?, deleted?, v, t}, incoming: {…}}], counts: {added, changed, removed, same}}`.
  - `local` is `{entries, meta}`.
  - `incoming` is `{entries, sync, device}`.
- Produces `resolveClash(clash, choice: "local" | "incoming" | "both", device) → {key, value?, deleted?, v, t}`, with `v = bump(join(local.v, incoming.v), device)`. "both" is only valid when both sides are note texts.
- Produces `newestForAll(clashes, device) → resolutions[]`. The later `t` wins, except that note-vs-note clashes give "both", and a note deleted on one side and edited on the other gives the edit.

**Per-key rules:**
- **No incoming record:** skip.
- **No local record:** apply the incoming value, or its tombstone if deleted.
- **Incoming dominates:** apply.
- **Local dominates, or the vectors are equal:** skip.
- **Concurrent:**
  - same hash (or both deleted) → apply with the joined vector and the local value, silently;
  - a note whose text starts with the other side's whole text → the longer one, joined vector, silently;
  - otherwise → a clash.

- [ ] **Step 1: Write failing tests:**
  - A rating changed only on the phone (incoming dominates) is applied. A paper removed only on the phone (incoming tombstone dominates) is applied as deleted.
  - Two different ratings, concurrent, give one clash, and `apply` doesn't contain that key.
  - **First trip** (both sides migrated independently, vectors `{L:1}` vs `{P:1}`):
    - equal values are silent;
    - the note "Good" vs "Good. Ask about X" goes silently to the longer one;
    - "Good" vs "Bad" is a clash.
  - Removed on the phone plus a note added on the laptop are two different keys, so both apply and there is no clash.
  - A note removed on one side and edited on the other is a clash.
  - `resolveClash(…,"both")` on notes joins them as `"mine\n\ntheirs"`, and its vector dominates both sides.
  - `newestForAll` never returns a resolution that drops note text.
- [ ] **Step 2:** Run `npx vitest run test/syncMerge.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Pure functions only: no storage, no stores.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with the message `sync: merge with version vectors; clashes for the person`.

### Task 4: Apply to the stores, undo, snapshots

**Files:**
- Create: `src/lib/sync/apply.js`
- Modify:
  - `src/lib/followed.js`: add `applyEntries({put, remove})`
  - `src/lib/rules.js`: `createRulesStore` gets `applyEntries({put, remove, except, unexcept})`
- Test: `test/syncApply.test.js`, plus one test each in `test/followed.test.js` and `test/rules.test.js` for the new methods

**Interfaces:**
- Consumes: Tasks 1–3 and the existing stores.
- Produces `applyTransfer({stores, meta, conferenceId, storage, now}, resolutions, {from, label}) → {undo(), applied}`.
  - `stores` is `{followed, rules, notes, ratings, disliked, attended}`.
  - `resolutions` is the merge's `apply` plus the clash resolutions.
- Order of `applyTransfer`, which is the key to the two-tab safety:
  1. Save a snapshot of the current state (a v3 payload) with `label`.
  2. Write the meta for every applied key: the new `v`, `t`, the `h` of the canonical value, and `deleted`.
  3. Write the stores, one call per store:
     - `followed.applyEntries`, `rules.applyEntries`;
     - notes `set` / `delete`, ratings `set(id, n | 0)`;
     - disliked and attended `putMany` (with `undefined` for a deletion).
  4. Save the undo record.
- Produces `undoLastImport(ctx) → {reverted, skipped}`. It reverts each key whose current hash still equals its `afterHash` to `before` and `beforeMeta`, and skips the others.
- Produces `listSnapshots(ctx)` and `restoreSnapshot(ctx, i) → undo()`. Restore snapshots the current state first, replaces every store from the payload, and reconciles.
- `followed.applyEntries({put: [{id, reason, addedOn}], remove: [ids]})` writes once and keeps the list order: updated entries stay in place, new ones go last. `rules.applyEntries` writes once. A put rule keeps its existing cached `matches` when the threshold is unchanged; otherwise it goes through `normalizeRule` without matches.

- [ ] **Step 1: Write failing tests**, with real stores on fake storage:
  - Applying a removal, a rating change, a new note and an exception updates each store, and a reconcile right after returns `[]` (no spurious bump).
  - Undo after a later local edit of one key reverts the others and skips that one.
  - A snapshot is saved before applying, at most 3 are kept, and they are newest first.
  - `restoreSnapshot` brings back a removed paper and can itself be undone.
  - The undo record survives a new `createSyncMeta`/stores (a reload), and is ignored once older than 7 days.
- [ ] **Step 2:** Run `npx vitest run test/syncApply.test.js test/followed.test.js test/rules.test.js`. Expected: FAIL on the new tests.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then run `npm test`: all pass.
- [ ] **Step 5:** Commit with the message `sync: apply an import through the stores, with undo and snapshots`.

### Task 5: Format v3

**Files:**
- Modify: `src/lib/myPapersFile.js`
- Test: `test/myPapersFile.test.js`

**Interfaces:**
- Produces `exportMyPapers(state, {device, deviceName, sync})`. It writes v3 when `sync` is given, else v2 (as today).
- Produces `parseMyPapersFile(text) → {…v2 fields, version, device?, deviceName?, sync?}`:
  - it throws the newer-version message for `version > 3`;
  - it throws on a v3 `sync` that isn't an object of `{v, t}` records.
- Produces `deviceLabel(nav = navigator) → "iPhone" | "iPad" | "Android" | "Mac" | "Windows" | "other device"`.

- [ ] **Step 1: Write failing tests:**
  - a v3 round trip;
  - `{version: 4}` throws the exact message;
  - a truncated JSON throws, which leaves nothing changed (parse happens before any store call; covered in Task 7);
  - v2 and plain-list files still parse the same.
- [ ] **Step 2:** Run `npx vitest run test/myPapersFile.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with the message `My Papers file v3: values plus their versions`.

### Task 6: Tracking on every page

**Files:**
- Create: `src/lib/sync/track.js`
- Modify: `src/index.md`, `src/my-papers.md`, `src/live.md`, `src/authors.md`, `src/about.md` (one `startSyncTracking` call each, next to where they create stores)
- Test: `test/syncTrack.test.js`

**Interfaces:**
- Produces `startSyncTracking(conferenceId, stores, {storage, schedule = queueMicrotask}) → stop()`. It reconciles at once and after every store `input`, coalesced into one reconcile per tick. A page that has only some of the stores passes those and the rest are read from storage with the same clean functions. Write a `readState(conferenceId, storage)` helper for that, used by both.

- [ ] **Step 1: Write failing tests:**
  - Start, then `notes.set` → the meta for `note/x` is `{dev:1}`.
  - Two quick changes → one reconcile.
  - `stop()` stops listening.
  - Starting with pre-existing data (the migration) gives every key `v={dev:1}`.
- [ ] **Step 2:** Run `npx vitest run test/syncTrack.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement it, and add the page calls (with `invalidation.then(stop)`).
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Then `npm run build`. Expected: OK.
- [ ] **Step 5:** Commit with the message `sync: track changes on every page (first load migrates)`.

### Task 7: Import with merge and clashes (My Papers)

**Files:**
- Create: `src/components/transferImport.js`
- Modify: `src/my-papers.md` (the v3 branch of the import handler), `src/style.css` (small)
- Test: `test/transferImport.test.js`

**Interfaces:**
- Produces `renderTransferImport(parsed, {ctx, papers, sessions, fileName, onDone}) → el`.
- **Same device** (`parsed.device === ctx.meta.device`): show "This is a backup from this device" with "Restore this backup" and "Merge". Restore uses `restoreSnapshot`-style replacement from the payload.
- **Otherwise:**
  - Show a summary from `mergeTransfer` ("From <deviceName>: 4 added, 2 changed, 1 removed").
  - With no clashes: "Apply" → `applyTransfer`, then "Undo this import".
  - With clashes: one row per clash (paper title or session name, both sides in plain words, the three buttons), plus "Use the newest for all". "Apply" is enabled once every clash is answered. "Skip these for now" applies the rest and keeps the clashes listed ("3 papers need a choice") until answered or dismissed.
- v2 and older files keep today's buttons exactly.

- [ ] **Step 1: Write failing tests** (jsdom, real stores on fake storage):
  - a v3 file with one removal and one clash shows one clash row with "Phone: ★★★ · Laptop: ★★★★★";
  - choosing then Apply changes both keys;
  - "Undo this import" restores both;
  - a same-device file shows the two choices;
  - a v2 file still shows "Merge into my list" / "Replace my list".
- [ ] **Step 2:** Run `npx vitest run test/transferImport.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement and wire it into the `importInput` handler. Parse first, as today.
- [ ] **Step 4:** Run `npm test` and `npm run build`. Expected: PASS and OK.
- [ ] **Step 5:** Commit with the message `My Papers: import another device's file with merge, clashes, undo`.

### Task 8: Send, copy and paste

**Files:**
- Create: `src/components/sendToDevice.js`
- Modify: `src/my-papers.md` (next to Export; Export now writes v3)
- Test: `test/sendToDevice.test.js`

**Interfaces:**
- Produces `renderSendToDevice({payload: () => string, fileName, share = navigator, clipboard = navigator.clipboard, download}) → el`, with these buttons:
  - **"Send to my other device":** `share.canShare?.({files})` → `share.share({files, title})`; else `download`. A dismissed share (AbortError) is fine.
  - **"Copy for my other device":** `clipboard.writeText`, then "Copied: paste it in My Papers on the other device".
  - **"Paste from my other device":** `clipboard.readText` → the same path as Import (Task 7). If reading fails: "Your browser didn't allow pasting here. Use Import instead."
- **iOS hint:** when `isIosSafariTab()`, one line: "Using the Home Screen app? Import the file there."
- **Drag and drop:** dropping a `.json` file on the My Papers data area (laptop) goes the same path as Import (spec: "drag-and-drop on the laptop").
- **Shared-link confirmation:** the existing `#follow=` confirmation (`src/my-papers.md` ~line 174) gets the same iOS hint line when `isIosSafariTab()` (spec: Safari tab vs Home Screen app).

- [ ] **Step 1: Write failing tests:**
  - a dropped JSON file calls the import path;
  - a file share when `canShare` is true;
  - a download when it isn't;
  - copy writes the payload;
  - paste of a valid payload calls `onPaste(text)`;
  - a paste failure shows the message.
- [ ] **Step 2:** Run `npx vitest run test/sendToDevice.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement and wire.
- [ ] **Step 4:** Run `npm test`, `npm run lint` and `npm run build`. Expected: pass.
- [ ] **Step 5:** Commit with the message `My Papers: send, copy or paste everything to the other device`.

### Task 9: Copy, About, DESIGN.md and the backup tip

**Files:**
- Modify: `src/lib/about.js` (the three new storage keys), `test/about.test.js`, `src/about.md` (Export/Import paragraph), `docs/DESIGN.md` (the My Papers data section), `src/components/dataSafety.js` (the iPhone line mentions "Send to my other device")

- [ ] **Step 1:** Update the tests asserting the About storage list and the dataSafety text. Run them: FAIL.
- [ ] **Step 2:** Edit the text. Run `npm test`: PASS. Run `npx @google/design.md lint docs/DESIGN.md`: 0 errors.
- [ ] **Step 3:** Commit with the message `About, DESIGN.md: two-way transfer`.

### Task 10: End to end

- [ ] **Build two browser contexts**, "laptop" and "phone", on `npm run build` + a static server. Seed the laptop with real-looking data from before the deploy (no `:sync` key) and load it (the migration).
  - Send to the phone: Export, then Import in the phone context.
  - On the phone: remove a paper, rate one, change a note.
  - On the laptop: change the same note differently.
  - Phone → laptop: one clash (the note), and the rest applied. Keep both → the note has both texts. Undo → everything is back.
  - Expected: no entry lost at any point. Compare the full state JSON before and after each step.
- [ ] **Check at 400×860 and 1600×1000**, light and dark.
- [ ] **Final whole-branch review:** a fresh reviewer on the most capable model, with this plan's Review Focus. This is per the project memory "review before deploy".
