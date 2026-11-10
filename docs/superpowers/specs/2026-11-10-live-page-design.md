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
