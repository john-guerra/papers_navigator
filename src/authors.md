---
title: Researchers
toc: false
---

<link rel="stylesheet" href="./authors.css">

```js
import { storageBanner } from "./components/dataSafety.js";
import { createFollowedStore, resolveFollowed } from "./lib/followed.js";
import { startSyncTracking } from "./lib/sync/track.js";
import { createMyPapers, createRulesStore } from "./lib/rules.js";
import { buildAuthorIndex, findAuthor } from "./lib/authors.js";
import { addWithUndo, selectionReason } from "./lib/selection.js";
import { lazyLoader, relatedPapers, toMatrix } from "./lib/search.js";
import { createAuthorRoute } from "./components/authorRoute.js";
import { renderAuthorIndex, renderAuthorNotFound, renderAuthorProfile } from "./components/authorPages.js";
import { createPaperRoute } from "./components/paperRoute.js";
import { paperPanel } from "./components/paperPanel.js";
import { watchButton } from "./components/watchButton.js";
import { showToast } from "./components/toast.js";
import { bindMyPapersBadge } from "./components/badge.js";
import { conferenceZone } from "./lib/time.js";
import { recommendPapers } from "./lib/recommend.js";
import { afterFirstPaint } from "./lib/researchTopics.js";
```

```js
const conference = FileAttachment("data/conference.json").json();
const papers = FileAttachment("data/papers.json").json();
// Read after first paint for Papers like theirs, or for a paper's related papers (precached by the service worker)
const embeddingsFile = FileAttachment("data/embeddings.bin");
```

```js
const tz = conference.timezone;
// "ET" (config timezoneLabel, else from the zone; DESIGN.md → Vocabulary)
const tzLabel = conferenceZone(conference);
const followedStore = createFollowedStore(conference.id);
const rulesStore = createRulesStore(conference.id);
const store = createMyPapers({ followed: followedStore, rules: rulesStore, papers });
const followed = Generators.input(store);
invalidation.then(bindMyPapersBadge(store));
const loadMatrix = lazyLoader(async () => toMatrix(await embeddingsFile.arrayBuffer(), papers.length));
// Researchers by normalized name (#78): homonyms merge, their affiliations show the merge
const authorIndex = buildAuthorIndex(papers);
// Debug: ?now=2026-11-10T15:14:00Z pretends it is that moment
const nowParam = new URLSearchParams(location.search).get("now");
// Survives re-renders: the index search and how many rows are shown
const indexState = {};
```

```js
// authors.html is the index; authors.html?name=<name> a profile (shareable; Back/Forward move
// between them). Links to this page open in place, without a reload.
const authorRoute = createAuthorRoute();
invalidation.then(() => authorRoute.stop());
invalidation.then(authorRoute.intercept(document.body));
const authorParam = Generators.input(authorRoute);
// The index's search is ?q= (#92): a reload or a shared link keeps it
indexState.query = authorRoute.query;
// Paper details: the same panel and ?paper=<shortId> as on Explore and My Papers
const paperRoute = createPaperRoute({ resolveId: (key) => papers.find((p) => p.shortId === key || p.id === key)?.id });
invalidation.then(() => paperRoute.stop());
const paperParam = Generators.input(paperRoute);
const openPaper = (p) => paperRoute.open(p.shortId ?? p.id);
```

```js
const inMyPapers = (id) => store.value.some((d) => d.id === id);
const author = authorParam ? findAuthor(authorIndex, authorParam) : null;
const authorView = !authorParam
  ? renderAuthorIndex(authorIndex, { state: indexState, onQuery: authorRoute.setQuery })
  : !author
    ? renderAuthorNotFound(authorParam)
    : renderAuthorProfile(author, {
        tz,
        tzLabel,
        now: nowParam ? new Date(nowParam) : new Date(),
        myPapers: () => resolveFollowed(store.value, papers).items,
        inMyPapers,
        onToggle: (p) => {
          if (inMyPapers(p.id)) {
            const undo = store.remove([p.id]);
            showToast("Removed from My Papers", { actionLabel: "Undo", onAction: undo });
          } else {
            const undo = addWithUndo(store, [p], selectionReason({ authors: [author.name] }));
            showToast("Added to My Papers", { actionLabel: "Undo", onAction: undo });
          }
        },
        onAddAll: (fresh) => {
          const undo = addWithUndo(store, fresh, selectionReason({ authors: [author.name] }));
          showToast(`Added ${fresh.length} to My Papers`, { actionLabel: "Undo", onAction: undo });
        },
        onDetails: openPaper,
        detailsHref: (p) => paperRoute.href(p.shortId ?? p.id),
        // Papers like theirs (#150): max similarity to any of their papers, like My Papers' recommendations
        similar: () =>
          new Promise((resolve) => afterFirstPaint(resolve))
            .then(loadMatrix)
            .then((matrix) => recommendPapers(author.papers.map((p) => p.id), matrix, papers)),
        // Watch = an author rule (#5): their papers stay in My Papers, also after program updates
        watch: watchButton({ type: "author", value: author.name }, {
          variant: "secondary",
          rules: rulesStore,
          onWatch: (rule) => {
            const saved = store.watch(rule);
            const n = store.value.filter((d) => d.ruleIds.includes(saved.id)).length;
            showToast(`Watching ${author.name} · ${n} ${n === 1 ? "paper" : "papers"} now in My Papers`, {
              actionLabel: "Undo",
              onAction: () => store.unwatch([saved.id]),
            });
          },
          onUnwatch: (id) => {
            const rule = rulesStore.value.rules.find((r) => r.id === id);
            store.unwatch([id]);
            showToast(`Stopped watching ${author.name}`, { actionLabel: "Undo", onAction: () => rule && rulesStore.add(rule) });
          },
        }),
      });
// the browser tab says whose profile it is
document.title = `${author ? author.name : authorParam ?? "Researchers"} | ${conference.name} Papers`;
```

<div class="author-page">${authorView}</div>

```js
// If this browser stops saving your list, notes or ratings, say so (Stage E)
const storageAlert = storageBanner();
invalidation.then(() => storageAlert.dispose());
display(storageAlert);
```


${paperDetail}

```js
// My Papers changed: refresh toggles, the add button and conflicts in place (keeps scroll/focus)
followed;
authorView.update?.();
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

```js
followed;
paperDetail.update?.();
```

```js
// Paper notes (#152): on this device only; "📝 Note" marks profile rows, the details edit them
import { createNotesStore } from "./lib/notes.js";
import { bindNoteMarkers } from "./components/noteMarkers.js";
import { bindRatingMarkers } from "./components/ratingMarkers.js";
import { createRatingsStore } from "./lib/ratings.js";
import { createDislikedStore } from "./lib/disliked.js";
import { createAttendedStore } from "./lib/attended.js";
const notesStore = createNotesStore(conference.id);
invalidation.then(() => notesStore.dispose());
invalidation.then(bindNoteMarkers(document.querySelector(".author-page"), notesStore));
// Ratings (#203): "★4" on rated rows; also the stars in paper details
const ratingsStore = createRatingsStore(conference.id);
// 👎 Not for me and attended papers (#208); a star rating adds the paper to My Papers
const dislikedStore = createDislikedStore(conference.id);
const attendedStore = createAttendedStore(conference.id);
invalidation.then(() => (dislikedStore.dispose(), attendedStore.dispose()));
invalidation.then(() => ratingsStore.dispose());
invalidation.then(startSyncTracking(conference.id, { followed: followedStore, rules: rulesStore, notes: notesStore, ratings: ratingsStore, disliked: dislikedStore, attended: attendedStore }));
invalidation.then(bindRatingMarkers(document.querySelector(".author-page"), ratingsStore, { disliked: dislikedStore, attended: attendedStore }));
```
