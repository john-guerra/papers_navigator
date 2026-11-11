---
title: Live
toc: false
---

```js
import { dataNote, storageBanner } from "./components/dataSafety.js";
import { backupDue, dataTotal, dismissBackup, isIosSafariTab, requestPersistence } from "./lib/storageHealth.js";
import { createFollowedStore } from "./lib/followed.js";
import { createMyPapers, createRulesStore } from "./lib/rules.js";
import { createNotesStore } from "./lib/notes.js";
import { createRatingsStore } from "./lib/ratings.js";
import { createDislikedStore } from "./lib/disliked.js";
import { autoAttended, createAttendedStore } from "./lib/attended.js";
import { createLiveClock } from "./lib/liveClock.js";
import { activeSession, checkedInSession, createCheckInStore, programDays, slotOf, slotsAt } from "./lib/live.js";
import { addWithUndo } from "./lib/selection.js";
import { lazyLoader, relatedPapers, toMatrix } from "./lib/search.js";
import { conferenceZone } from "./lib/time.js";
import { createPaperRoute } from "./components/paperRoute.js";
import { paperPanel } from "./components/paperPanel.js";
import { bindMyPapersBadge } from "./components/badge.js";
import { showToast } from "./components/toast.js";
import { liveClockControl } from "./components/liveClockControl.js";
import { renderBreakView } from "./components/liveBreak.js";
import { renderSessionView } from "./components/liveSession.js";
import { renderRatedPapers } from "./components/ratedPapers.js";
import { renderAttendedPapers } from "./components/attendedPapers.js";
import { renderSessionNotes } from "./components/sessionNotes.js";
import { createViewHost } from "./components/liveViewHost.js";
import { renderPostPanel } from "./components/postPanel.js";
import { createHandlesStore, loadDiscussion } from "./lib/bluesky.js";
import { createBooleanSetting } from "./lib/booleanSetting.js";
```

```js
const conference = FileAttachment("data/conference.json").json();
const papers = FileAttachment("data/papers.json").json();
// Plenaries, panels, meetups: the sessions without papers, shown in the program too
const programSessions = FileAttachment("data/sessions.json").json();
// Only when a paper's details need related papers (precached with the page)
const embeddingsFile = FileAttachment("data/embeddings.bin");
```

```js
const tz = conference.timezone;
const tzLabel = conferenceZone(conference);
// My Papers, as on the My Papers page (hand-added ∪ watched − exceptions)
const followedStore = createFollowedStore(conference.id);
const rulesStore = createRulesStore(conference.id);
const store = createMyPapers({ followed: followedStore, rules: rulesStore, papers });
const followed = Generators.input(store);
invalidation.then(bindMyPapersBadge(store));
// Notes (the same "📝 My note" as everywhere), ratings, the time and the session you're in:
// all on this device only, never in a URL (#203)
const notesStore = createNotesStore(conference.id);
const ratingsStore = createRatingsStore(conference.id);
// 👎 Not for me and attended papers (#208); nothing adds papers to My Papers by itself (John)
const dislikedStore = createDislikedStore(conference.id);
const attendedStore = createAttendedStore(conference.id);
invalidation.then(() => (dislikedStore.dispose(), attendedStore.dispose()));
const dislikedState = Generators.input(dislikedStore);
const attendedState = Generators.input(attendedStore);
const clock = createLiveClock(conference.id, { tz });
const checkIn = createCheckInStore(conference.id);
invalidation.then(() => (notesStore.dispose(), ratingsStore.dispose(), checkIn.dispose()));
const clockState = Generators.input(clock);
const checkInState = Generators.input(checkIn);
const ratingsState = Generators.input(ratingsStore);
const notesState = Generators.input(notesStore);
// Every paper session of the program, by day and slot of parallel sessions
const days = programDays(papers, tz, programSessions);
const loadMatrix = lazyLoader(async () => toMatrix(await embeddingsFile.arrayBuffer(), papers.length));
// Survive re-renders: the rated list's filters, and the views kept while only time moves
const ratedState = { minRating: 0, day: null };
// Bluesky (#203 Stage C): handles you picked for authors, and the draft's link choice
const handlesStore = createHandlesStore(conference.id);
const postLinkSetting = createBooleanSetting(`papersNavigator:${conference.id}:postToolLink`, false);
const toolLink = (p) => new URL(`./?paper=${encodeURIComponent(p.shortId ?? p.id)}`, conference.siteUrl).href;
// Opened from a talk. The draft follows your rating and note until you edit it; open panels are
// kept here, so a redrawn list puts the same panel (draft, photos) back
const postPanels = () => {
  const cache = new Map();
  return {
    cache,
    open: (p) => {
      if (!cache.has(p.id)) cache.set(p.id, newPostPanel(p));
      return cache.get(p.id);
    },
    close: (p) => {
      cache.get(p.id)?.dispose?.();
      cache.delete(p.id);
    },
  };
};
const sessionPosts = postPanels();
const newPostPanel = (p) =>
  renderPostPanel(p, {
    rating: () => ratingsStore.get(p.id),
    note: () => notesStore.get(p.id),
    watch: [ratingsStore, notesStore],
    toolLink: conference.siteUrl ? toolLink(p) : "",
    handles: handlesStore,
    linkSetting: postLinkSetting,
    discussionUrl: discussionHolder.map?.get(p.id) ?? null,
  });
// "Add to My Papers" / "In My Papers" on the Live page (John): the same toggle as everywhere
const inMyPapers = (id) => store.value.some((d) => d.id === id);
const toggleMyPapers = (p) => {
  if (inMyPapers(p.id)) {
    const undo = store.remove([p.id]);
    showToast("Removed from My Papers", { actionLabel: "Undo", onAction: undo });
  } else {
    const undo = addWithUndo(store, [p], "★ Added on Live");
    showToast("Added to My Papers", { actionLabel: "Undo", onAction: undo });
  }
};
// Filled once the official account's posts are read (below; a cell can't reassign another's variable)
const discussionHolder = { map: null };
const viewState = { scrolledFor: null };
// Displayed once (below): ticks update what's inside, so a note being typed keeps its focus
const liveView = createViewHost();
```

```js
// "💬 Discussion" (#203 Stage C): @papers.ieeevis.org's posts about papers, read once after the
// first render (a public feed; nothing of yours is sent). Null until then, or if it fails.
const discussion = Generators.observe((notify) => {
  notify(null);
  let stopped = false;
  const go = () =>
    loadDiscussion(papers).then(
      (map) => !stopped && notify((discussionHolder.map = map)),
      () => {},
    );
  const idle = globalThis.requestIdleCallback ?? ((f) => setTimeout(f, 1500));
  idle(go);
  return () => (stopped = true);
});
```

```js
// The clock ticks every 30 s (a set time keeps ticking from where it was set)
const timer = setInterval(() => clock.tick(), 30_000);
invalidation.then(() => clearInterval(timer));
```

```js
const paperRoute = createPaperRoute({ resolveId: (key) => papers.find((p) => p.shortId === key || p.id === key)?.id });
invalidation.then(() => paperRoute.stop());
const paperParam = Generators.input(paperRoute);
const openPaper = (p) => paperRoute.open(p.shortId ?? p.id);
const detailsHref = (p) => paperRoute.href(p.shortId ?? p.id);
```

```js
const paperDetail = paperPanel(paperParam, {
  papers,
  tz,
  tzLabel,
  store,
  route: paperRoute,
  related: (paper) => loadMatrix().then((matrix) => relatedPapers(paper.id, matrix, papers)),
  notes: notesStore,
  ratings: ratingsStore,
  disliked: dislikedStore,
  attended: attendedStore,
});
invalidation.then(paperDetail.dispose);
```

<h1>Live</h1>

```js
// Your notes and ratings stay in this browser (Stage E): the banner if saving fails, and the note
const storageAlert = storageBanner();
invalidation.then(() => storageAlert.dispose());
display(storageAlert);
```

```js
display(liveClockControl(clock, { tz }));
```

```js
display(liveView);
```

```js
// The session you're in, or the break view, inside the host displayed above: rebuilt only when
// what it shows changes (the session; or the slots and My Papers at a break). A clock tick only
// moves the "now" mark (host.show → setNow) and this cell displays nothing, so a note being typed
// keeps its focus. In a session, "Add to My Papers" updates its own row (no rebuild).
const at = clockState.at;
const mineIds = new Set(followed.map((d) => d.id));
// Why each paper is in My Papers (hand-added, watch rules), for Soon's reason chips (#208)
const mine = new Map(followed.map((d) => [d.id, d]));
const session = activeSession(checkInState, days, at, tz);
const slots = slotsAt(days, at, tz);
const key = session
  ? `in:${session.sessionId}`
  : `break:${slots.now?.start}:${slots.next?.start}:${slots.nextDay?.slot.start}`;
// A check-in made while the time is set by hand is flagged: it never marks attendance (#208 review)
const commit = (s) => checkIn.commit(s.sessionId, clock.value.at, { override: clock.value.override });
liveView.show(
  key,
  () =>
    session
      ? renderSessionView(session, {
          slot: slotOf(session, days, at),
          at,
          tz,
          mineIds,
          mine,
          ratings: ratingsStore,
          disliked: dislikedStore,
          attended: attendedStore,
          notes: notesStore,
          onSwitch: commit,
          onLeave: () => checkIn.leave(),
          inMyPapers,
          onToggle: toggleMyPapers,
          onOpen: openPaper,
          detailsHref,
          postPanel: sessionPosts.open,
          onClosePost: sessionPosts.close,
        })
      : renderBreakView(slots, {
          tz,
          sessionColors: conference.sessionTypeColors,
          notes: notesStore,
          mineIds,
          onGoing: commit,
          onPickSlot: (slot) => clock.setTo(new Date(slot.start)),
          onOpen: openPaper,
          detailsHref,
          inMyPapers,
          onToggle: toggleMyPapers,
        }),
  at,
);
// Attended (#208): the checked-in session's talks you were there for 5+ minutes, on the real
// clock only (never while the time is set by hand); papers you unticked stay unticked
// (the checked-in session even after it ended: a phone that slept through it marks it on waking)
const attendedIn = checkedInSession(checkInState, days);
if (attendedIn && !clockState.override)
  attendedStore.markAuto(autoAttended(attendedIn, checkInState, at), at);
// My Papers changed: Soon's reasons, the toggles and the counts follow in place (#208, John)
liveView.current?.setMine?.(mine);
// Discussion links, once known (a rebuilt view gets them again here)
if (discussion) liveView.current?.setDiscussion?.(discussion);
// Scroll to the talk on now once per check-in
if (session && viewState.scrolledFor !== session.sessionId) {
  viewState.scrolledFor = session.sessionId;
  requestAnimationFrame(() => liveView.current?.scrollToNow?.());
}
if (!session) viewState.scrolledFor = null;
```

<h2 class="live-rated-title">Papers I rated</h2>

```js
// Redrawn when ratings or notes change, and in place when a filter changes (stars, title and
// note only: no toggles, Post or Discussion, to keep it short)
const ratedBox = html`<div></div>`;
const drawRated = () => {
  ratedBox.replaceChildren(
    renderRatedPapers(papers, {
      ratings: ratingsState,
      dislikedIds: Object.keys(dislikedState),
      notes: notesState,
      tz,
      ...ratedState,
      onFilter: (next) => (Object.assign(ratedState, next), drawRated()),
      onOpen: openPaper,
      detailsHref,
    }),
  );
};
drawRated();
display(ratedBox);
```

<h2 class="live-rated-title">Papers I attended</h2>

```js
const attendedBox = html`<div></div>`;
const drawAttended = () =>
  attendedBox.replaceChildren(
    renderAttendedPapers(papers, {
      attended: attendedState,
      ratings: ratingsState,
      disliked: dislikedState,
      notes: notesState,
      tz,
      onOpen: openPaper,
      detailsHref,
    }),
  );
drawAttended();
display(attendedBox);
```

<h2 class="live-rated-title">Session notes</h2>

```js
// Notes on plenaries, panels and meetups (session:<id>), reachable after their slot (#223
// review). Redrawn only when the set of noted sessions changes, never while you type in it.
const sessionNotesBox = html`<div></div>`;
let sessionNoteKeys = null;
let drawingSessionNotes = false;
const sessionNoteKeysNow = () =>
  Object.keys(notesStore.value)
    .filter((k) => k.startsWith("session:") && notesStore.get(k))
    .sort()
    .join("\n");
const drawSessionNotes = () => {
  if (sessionNoteKeysNow() === sessionNoteKeys) return;
  if (sessionNotesBox.contains(document.activeElement)) {
    sessionNotesBox.addEventListener("focusout", () => setTimeout(drawSessionNotes), { once: true });
    return;
  }
  // Disposing saves pending typing, which can fire this again: ignore that nested call, then
  // read the keys after it so the list matches the store
  if (drawingSessionNotes) return;
  drawingSessionNotes = true;
  sessionNotesBox.firstElementChild?.dispose?.();
  sessionNoteKeys = sessionNoteKeysNow();
  sessionNotesBox.replaceChildren(renderSessionNotes(programSessions, { notes: notesStore, tz }));
  drawingSessionNotes = false;
};
drawSessionNotes();
notesStore.addEventListener("input", drawSessionNotes);
invalidation.then(() => {
  notesStore.removeEventListener("input", drawSessionNotes);
  sessionNotesBox.firstElementChild?.dispose?.();
});
display(sessionNotesBox);
```

```js
// The note, and the backup reminder when it's due (Live is where notes and ratings pile up);
// Export lives on My Papers (#export highlights it). Redrawn as your data changes.
ratingsState, notesState, attendedState, dislikedState;
const liveDataTotal = dataTotal({ followed: followedStore, ratings: ratingsStore, notes: notesStore, disliked: dislikedStore, attended: attendedStore });
display(
  dataNote({
    exportHref: "my-papers.html#export",
    nudge: backupDue({ conferenceId: conference.id, total: liveDataTotal, lastDay: conference.days?.at(-1), tz }),
    ios: isIosSafariTab(),
    onDismiss: () => dismissBackup(conference.id),
  }),
);
// Ask the browser to keep this site's data once you have notes or ratings
if (Object.keys(ratingsState).length || Object.keys(notesState).length) requestPersistence();
```

${paperDetail}
