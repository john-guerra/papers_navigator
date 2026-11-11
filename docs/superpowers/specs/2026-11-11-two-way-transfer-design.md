# Two-way transfer between laptop and phone — design

Status: approved by John 2026-11-11 ("Let's implement the two way transfer"). Plan: docs/superpowers/plans/2026-11-11-two-way-transfer.md

## Intent

Attendees use Papers Navigator on two devices during the conference: they plan on the laptop
(search, add papers, watch rules) and use the phone in the halls (Now / Next, rate, quick notes,
mark attended, remove a paper they skipped). In the evening they go back to the laptop and expect
the day's changes, then plan tomorrow and send it to the phone again.

Today that only half works:

- Laptop → phone: "Send to my phone" (`src/lib/share.js`) carries the list and watch rules, not
  notes, ratings, 👎 or attended marks, and not "My research" topics.
- Phone → laptop: only Export/Import of the JSON file (`src/lib/myPapersFile.js`), and every
  Import only **adds**: `keyedStore.merge` adds only ids you don't have
  (`src/lib/keyedStore.js:60-65`), the followed list is a union (`src/lib/followed.js:13-26`),
  ratings keep the local value (`src/lib/ratings.js:23`), notes are concatenated
  (`src/lib/notes.js:38`). A paper removed or a rating changed on one device never reaches the
  other.

This design makes one round trip — laptop → phone → laptop — carry everything, with removals and
edits, and never lose data.

## Goals

1. **Everything travels**: followed papers, watch rules and exceptions (including "My research"
   topics), notes, ratings, 👎, attended marks.
2. **Removals and edits travel**: a paper removed on the phone is removed on the laptop after the
   trip; a changed rating replaces the old one.
3. **No data loss, ever** (John: "I would wince at data loss"). This is the overriding rule:
   - no text (a note, a research abstract) is discarded without the person choosing to;
   - every incoming merge can be undone, including after a reload;
   - a malformed, truncated or older-format file never wipes or corrupts local data.
4. **The person decides real clashes** (John: "Let the user decide"). Changes made on only one
   side merge silently; when both sides changed the same thing differently since the last trip,
   the receiving device asks.
5. **One deliberate action per direction**, from either device.

## Non-goals

- Automatic or live sync, accounts, a server, Google Drive, Firebase (see the 2026-11-10 discussion:
  maybe later, if attendees ask; this design's change tracking is what any later sync would need
  anyway).
- More than two devices in a coordinated way (it must stay correct with three, just not optimised).
- Moving data between conferences.

## Anti-goals (would make this a failure even if it works)

- Any path where a note, rating or list entry disappears without the person seeing and choosing it.
- A clash screen that appears on most trips (clashes should be rare: most days the phone rates and
  marks attended while the laptop plans).
- Private text ("My research" abstracts, notes) leaving the device anywhere except inside the
  transfer the person starts (no server, no URL query string; a URL fragment is acceptable since
  it is never sent to the server, `src/about.md:120`).

## Constraints

- Static site, no backend (Observable Framework, rsynced to Apache). Public repo.
- Data stays in localStorage per conference; the About page's privacy text (`src/lib/about.js`,
  checked by `test/about.test.js`) must stay true and be updated to describe the transfer.
- Existing users' data must survive the deploy untouched: stores created before this change have no
  timestamps, and the first load after the deploy must migrate them without losing anything.
- Older exports (format v2 and earlier) must still import, with today's add-only behaviour.
- Reactive store contract (`.value` + `input` events) and the existing Undo on Import stay.
- TDD; times use the conference timezone helpers only for display, change times are UTC instants.

## How it works (decided)

The guarantees above are binding; the mechanism below is the chosen one (Claude's call after the
builder check: it needs no clocks and no confirmation that a send arrived).

### Change tracking in every store

- Each device has a random device id (localStorage, per site).
- Every entry carries a **version vector**: `{…entry, v: {<deviceId>: <counter>}}`. Changing an
  entry on a device increments that device's counter for it. The time of the change (`t`, UTC) is
  kept only for display ("changed on the phone, 14:10"), never for deciding.
- A removal is kept as a marker `{deleted: true, v, t}` (a "tombstone") instead of deleting the
  key, so "removed on the phone" can be told apart from "never had it". Tombstones are hidden from
  `.value`/the UI.
- Merging one entry: if one side's vector includes every change of the other (dominates), that
  side wins silently. If the values are equal, the vectors are combined silently. Otherwise the
  changes were concurrent: a **clash**. Sending is fire-and-forget and nothing is recorded on send,
  so an unimported send can never hide a clash, and three devices also work.
- Stores move onto one shared timestamped keyed store (extending `createKeyedStore`, which disliked
  and attended already use) for followed papers, notes, ratings, 👎, attended, and the rules state
  (rules, exceptions). Derived data stays out of the transfer: `researchVectors`, cached topic
  `matches`, `seen` ids, view settings, Live clock and Bluesky handle.
- **Migration**: on first load after the deploy, every existing entry gets `v = {<this device>: 1}`
  and `t` = its `addedOn` where present, else the migration time. Nothing is dropped.
- **First trip between two devices**: entries on both sides with equal values merge silently;
  different values are a clash (their vectors are concurrent), except a note whose text on one side
  starts with the other side's whole text: the longer one wins, since nothing is lost.
- **Clashes are per entry within a store**, not per paper across stores. "Removed from My Papers
  on the phone, note added on the laptop" is two one-sided changes in different stores: both apply
  (the paper leaves the list, the note stays; notes live on any paper). Real clashes: two different
  ratings, two different note texts, a note removed on one side and edited on the other, a rule
  edited differently on both sides.

### Clashes: the person decides

- On receiving, one-sided changes apply immediately; clashes are collected into a short list.
- Each clash shows the paper title and both sides in plain words, e.g. "Phone: note removed ·
  Laptop: note edited", "Phone: ★★★ · Laptop: ★★★★★", with "Keep phone's", "Keep laptop's", and "Keep
  both" for two different note texts (joined, as today's `mergeNotes` does).
- With several clashes: "Use the newest for all" — but it never discards note text: for a note
  clash it keeps both.
- Until the person answers, nothing in the clash list changes locally. Closing the screen without
  answering leaves those entries as they were locally and keeps the clash list available ("3 papers
  need a choice") until answered or dismissed.
- A note clash resolved as "keep removed" saves the discarded text into the safety net below, so
  even a chosen removal can be got back.

### Undo and safety net (Claude's call)

- **Undo this import** reverts only the entries that import changed, to their previous value and
  vector, and skips any entry changed since (as today's Undo does). It works after a reload for 7
  days. It never touches later edits, so undo itself can't lose data. It also clears that import's
  open clash list.
- **Snapshot**: before applying any import, the receiving device also saves a full snapshot of its
  data (per conference, the last 3). It is a last-resort "Restore data from before the import of
  <date>", shown with a warning that later changes are replaced (and itself snapshotted first).
- **Importing a file made on this same device** (same device id, i.e. a backup): Import offers
  "Restore this backup" (replaces current data; snapshotted first, undoable) or "Merge" (the normal
  rules, where newer local changes win). Without this, restoring a backup could never bring back
  something removed after it.
- Parsing is all-or-nothing: an invalid or truncated payload changes nothing and says so.
- Payloads with a newer format version than the app understands are refused with a message, not
  half-applied.

### The transfer itself

- One format for both directions and for Export: the v2 JSON plus `version: 3`, version vectors,
  change times, tombstones and the sender's device id. Sending or exporting records nothing.
- **Sending** ("Send to my other device", one action on both devices):
  - phone: the share sheet (`navigator.share` with the file, falling back to download) — AirDrop,
    Messages, email to self;
  - laptop: the same, plus a QR code when the payload fits (the existing short-id link stays as
    the small, list-only fallback).
- **Receiving**: Import (file picker, and drag-and-drop on the laptop) handles v3 with merge +
  clashes; v2 and older keep today's add-only behaviour.
- Export becomes the same payload, so a backup is also a transfer.

## Left to the builder

- Exact UI placement and copy (follow `docs/DESIGN.md` vocabulary), the clash list's layout.
- Payload compression and the QR size limit.
- How the store refactor is staged across PRs (it touches hot files; keep `src/index.md` /
  `src/style.css` changes small).
- Test fixtures and the migration test data.

### Safari tab or Home Screen app: both (John: "That's up to people")

On iOS a tapped link or scanned QR always opens Safari, and a Home Screen app keeps storage
separate from Safari (WebKit bug 181849). People choose either, so:

- **Expected main case: the Home Screen app** (John: "Home screen I think"). Every phone flow is
  designed and tested there first; a Safari tab is the secondary case.
- **Paste as a second receive path** (Claude's call, to verify on a real iPhone): "Copy for my other
  device" puts the payload on the clipboard, and the receiver's "Paste" reads it on a tap
  (`navigator.clipboard.readText`). Between a Mac and an iPhone on the same Apple account the
  clipboard carries over (Universal Clipboard), which avoids the Files step. If iOS blocks or limits
  the read in the Home Screen app, the file path alone ships.
- **The file is the primary path and works everywhere**: send via the share sheet (AirDrop,
  Messages, email, Save to Files), receive via Import (file picker), in a Safari tab or the Home
  Screen app alike. Every flow and test is built on it first.
- **Link / QR stay as a convenience** for receiving in a browser tab (Android, or a Safari tab);
  they cannot reach the Home Screen app. When a link opens in Safari on
  iOS (not standalone, `isIosSafariTab` in `src/lib/storageHealth.js`), the import confirmation says
  in one line: using the Home Screen app instead? Open it and Import the file there.
- **Moving a Safari list into the Home Screen app** is the same transfer (send from the Safari tab,
  Import in the app); the backup reminder's iPhone line (`src/components/dataSafety.js:91`) says so.
- The PWA itself (manifest, icons from the chosen "map of papers" design, `apple-touch-icon`) is a
  separate small PR; this design does not depend on it.

## As built

Decisions carried from the reviews:

1. **Metadata never clashes.** A paper's reason/date and an attended mark's time are metadata: they never clash and don't sync once both devices have the item.
2. **Restore and undo.** Restoring a backup or a saved copy is a new local change, so it wins on the next transfer. Undo of an import puts back the previous versions (so importing the same file again applies it again).
3. **Migrated entries.** An entry that existed before tracking got its change time at migration, so that is its "last changed".
4. **A sidecar change log, not one keyed store.** Versions live in `papersNavigator:<id>:sync` beside the existing stores instead of moving every store onto one keyed store. Older cached tabs (still running old code) keep writing the old stores and cannot strip version fields they don't know about, because there are none inside those stores.
5. **Copies of earlier data expire and can be deleted.** The undo record is kept 7 days and the saved snapshots (at most 3) 14 days; expired ones are removed on every page load (`startSyncTracking` → `expireTransferCopies` in `src/lib/sync/expire.js`), when My Papers draws them, and a snapshot older than 14 days is dropped on the next save. **Delete saved copies** (My Papers → Saved copies of your data, inline confirm) removes the snapshots and the undo record at once; the data itself stays. About → Delete your data says so.
6. **The undo message says what undo means.** After **Undo this import** (on the import screen and in the history line): "Importing the file from <device> again will apply these changes again."
7. **Research rules in "Use the newest for all" keep local.** A My research topic is never decided by time: this device's is kept (the file's only when this side has no abstracts, e.g. a deletion), so no abstract is dropped without the person choosing it. A watch's clash row shows its level and threshold and the opening of its first abstract (Show all).
8. **Every exported value carries its own version.** The file's `sync` comes from `meta.preview` of the very values being exported (`src/lib/sync/exportFile.js`), so an edit not yet recorded, or whose record couldn't be saved (storage full), still travels with a bumped vector. A reconcile that can't save keeps its records on this page (while storage still holds what it held), so the next edit gets a newer version than one already exported. On import, file values without a valid record are counted and named in the summary ("n items couldn't be matched; they were left out."). Damaged records (not an object, or a bad vector) are dropped when the version record is read.
9. **Only a durable send counts as a backup.** A download or a completed share resets the backup reminder; **Copy for my other device** doesn't.
10. **Stray drops.** A file dropped outside My Papers' data area is not opened by the browser (which would leave the page); the status points to the data area.
