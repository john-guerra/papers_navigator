---
title: Live
toc: false
---

```js
import { createFollowedStore } from "./lib/followed.js";
import { createMyPapers, createRulesStore } from "./lib/rules.js";
import { createNotesStore } from "./lib/notes.js";
import { createRatingsStore } from "./lib/ratings.js";
import { createLiveClock } from "./lib/liveClock.js";
import { activeSession, createCheckInStore, programDays, slotOf, slotsAt } from "./lib/live.js";
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
```

```js
const conference = FileAttachment("data/conference.json").json();
const papers = FileAttachment("data/papers.json").json();
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
const clock = createLiveClock(conference.id, { tz });
const checkIn = createCheckInStore(conference.id);
invalidation.then(() => (notesStore.dispose(), ratingsStore.dispose(), checkIn.dispose()));
const clockState = Generators.input(clock);
const checkInState = Generators.input(checkIn);
const ratingsState = Generators.input(ratingsStore);
const notesState = Generators.input(notesStore);
// Every paper session of the program, by day and slot of parallel sessions
const days = programDays(papers, tz);
const loadMatrix = lazyLoader(async () => toMatrix(await embeddingsFile.arrayBuffer(), papers.length));
// Survive re-renders: the rated list's filters, and the views kept while only time moves
const ratedState = { minRating: 0, day: null };
const viewState = { key: null, el: null, scrolledFor: null };
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
});
invalidation.then(paperDetail.dispose);
```

<h1>Live</h1>

```js
display(liveClockControl(clock, { tz }));
```

```js
// The session you're in, or the break view. Rebuilt only when what it shows changes (the
// session, the slots, My Papers); a clock tick only moves the "now" highlight, so a note
// being typed or a session list left open survives it.
const at = clockState.at;
const mineIds = new Set(followed.map((d) => d.id));
const session = activeSession(checkInState, days, at, tz);
const slots = slotsAt(days, at, tz);
const key = session
  ? `in:${session.sessionId}:${[...mineIds].join()}`
  : `break:${slots.now?.start}:${slots.next?.start}:${slots.nextDay?.slot.start}:${[...mineIds].join()}`;
if (key !== viewState.key) {
  viewState.el?.dispose?.();
  viewState.key = key;
  const commit = (s) => checkIn.commit(s.sessionId, clock.value.at);
  viewState.el = session
    ? renderSessionView(session, {
        slot: slotOf(session, days),
        at,
        tz,
        mineIds,
        ratings: ratingsStore,
        notes: notesStore,
        onSwitch: commit,
        onLeave: () => checkIn.leave(),
        onAdd: (p) => {
          const undo = addWithUndo(store, [p], "★ Rated on Live");
          showToast("Added to My Papers", { actionLabel: "Undo", onAction: undo });
        },
        onOpen: openPaper,
        detailsHref,
      })
    : renderBreakView(slots, {
        tz,
        mineIds,
        onGoing: commit,
        onPickSlot: (slot) => clock.setTo(new Date(slot.start)),
        onOpen: openPaper,
        detailsHref,
      });
} else viewState.el.setNow?.(at);
display(viewState.el);
// Scroll to the talk on now once per check-in
if (session && viewState.scrolledFor !== session.sessionId) {
  viewState.scrolledFor = session.sessionId;
  requestAnimationFrame(() => viewState.el.scrollToNow());
}
```

<h2 class="live-rated-title">Papers I rated</h2>

```js
// Redrawn when ratings or notes change, and in place when a filter changes
const ratedBox = html`<div></div>`;
const drawRated = () =>
  ratedBox.replaceChildren(
    renderRatedPapers(papers, {
      ratings: ratingsState,
      notes: notesState,
      tz,
      ...ratedState,
      onFilter: (next) => (Object.assign(ratedState, next), drawRated()),
      onOpen: openPaper,
      detailsHref,
    }),
  );
drawRated();
display(ratedBox);
```

${paperDetail}
