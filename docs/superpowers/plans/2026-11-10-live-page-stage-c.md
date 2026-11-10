# Live Page, Stage C (Bluesky) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native). Steps use `- [ ]`.

**Goal:** Add a "Post" button to the Live page's talks and to "Papers I rated". It opens an editable Bluesky draft:
- **The draft:** title, the authors (with @handles you picked), your rating, your note, a link, and #ieeevis.
- **Author search:** "Find on Bluesky" looks up an author in Bluesky's public search, and you pick the right account.
- **Photos:** "Take photo" and "Choose photos".
- **Sending:** with the phone's share menu, or "Copy text & open Bluesky".
- **"💬 Discussion":** a link when @papers.ieeevis.org posted about the paper.

**Architecture:**
- **`src/lib/bluesky.js`** holds the pure logic: post text and its length, the compose link, matching feed posts to papers, and parsing account search results. The network calls are thin wrappers that take a `fetch` parameter.
- **`src/components/postPanel.js`** renders the draft. It stores picked handles and the link choice on this device.
- **`live.md`** reads the feed once, after the first render, and passes a `discussion` map to the session view and to "Papers I rated".

**Spec:** `docs/superpowers/specs/2026-11-10-live-page-design.md` (the Bluesky draft, Post length, Photos, and "💬 Discussion" sections).

**Worktree:** `/Users/aguerra/workspace/papersNavigator-c`, branch `issue-203-stage-c` (from `main` d013eab).

## Global Constraints

- **Network requests.** The only outside requests are these two, both to `https://public.api.bsky.app/xrpc/`:
  - `app.bsky.actor.searchActorsTypeahead?q=<author name>&limit=5`, sent only when "Find on Bluesky" is tapped
  - `app.bsky.feed.getAuthorFeed?actor=papers.ieeevis.org&limit=100&filter=posts_no_replies`, at most 5 pages, once per Live page load, after the first render

  Notes, ratings and My Papers are never sent anywhere.
- **Handles are never picked automatically.** Only a tap on a search result adds one.
- **Post length** counts graphemes (`Intl.Segmenter`, with a code-point fallback), with a limit of 300.
  - When the draft is over: first shorten the authors, keeping the picked @handles, then the first other author, then "et al."; then the title, with "…".
  - Never cut the note or the link.
- **Template:** `"<title>" by <authors> <★ repeated n> <note>`, then `\n<link>\n#ieeevis`. Empty parts are left out.
- **Link:**
  - default: the conference page (`p.url`)
  - "This tool": `${conference.siteUrl}?paper=${shortId}`
- **New storage keys** (they must be added to the About page's storage list):
  - `papersNavigator:<id>:bskyHandles`: `{authorName: handle}`
  - `papersNavigator:<id>:postToolLink`: boolean
- **Compose link:** `https://bsky.app/intent/compose?text=<encoded>`.
- **Post URL:** `https://bsky.app/profile/<handle>/post/<rkey from the at:// uri>`.
- **Matching feed posts to papers:**
  - first by the paper id in any link: facets or external embed, the `/program/(paper|content)/<uuid>` pattern
  - else by the quoted title in the text (`"…"`), when the normalized quote (lowercased, without "…"), at 25 characters or more, is a prefix of exactly one paper's title
- **Offline:** search and feed failures show "Bluesky search needs a connection" or nothing. They never throw into the page.

## Review Focus

1. **A title or note full of emoji or accented letters, near 300.** The count and the shortening use graphemes, never cut the note, and never split a character.
2. **The search returns 0 results, the request fails, or it's offline.** Show "No accounts found" or "Bluesky search needs a connection". The panel keeps working.
3. **A feed post whose link or title matches nothing**, or the test posts in today's feed. No link, no error.
4. **`navigator.share` missing, `canShare({files})` false, or the share menu dismissed** (AbortError). Fall back to, or keep, "Copy text & open Bluesky", with no error toast for a dismissal.
5. **The same author name in two papers.** The picked handle is reused from storage, by name.

---

### Task 1: `src/lib/bluesky.js` (pure)

**Interfaces:**
- **`graphemes(text) → number`**
- **`composePost({title, authors: string[], handles: {name: handle}, rating = 0, note = "", link = ""}) → {text, length, over: boolean}`**
  - It applies the template and the shortening.
  - An author becomes `@handle` when picked, else stays their name.
- **`composeUrl(text) → string`**
- **`postUrl(atUri, handle) → string`**
- **`paperIdFromLink(url) → uuid | null`**
- **`matchDiscussion(feed, papers) → Map<paperId, postUrl>`**
  - `feed` is the API's `feed` items. The first match per paper wins.
- **`parseAccounts(json) → [{handle, name, avatar}]`**, from the typeahead response.
- **`searchAccounts(name, {fetch}) → Promise<accounts>`** and **`loadDiscussion(papers, {fetch, pages = 5}) → Promise<Map>`**, the thin network wrappers. They reject on HTTP errors and stop paging when there's no cursor.

- [ ] **Step 1: Failing tests** in `test/bluesky.test.js`:
  - **Template:**
    - `composePost({title: "T", authors: ["Ann", "Bo"], handles: {Bo: "bo.bsky.social"}, rating: 4, note: "great", link: "https://x"})`, its text is `"T" by Ann, @bo.bsky.social ★★★★ great\nhttps://x\n#ieeevis`
    - with no rating or note, those parts are left out
  - **Shortening:**
    - a long author list collapses to the picked handles + the first other author + "et al."
    - then the title gets "…"
    - the note and link always stay whole
    - `over` is true only when even that is over 300
  - **Graphemes:** `graphemes("👩🏽‍💻é")` is 2.
  - **Ids from links:** `paperIdFromLink` handles both `/program/paper/<id>/` and `/program/content/<id>`, and returns null otherwise.
  - **`matchDiscussion`, with fixture feed items:**
    - an id link match
    - a quoted-title prefix match
    - a test post that matches nothing
    - two posts for one paper, where the first wins
  - **`postUrl("at://did:plc:x/app.bsky.feed.post/3abc", "papers.ieeevis.org")`** gives `https://bsky.app/profile/papers.ieeevis.org/post/3abc`.
  - **`searchAccounts`** with a fake fetch:
    - the call URL is encoded
    - it parses the results
    - it rejects on `ok: false`
  - **`loadDiscussion`:** pages until there's no cursor, up to `pages`.
- [ ] **Step 2:** Run `npx vitest run test/bluesky.test.js`. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Expect PASS.
- [ ] **Step 5:** Commit `"Bluesky: post text, compose link, discussion matching (#203 Stage C)"`.

### Task 2: Post panel

**Files:**
- Create: `src/components/postPanel.js`
- Test: `test/postPanel.test.js`
- Modify: `src/lib/about.js` (add the 2 storage keys)

**Interfaces:**
- **`createHandlesStore(conferenceId, storage)`** (in `bluesky.js`):
  - `.get(name)` → handle or ""
  - `.set(name, handle | "")`
  - stored under `papersNavigator:<id>:bskyHandles`, with bad stored data tolerated
- **`renderPostPanel(paper, {rating, note, toolLink, handles, linkSetting, discussionUrl, fetch, share = navigator, open = window.open, clipboard = navigator.clipboard})`**
  - `linkSetting` is `createBooleanSetting("papersNavigator:<id>:postToolLink", false)`.
  - It renders:
    - **the draft:** a `<textarea class="post-text">` rebuilt from `composePost` until you edit it by hand, plus the live count "123 / 300", which gets class `is-over` when over
    - **the link choice:** radio buttons "Conference page" / "This tool"
    - **one line per author:** the name, plus the picked "@handle ✕", or "Find on Bluesky"
      - search results: up to 5 buttons with a 24px avatar, display name and @handle, plus "None of these"
      - errors: "No accounts found" / "Bluesky search needs a connection"
    - **photos:** "Take photo" (`<input type=file accept=image/* capture=environment>`) and "Choose photos" (`multiple`), with "n photos" shown
    - **"Share…"** only when `share.share` exists:
      - with photos: if `canShare({files})`, then `share({text, files})`
      - without photos: `share({text})`
      - an AbortError does nothing
    - **"Copy text & open Bluesky":** `clipboard.writeText(text)`, then `open(composeUrl(text), "_blank", "noopener")`
    - **"💬 Discussion on Bluesky"**, when there's a `discussionUrl`

- [ ] **Step 1: Failing tests (jsdom), with fake fetch, share, clipboard and open:**
  - **The draft:**
    - the textarea shows the composed text
    - switching to "This tool" changes the link
    - hand-typed text isn't overwritten by later changes
  - **"Find on Bluesky":**
    - it calls `fetch` with the encoded name and lists the results
    - picking one sets the handle in the store and puts `@handle` in the draft
    - "None of these" closes the list
  - **Search failures:** a rejected search shows "Bluesky search needs a connection"; an empty one shows "No accounts found".
  - **Sending:**
    - "Copy text & open Bluesky" writes the text and opens the compose link
    - "Share…" is absent without `share.share`
    - with a photo picked and `canShare` true, it calls `share` with the files
    - an AbortError is swallowed
  - **The count:** it shows "n / 300", with `is-over` at 301 characters.
  - **About:** `test/about.test.js` stays green, with the new keys listed.
- [ ] **Step 2:** Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Expect PASS.
- [ ] **Step 5:** Commit `"Bluesky post panel (#203 Stage C)"`.

### Task 3: Wire it into the Live page

**Files:**
- Modify: `src/components/liveSession.js` (a "Post" toggle in `.live-talk-actions` that inserts the panel under the row; `el.setDiscussion(map)` adds "💬" links in place)
- Modify: `src/components/ratedPapers.js` (a "Post" toggle per row; a `discussion` option)
- Modify: `src/live.md`:
  - create the handles store and the link setting
  - load the discussion after the first render (`requestIdleCallback`, falling back to `setTimeout(…, 1500)`), passing `fetch: globalThis.fetch`
  - pass `discussion` and `postPanel` factories to both components
  - `toolLink(p) = new URL("./?paper=" + (p.shortId ?? p.id), conference.siteUrl).href`
- Test: `test/liveSession.test.js`, `test/ratedPapers.test.js`

- [ ] **Step 1: Failing tests:**
  - **"Post" on a session row:**
    - toggles a `.post-panel` under that row, built by a passed `postPanel(p)` factory
    - a second tap closes it
  - **`setDiscussion`:** `setDiscussion(new Map([[id, url]]))` adds `<a class="live-discussion" href=url>💬 Discussion</a>` in that row only.
  - **"Papers I rated" rows:** a "Post" toggle, plus the 💬 link from its `discussion` option.
- [ ] **Step 2:** Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Expect PASS.
- [ ] **Step 5:** Commit `"Live: Post and Discussion on talks and rated papers (#203 Stage C)"`.

### Task 4: Docs and verification

- [ ] **Step 1: Docs:**
  - **`DESIGN.md`:** the Post panel (copy, layout, the 300 count, handle picking, sending) and the 💬 marker in the emoji table. Lint it with 0 errors.
  - **About page:** a "Bluesky" paragraph saying what is sent (author names on tap, a public feed read) and what never is.
- [ ] **Step 2: Full checks:** run `npm test`, `npm run lint` and `npm run build`.
- [ ] **Step 3: Browser check** at 400×860 against the real Bluesky API:
  - open a talk's "Post"
  - "Find on Bluesky" for a real author shows results, and picking one adds the @handle
  - the count updates
  - "Copy text & open Bluesky" opens bsky.app/intent/compose with the text
  - no errors when the feed has no matches

  Note for John: the "Share…" path with photos needs testing on his phone.
- [ ] **Step 4:** Commit and push. Then the independent review, fixes, a PR (`Closes #203`), and a deploy with John's go-ahead.
