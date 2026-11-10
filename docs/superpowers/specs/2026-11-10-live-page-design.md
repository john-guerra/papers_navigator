# Live page: choose a session, rate papers, post to Bluesky (#203)

Status: approved by John in conversation (2026-11-10, during IEEE VIS 2026). Ships while the
conference runs, so it must not touch existing users' saved data.

## Why

John uses the navigator on his phone during the conference. Two moments are poorly served:

1. **At a break, choosing where to go next.** My Papers' Now / Next card shows only the room
   My Papers recommends for the next slot. He can't see what else runs in parallel, so he
   can't tell what he's missing.
2. **In a session.** He wants to check in to the paper being presented, give it a rating, and
   write a quick note, so that later he remembers which papers he liked. When he likes one,
   he often posts about it on Bluesky, with photos, tagging the authors if they're on Bluesky.

Success: at a break, one glance on the phone shows the next slot's sessions and why each
might matter to him, and then a tap commits to one. In the session, rating a paper takes one
tap. After the conference, a list of rated papers with notes brings them back.

## Goals

- A new page, **Live** (`live.md` → `live.html`), in the nav and the phone tab bar.
- **Time.** The page works from "now" in the conference timezone (`src/lib/time.js`), ticking
  every 30 s like My Papers. A control sets another time by hand (day + time); "Back to now"
  resets it. The time is saved per device and is not in the URL.
- **Break view: the next slot.** The next slot is the first time slot whose sessions start at
  or after the chosen time. While a session is running, the view shows "Now" (the running
  slot) above "Next". A slot is a group of sessions that start at the same time; slots come
  from the program data (`sessionStart`), not only from My Papers. VIS 2026 has 15 slots,
  with up to 6 sessions in parallel.
  - Each session card shows: its **name**, 📍 room, start–end time, and the **count of My
    Papers in it**, shown large. The card My Papers' schedule recommends
    (`groupIntoSlots`/`nowNext` in `src/lib/schedule.js`) is marked "Recommended".
  - Cards are **sorted by that count, highest first**, with ties in room order.
  - Under the name, a **one-line summary**: "7 papers · 2 Full · 1 Short · 🏆 1 · Perception,
    Uncertainty". It gives the counts by the type pill's short label, the award icons, and up
    to two of the most common topic labels (`clusterLabel`).
  - A card **expands in place** into compact paper rows in talk order. Each row shows the type
    pill, award icon, title, authors and topic, with papers in My Papers marked. Reuse
    `typePill`/`awardMark` (`src/widgets/paperMarks.js`); the rows are shorter than
    `compactPaperRow`: no actions, no Details. A session with more than 10 papers shows 10
    and then "Show all n" (the Welcome Reception has 58 posters).
  - A paper's title opens the paper details panel (the same `?paper=` route as the other
    pages).
- **"Later today."** Under the next slot, a compact list of the day's remaining slots, one
  line each: time, number of sessions, and how many of your papers. Tapping a line moves the
  chosen time to that slot.
- **Commit: "Going here".** Each session card has a "Going here" button. Committing records
  `{sessionId, at}` on this device, and the page switches to the session view. A committed
  session that has ended (by the chosen time) drops back to the break view. There is one
  commitment at a time; committing to another session replaces it.
- **Session view (checked in).** The committed session's papers in talk order. The talk
  running at the chosen time (by `start`/`end`) is highlighted and scrolled into view. Each
  paper row has:
  - **Rating: 1–5 stars**, one tap to set and a tap on the same star to clear. Each star is a
    real button with a label ("Rate 4 of 5").
  - **Quick note:** a one-line text field that grows as you type and saves on its own. It is
    the existing paper note (`src/lib/notes.js` store, the "📝 My note" in paper details), so
    a note written here shows everywhere else too.
  - **"Add to My Papers"**, if the paper isn't already there (reason "★ Rated on Live", or
    the existing hand-added reason).
  - **"Post"** (see Bluesky).
  - "Leave session" returns to the break view.
- **Switch rooms quickly (John, added 2026-11-10).** In the session view, a "Switch room" bar
  stays visible near the top and shows the other sessions running in parallel right now
  (same slot), one compact line each:
  - room, session name, the count of My Papers in it,
  - and the talk on **now** in that room ("Now: <title>", from `start`/`end` at the chosen
    time), plus the next one of your papers there and when it starts.
  - One tap on a line commits to that session, the same as "Going here". This replaces the
    commitment, keeps every rating and note, and scrolls to that room's current talk. The
    bar is collapsed to one line on phones ("Switch room · 4 others"), so it never pushes
    the current talk off the screen.
- **"Papers I rated."** A section on the same page: every rated paper, highest rating first,
  then by time, with the rating, note, type pill and award, and the title opening the
  details. Filters: day, and "4★ and up".
- **Ratings storage.** A new store `src/lib/ratings.js`, modelled on `notes.js`: localStorage
  key `papersNavigator:<conference>:ratings`, value `{paperId: 1..5}`, a reactive store
  (`EventTarget`, `.value`, `input`), and tolerant of bad data.
  - Ratings are included in **Export / Import JSON** (`src/lib/myPapersFile.js`), as an
    optional `ratings` field. Older exports without it still import. On import, a rating
    already on this device wins over an incoming one, the same rule notes use.
  - Ratings are not put in share links.
- **Ratings elsewhere.** Explore and My Papers paper rows show a small "★4" mark when a paper
  is rated. They have no rating controls.
- **Bluesky draft ("Post").**
  - Draft template, editable before sending:
    `"<title>" by <author list> ★★★★ <note>\n<link>\n#ieeevis`. In the author list, each
    author is either their picked @handle or their name. The rating and note are left out
    when empty.
  - The link defaults to the paper's **conference page** (`p.url`); a toggle switches it to
    this tool's link (the page's `?paper=` URL). The choice is remembered per device.
  - **Author handles.** A "Find on Bluesky" button next to each author asks Bluesky's public
    search, `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?q=<name>&limit=5`
    (no login; it allows any origin; verified 2026-11-10). It shows up to 5 matches (avatar,
    display name, handle) to pick from, or "None of these". Matches are often wrong (the
    first result for "Evanthia Dimara" was someone else), so a handle is **never picked
    automatically**. Picked handles are remembered per device by author name. The request
    sends only the author's name, and only when John taps.
  - **Sending.**
    - With the Web Share API and file support (`navigator.canShare({files})`), "Add photos"
      picks images (`<input type=file accept=image/* multiple capture>`), and "Share" calls
      `navigator.share({text, files})`. John picks the Bluesky app in the phone's share
      menu.
    - Otherwise, or if that fails, "Copy text & open Bluesky" copies the draft and opens
      `https://bsky.app/intent/compose?text=<draft>` in a new tab. He adds photos there.
    - Whether the Bluesky app keeps the text when photos are shared with it is unknown and
      has to be tested on John's phone. That's why both paths exist.
  - **"💬 Discussion."** When @papers.ieeevis.org has posted about a paper, a link to that
    post. The page reads that account's feed (`app.bsky.feed.getAuthorFeed`, public, paged)
    after the first render, at most once per page load, and matches posts to papers by the
    conference paper URL in the post's link facets or its external embed. Today the feed has
    about 31 paper posts, several of them test posts, and only 3 have a matching link, so
    most papers show no link. That's expected. If the feed fails to load, nothing shows.
- **Phone first.** It must work at 400×860 with no sideways scroll, every tap target at least
  44px, and the tab bar visible. Desktop: the same single column, centered, at most 720px
  wide.
- **Offline.** `src/sw.js` lists its pages by hand (`PRECACHE_PAGES`): add `./live.html` and
  bump the `vN` in its `VERSION`. Bluesky features need a connection and say so when
  offline.
- **Nav.** `observablehq.config.js` hard-codes the nav and the phone tab bar. Adding Live
  makes 5 tabs; they must fit at 400px, with labels shortened or a smaller font if needed.

## Rollout (John: in stages)

Each stage is its own PR, reviewed independently, and deployed only with John's go-ahead.

1. **Stage A:** the Live page with time control, break view, "Later today", Going here,
   Switch room, session view with ★ rating and quick notes, "Add to My Papers", and "Papers I
   rated". Also: the ratings store, sw precache, nav/tab bar, and the Now card showing the
   session name.
2. **Stage B:** ratings in Export / Import JSON, "★4" marks on Explore and My Papers rows, and
   the rating shown and settable in paper details.
3. **Stage C:** the Bluesky "Post" draft, author handle search, photos/share, and "💬
   Discussion".

## Non-goals

- **Panels, keynotes and other sessions without papers.** They aren't in the data (the fetcher
  reads paper pages). Showing them needs a pipeline change and regenerated data, which is
  its own issue.
- Posting to Bluesky from the page, or any Bluesky login or OAuth. The page only hands a draft
  to Bluesky.
- Syncing ratings across devices (export/import covers it), or sharing ratings with others.
- Changing My Papers' Now / Next card. One exception, as part of this work: the **Now** card
  shows the running session's name if it doesn't already.

## Anti-goals (a failure even if it works)

- Anything that changes or loses existing My Papers lists, notes, watch rules or share links,
  or changes paper ids or the data files.
- Tagging the wrong person on Bluesky automatically.
- Sending notes, ratings or anything personal to any server. The only outside requests are
  the author-name search (on tap) and the public feed read.
- A break view that needs sideways scrolling or more than one tap to compare sessions on a
  phone.

## Constraints

- Follow `AGENTS.md`: TDD, logic in `src/lib/`, UI in `src/components/` and `src/widgets/`.
  `live.md` stays thin, and the shared `src/index.md`/`src/style.css` get only small edits.
  Before the PR: `npm test`, `npm run lint`, `npm run build`, and Chrome at 1600×1000 and
  400×860.
- `DESIGN.md` vocabulary and tokens ("Add to My Papers", the type pill, the award icons, the
  emoji marker set). Add to DESIGN.md: the Live page, ★ ratings (★ is already the "added by
  hand" marker, so the rating shows as "★4", or as stars in its own control), and 💬 for
  discussion. Lint DESIGN.md after editing.
- Times and day boundaries use the conference timezone (`src/lib/time.js`), never the
  device's.
- Deploy only with John's go-ahead.

## Decided by John

- The break view sorts by the number of My Papers in each session. Each session shows a
  compact preview with topics, authors, type (Full, Short…) and awards.
- Quick notes plus a rating, used to remember later which papers he liked. Rating matters a
  lot to him.
- Bluesky: a template with a link (this tool's or the conference page), photos, and a quick
  search for the authors' Bluesky accounts.
- The time comes from the clock but can be changed by hand. My Papers is shown on the page.

## Calls made by Claude (open to change)

- The page name "Live" and its place in the nav after My Papers.
- A 1–5 star scale. A separate ratings store. Ratings in export/import. Local rating wins on
  import.
- Reusing the existing notes store for quick notes.
- The conference page as the default post link.
- The time override is saved per device and is not in the URL.
- One commitment at a time. An ended commitment returns to the break view.
- 10 papers before "Show all" in an expanded session.

- **Hand-set time (builder check).** Setting a time stores an *offset* from the clock, so the
  set time keeps ticking forward: the "now" highlight still moves, and "running 10 min late"
  works. The override is cleared when the conference day changes (midnight in the
  conference timezone) and by "Back to now". The page always shows "Set time: Wed 10:40 ·
  Back to now" while an override is active. My Papers' `?now=` debug parameter is
  unaffected.
- **Post length (builder check).** Bluesky allows 300 characters. The draft shows a live
  count. When it's over, the template first shortens the author list (the handles you picked,
  then the first other author, then "et al."), then the title (with an ellipsis). It never
  cuts John's note or the link. If it's still over, the count turns red and he edits.
- **Photos (builder check).** Two buttons: "Take photo" (`capture`) and "Choose photos"
  (gallery, `multiple`), because `capture` on Android blocks the gallery.
- **Rating in paper details (builder check, Stage B).** Details shows the same 1–5 star
  control next to "📝 My note", so a rating can be set or fixed from any page.
- **"💬 Discussion" (builder check, Stage C).** Only on the Live page: session rows, "Papers I
  rated" and the Post panel. The feed is read only on Live, never on other pages.

## Left to the builder

The visual layout within the DESIGN.md tokens. Component boundaries. How the feed is paged
and cached within one page load. Exact copy for empty states ("No more sessions today",
"Offline: Bluesky search needs a connection").

---

## Stage D (John, 2026-11-10 afternoon): Worth moving for, Not for me, attended

### Why

In a boring talk, John wants to know, without losing his place, whether something better is
starting soon in another room: **one of his papers, or an award paper**. The current "Switch room"
list doesn't say why a talk matters, has to be scrolled to, and is visually broken (its buttons
centre their content and keep text on one line, so the cards misalign and the titles are cut off).
He also wants to say "I didn't like this" in his ratings and to keep track of **which papers he
attended**.

### Worth moving for (decided: placement A)

- **Trigger.** The session view (checked in) gets a floating **"Soon"** button with a count badge. It
  sits bottom-right above the tab bar on phones and top-right of the session on desktop. The badge
  counts the "worth moving for" talks in **other rooms**. With 0, the button still shows, with no
  badge, so "On now" can be reached.
- **Opens over the current view, without losing context.**
  - **Phone:** a bottom sheet covering about the lower 60% of the screen. The talk on now, its stars
    and the note stay visible above it, under a light dim. Close it with a tap on the dim, ✕, Esc or a
    swipe down.
  - **Desktop:** a popover anchored to the button, about 320px wide, also closed with ✕, Esc or a
    click outside.
  - Focus moves into it and returns to the button on close.
  - It never navigates and never rebuilds the session view: a note being typed keeps its text.
- **Window: the next two talks in each room.** Talks are back-to-back, 9–12 minutes each (VIS
  2026: all 300 timed talks, start-to-start = length). So the window is the two talks after the one on
  now in each parallel session of the slot, about 18–24 minutes. It is not a fixed number of minutes.
  A talk that started less than **2 minutes** ago also counts, as "just started". Other talks
  already under way are not in the rows and don't count toward the badge: they show, with their
  reason chips, in "On now" (builder check).
  Workshops and posters have no talk times, so their sessions contribute nothing.
- **"Worth moving for".** A talk in the window counts when any of these hold:
  - it's in My Papers, labelled **"★ My Papers"** if added by hand, or with the rule that keeps it:
    **"👥 <person>"**, **"🏫 <institution>"**, **"🔍 <topic>"**
  - it has an award, labelled with its icon and group (**"🏆 Best paper"** etc.)

  Several labels may apply. The rows are sorted by:
  1. reason: My Papers (any) first, then award
  2. start time
- **Rows.**
  - "in 8 min · 10:48 · 📍 Room", or "just started · 📍 Room" for a talk under 2 minutes in
  - the type pill, award icon and title (a link opening the details)
  - the reason chips
  - **"Go there →"**, which commits to that session (the same as Switch room today), keeps every
    rating and note, and closes the sheet

  A qualifying talk in **this** room shows "this room" and has no Go button.
- **"On now".** Under the rows, one line per other room: 📍 room · the talk on now (pill and title)
  · its reason chips if any. Tapping a line opens that room's talks in place (as today), with "Go
  there →".
- **It replaces the "Switch room" list.** The new rows lay out left-aligned and wrap titles to at most
  2 lines, and the alignment bug goes away with the old list.
- **Live updates.** The content follows the clock (the same 30 s tick, or the time set by hand), My
  Papers and the watch rules, without closing the sheet.

### 👎 Not for me (decided)

- **Control.** Next to the five stars, a **"👎"** toggle (labelled "Not for me", `aria-pressed`). It
  is mutually exclusive with stars: tapping 👎 clears the stars, and tapping a star clears 👎. Tap
  again to clear it.
- **Storage (builder check).** A separate store, **`papersNavigator:<id>:disliked`**, `{paperId:
  true}`, not -1 in the ratings.
  - Why: today's ratings store re-reads and cleans before every write, so an older tab still open on
    the current build would silently delete every -1 the next time a star is tapped there.
  - The two stores are kept mutually exclusive by the controls: setting one clears the other for
    that paper.
  - Export / Import carry it as an optional `disliked` field, merged like ratings (yours win).
  - Add the key to the About page's storage list.
- **Where it shows.**
  - "👎" after the title in list rows (the ★n marker's place)
  - in paper details next to "Your rating"
  - in "Papers I rated", listed after the starred papers under "Not for me"
  - the 4★-and-up filter hides it
- **Bluesky.** Post on a 👎 paper drafts without stars. The 👎 is never put in a draft.

### Attended papers (decided: automatic + manual)

- **Automatic (builder check).** While checked in to a session, a talk of that session is marked
  attended when you were checked in for at least **5 minutes** of it. That is the overlap of the talk
  with the time from `checkIn.at` to now.
  - It is computed on each tick from the **real clock only**. Nothing is marked while the time is
    set by hand.
  - So after the phone sleeps, the talks it slept through are marked on the next tick if you were
    still checked in, and talks that ended before the check-in never are.
  - No background work.
- **Manual.**
  - Each talk in the session view has **"✓ Attended"** (`aria-pressed`) to untick it if you stepped
    out, or tick it.
  - Paper details on every page have **"I was there"** for any paper, including posters and talks you
    didn't check in to.
  - An untick is remembered: the automatic rule never re-marks a paper you unticked.
- **Storage.** A new store **`papersNavigator:<id>:attended`**, `{paperId: {at, how: "auto" |
  "manual"}}` plus `{paperId: {off: true}}` for unticked. Export / Import carry it as an optional
  `attended` field. On import, your own entries win. Add the key to the About page's storage list.
- **Where it shows.**
  - **"Papers I attended"** on the Live page: by day and time, each with its rating or 👎, and its note
  - "✓" after the title in list rows (Explore, My Papers, researchers)
  - Attended papers you haven't rated get a gentle "Rate it?" in that list

### Non-goals (Stage D)

- Notifications or sounds. The badge is the only alert.
- Any sync beyond Export / Import.
- Computing "worth moving for" for papers outside the program's timed talks.

### Calls made by Claude (open to change)

- **"Soon"** as the button label, and the badge counting only other rooms.
- A separate `disliked` store for 👎 (builder check: older tabs would erase -1 ratings).
- Automatic attendance: real clock only, by overlap with the check-in; 2-minute "just started".
- **5 minutes** for automatic attendance.
- **"Rate it?"** for attended papers you haven't rated.
- **Sort:** My Papers first, then award, then time.
- The sheet height (60%) and the desktop popover width (320px).

### Rated papers join My Papers (John, Stage D)

- **Stars add the paper to My Papers.** Rating a paper with **stars** (1–5), from the Live page or
  from paper details on any page, adds it to My Papers if it isn't there yet. The reason is **"★
  Rated"**, and an Undo toast says "Added to My Papers".
  - "Remove" takes the paper out of My Papers but keeps its rating.
  - Clearing the stars doesn't remove the paper from My Papers.
- **These don't add:** **👎 Not for me** and **attended** papers are never added automatically.

## Stage E (next, own plan): My Papers as the place to review

- **Rated and attended papers.** My Papers shows the papers you rated (stars or 👎) or attended,
  next to your list.
- **Rating filter.** Any combination of 1★…5★, 👎 and "Not rated".
- **"Group by"** for the list: day, reason (★ hand-added / 👥 / 🏫 / 🔍 / ★ Rated), topic (inferred),
  rating, attended, type, session (or room), award.
- **The Live page** keeps "Papers I rated" and "Papers I attended" for the moment, and links to My
  Papers for reviewing.
