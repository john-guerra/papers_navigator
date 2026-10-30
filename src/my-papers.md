---
title: My Papers
toc: false
---

```js
import { createFollowedStore, resolveFollowed } from "./lib/followed.js";
import { applyRules, createMyPapers, createRulesStore, filterByReason, normalizeRule, pickReason, reasonOptions, ruleOnlyCount } from "./lib/rules.js";
import { facetValues } from "./lib/filters.js";
import { renderWatching } from "./components/watching.js";
import { showToast } from "./components/toast.js";
import { groupIntoSlots, nowNext, scheduleSummary } from "./lib/schedule.js";
import { afterFirstPaint, startTopicRefresh } from "./lib/researchTopics.js";
import { createDismissedStore, recommendPapers, recommendReason } from "./lib/recommend.js";
import { addWithUndo } from "./lib/selection.js";
import { renderRecommended } from "./components/recommended.js";
import { getEmbedder } from "./lib/embedder.js";
import { lazyLoader, relatedPapers, toMatrix } from "./lib/search.js";
import { createPaperRoute } from "./components/paperRoute.js";
import { paperPanel } from "./components/paperPanel.js";
import { renderItinerary } from "./components/itinerary.js";
import { renderNowNext } from "./components/nowNext.js";
import { PapersList, conferenceLink } from "./widgets/papersList.js";
import { authorUrl } from "./lib/authors.js";
import { decodeShareHash, decodeShareWatches, resolveShortIds, shareUrl } from "./lib/share.js";
import { withParams } from "./lib/urlState.js";
import { exportMyPapers, exportNote, parseMyPapersFile } from "./lib/myPapersFile.js";
import { renderShareBanner, renderShareButton, renderShareDialog } from "./components/shareDialog.js";
import { bindMyPapersBadge } from "./components/badge.js";
import { segmentedControl } from "./widgets/segmentedControl.js";
import { PHONE_QUERY, matches } from "./lib/breakpoints.js";
```

```js
const conference = FileAttachment("data/conference.json").json();
const papers = FileAttachment("data/papers.json").json();
// Never read before first paint: only by the background evaluation of research topics (#24)
// and when a paper's details need related papers (#70). The service worker precaches it with
// the page, so after one visit it's there offline too.
const embeddingsFile = FileAttachment("data/embeddings.bin");
```

```js
const tz = conference.timezone;
// My Papers = papers added by hand ∪ papers of watched people/institutions − exceptions (#5)
const followedStore = createFollowedStore(conference.id);
const rulesStore = createRulesStore(conference.id);
const store = createMyPapers({ followed: followedStore, rules: rulesStore, papers });
const followed = Generators.input(store);
const rulesState = Generators.input(rulesStore);
invalidation.then(bindMyPapersBadge(store));
// The embeddings, loaded once on first need (a failed load, e.g. offline, is retried)
const loadMatrix = lazyLoader(async () => toMatrix(await embeddingsFile.arrayBuffer(), papers.length));
// Research topics (#24): their cached matches show right away; after first paint the model
// loads in the background (not with Save-Data) to re-evaluate them against this program
const topicRefresh = startTopicRefresh({
  rules: rulesStore,
  papers,
  loadEmbedder: getEmbedder,
  loadMatrix,
  onRefresh: ({ updated, ms }) => console.info(`Research topics re-evaluated in ${ms} ms (${updated} updated)`),
});
invalidation.then(() => topicRefresh.stop());
const topicStatus = Generators.input(topicRefresh);
// Survives re-renders: the reason filter's choice (#7)
const reasonState = { key: "all" };
// Debug: ?now=2026-11-10T15:14:00Z pretends it is that moment (and freezes the clock)
const nowParam = new URLSearchParams(location.search).get("now");
// Survives re-renders: selected day and open slots of the itinerary
const itineraryState = {};
```

```js
// Ticks every 30 s so the Now / Next card stays current while the tab is open
const now = Generators.observe((notify) => {
  if (nowParam) return void notify(new Date(nowParam));
  notify(new Date());
  const timer = setInterval(() => notify(new Date()), 30_000);
  return () => clearInterval(timer);
});
```

```js
const { items, missing } = resolveFollowed(followed, papers);
// Reason filter (#7, US5.5): the itinerary and the list show papers kept for one reason
const reasonKeys = new Set(["all", "manual", ...rulesState.rules.map((r) => r.id)]);
if (!reasonKeys.has(reasonState.key)) reasonState.key = "all";
// One options array: Inputs.select matches the value by identity
const reasonChoices = reasonOptions(items, rulesState.rules);
const reasonInput = Inputs.select(reasonChoices, {
  label: "Show",
  format: (d) => d.label,
  value: pickReason(reasonChoices, reasonState.key),
});
const reasonChoice = Generators.input(reasonInput);
```

```js
reasonState.key = reasonChoice.key;
const shownItems = filterByReason(items, reasonChoice.key);
const schedule = groupIntoSlots(shownItems, tz);
// Now / Next answers "where do I go" for all of My Papers, whatever the filter
const fullSchedule = reasonChoice.key === "all" ? schedule : groupIntoSlots(items, tz);
```

```js
const current = nowNext(fullSchedule.days, now, tz, { conferenceDays: conference.days });
```

<h1>My Papers <small>(${items.length})</small></h1>
${paperDetail}

```js
const hash = Generators.observe((notify) => {
  const update = () => notify(location.hash);
  update();
  addEventListener("hashchange", update);
  return () => removeEventListener("hashchange", update);
});
```

```js
const shared = resolveShortIds(decodeShareHash(hash), papers);
// keeps history.state: it counts the open paper details (#70); removes only the share link's
// own keys, so other fragment pairs (#92) stay
const clearHash = () => history.replaceState(history.state, "", withParams(location.href, new URLSearchParams(), ["follow", "watch"]));
const sharedReason = () => shared.ids.map((id) => ({ id, reason: "📱 shared", addedOn: new Date().toISOString() }));
const banner = html`<div></div>`;
// Watch rules from the link (#49) are only ever added, never used to remove local ones (even
// on Replace: losing someone's watches by accident is worse than an extra rule)
const sharedWatches = decodeShareWatches(hash);
const addSharedWatches = () => applyRules(store, rulesStore, sharedWatches);
if (shared.ids.length || shared.unknown.length || sharedWatches.length) {
  const done = () => {
    clearHash();
    banner.replaceChildren();
  };
  // Replace only touches papers added by hand (watch rules stay); it asks inline first and
  // keeps a backup, so it can be undone (#4)
  const mine = new Set(followedStore.value.map((d) => d.id));
  banner.append(
    renderShareBanner(
      {
        ...shared,
        watches: sharedWatches,
        // "already" counts all of My Papers (watched too); Replace only touches hand-added ones
        already: shared.ids.filter((id) => store.has(id)).length,
        // read when Replace is clicked, so they reflect any change since the link opened
        current: () => followedStore.value.length,
        watched: () => store.value.filter((d) => !d.manual).length,
      },
      {
        onMerge: () => (followedStore.merge(sharedReason()), addSharedWatches(), done()),
        onReplace: () => {
          const undoList = followedStore.replace(sharedReason());
          const { undo: undoRules } = addSharedWatches();
          const undo = () => (undoList(), undoRules());
          done();
          showToast(`Replaced your list with ${shared.ids.length} shared papers`, { actionLabel: "Undo", onAction: undo, focusAction: true });
        },
        onIgnore: done,
      },
    ),
  );
}
display(banner);
```

<div class="my-papers-tools">${viewInput} ${reasonInput} ${shareButton} ${exportButton}${exportNoteText} ${importInput} ${restoreButton}</div>
${newNotice}
<div>${sharePanel}</div>

```js
// Created once (no dependency on the followed list) so following/unfollowing keeps the choice
const isSmall = matches(PHONE_QUERY);
const initialDays = groupIntoSlots(resolveFollowed(store.value, papers).items, tz).days;
const liveAtLoad = nowNext(initialDays, nowParam ? new Date(nowParam) : new Date(), tz, { conferenceDays: conference.days });
// A segmented control, not native radios (DESIGN.md → My Papers, phone)
const viewInput = segmentedControl(["Now / Next", "Itinerary"], {
  value: isSmall && liveAtLoad ? "Now / Next" : "Itinerary",
  label: "View",
});
const viewMode = Generators.input(viewInput);
```

```js
const sharePanel = html`<div></div>`;
// The link carries hand-added papers plus watch rules; the phone recomputes watched papers
const currentShareUrl = () => shareUrl(followedStore.value, papers, location.href, rulesStore.value.rules);
const toggleSharePanel = () =>
  sharePanel.childElementCount
    ? sharePanel.replaceChildren()
    : sharePanel.replaceChildren(
        renderShareDialog(currentShareUrl(), {
          count: followedStore.value.length,
        }),
      );
// Phones get the native share sheet; laptops keep the QR panel (#16)
const shareButton = renderShareButton({
  narrow: matches(PHONE_QUERY),
  share: navigator.share?.bind(navigator),
  url: currentShareUrl,
  count: () => followedStore.value.length,
  title: conference.name,
  onFallback: toggleSharePanel,
});
const exportButton = html`<button>Export JSON</button>`;
exportButton.onclick = () => {
  const blob = new Blob(
    [exportMyPapers({ followed: followedStore.value, rules: rulesStore.value.rules, exceptions: rulesStore.value.exceptions })],
    { type: "application/json" },
  );
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `${conference.id}-my-papers.json`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
};
const importInput = html`<label class="import">Import JSON <input type="file" accept="application/json,.json"></label>`;
const importStatus = html`<span class="import-status"></span>`;
importInput.querySelector("input").onchange = async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const text = await file.text();
  // Read the file first: a bad file shows its error before any choice, and the choices can
  // say what the file holds (#52)
  let parsed;
  try {
    parsed = parseMyPapersFile(text);
  } catch (error) {
    importStatus.textContent = `“${file.name}” can't be imported: ${error.message}`;
    return;
  }
  const watchesOf = (n) => (n ? ` and ${n} ${n === 1 ? "watch" : "watches"}` : "");
  const run = (replace) => {
    const before = followedStore.value.length;
    // Rules are added, never removed; the file's exceptions apply only on Replace (on Merge they
    // could hide papers you have here) (#49)
    const undoList = followedStore.importJSON(JSON.stringify(parsed.followed), { replace });
    const rulesResult = applyRules(store, rulesStore, parsed.rules, replace ? parsed.exceptions : []);
    const undo = () => (undoList(), rulesResult.undo());
    importStatus.textContent = replace
      ? `Replaced your list with ${followedStore.value.length} papers${watchesOf(rulesResult.added)}.`
      : `Added ${followedStore.value.length - before} papers${watchesOf(rulesResult.added)} (${store.value.length} total in My Papers).`;
    if (replace) showToast("Replaced your list from the file", { actionLabel: "Undo", onAction: undo, focusAction: true });
  };
  const merge = html`<button>Merge into my list</button>`;
  const replace = html`<button>Replace my list</button>`;
  const contents = `${parsed.followed.length} papers${watchesOf(parsed.rules.length)}`;
  const choices = () => importStatus.replaceChildren(`Import “${file.name}” (${contents}): `, merge, " ", replace);
  merge.onclick = () => run(false);
  // Inline confirm before replacing (no native dialog)
  replace.onclick = () => {
    const yes = html`<button>Yes, replace</button>`;
    const cancel = html`<button>Cancel</button>`;
    yes.onclick = () => run(true);
    cancel.onclick = () => (choices(), replace.focus());
    importStatus.replaceChildren(`Replace your ${followedStore.value.length} papers with the ${parsed.followed.length} in “${file.name}”? `, yes, " ", cancel);
    yes.focus();
  };
  choices();
};
```

<div>${importStatus}</div>

```js
// Removing shows Undo, which restores exactly what was removed (#5)
const unfollow = (id) => {
  const undo = store.remove([id]);
  showToast("Removed from My Papers", { actionLabel: "Undo", onAction: undo });
};
if (viewMode === "Now / Next") {
  display(
    current
      ? renderNowNext(current, { tz, empty: !items.length })
      : html`<p class="muted">The conference is not in session right now. Here is your itinerary.</p>`,
  );
}
// "over" shows the itinerary under its message for reference
if (viewMode === "Itinerary" || !current || current.status === "over") {
  display(renderItinerary(schedule, { tz, onUnfollow: unfollow, onDetails: (p) => openPaper(p), detailsHref: (p) => paperRoute.href(p.shortId ?? p.id), now, state: itineraryState }));
}
```

${missing.length ? html`<details class="missing" open><summary>${missing.length} of your papers are no longer in the program</summary><ul>${missing.map((m) => html`<li><code>${m.id}</code> — ${m.reason} <button onclick=${() => store.remove([m.id])}>Remove</button></li>`)}</ul></details>` : ""}

${watchingSection}

## Recommended papers

${recommendedSection}

## All my papers

<div class="my-papers-tools">${searchInput} ${sortInput}</div>

```js
// Inputs live in a cell that doesn't depend on the list, so (un)following keeps them
const searchInput = Inputs.text({ placeholder: "Search your papers" });
const search = Generators.input(searchInput);
const sortInput = Inputs.select(
  new Map([
    ["Time", "start"],
    ["Room", "room"],
    ["Added on", "addedOn"],
    ["Title", "title"],
    ["Reason", "reason"],
  ]),
  { label: "Sort by" },
);
const sortBy = Generators.input(sortInput);
```

```js
const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
const text = (p) =>
  [p.title, p.authorNames, p.affiliations, p.reason, p.sessionName, p.room].join(" ").toLowerCase();
const searched = shownItems.filter((p) => terms.every((term) => text(p).includes(term)));
const key = (p) => (sortBy === "start" ? (p.start ?? p.sessionStart ?? "~") : (p[sortBy] ?? "~"));
display(
  PapersList(
    [...searched].sort((a, b) => d3.ascending(key(a), key(b))),
    {
      tz,
      authorHref: authorUrl,
      // The title opens the paper's details; "Conference page ↗" goes to the conference site
      details: { href: (p) => paperRoute.href(p.shortId ?? p.id), open: (p) => openPaper(p) },
      preamble: (p) =>
        html`${p.new ? html`<span class="new-badge">New</span> ` : ""}${(p.reasons ?? [p.reason]).map((r) => html`<span class="reason-chip">${r}</span> `)}· Added ${new Date(p.addedOn).toLocaleDateString()}`,
      actions: (p) => {
        const button = html`<button class="follow-toggle" title="Remove from My Papers" aria-label="Remove from My Papers"><span class="ring" aria-hidden="true"></span>Remove</button>`;
        button.onclick = () => unfollow(p.id);
        return html`<span class="paper-actions">${button}${conferenceLink(p)}</span>`;
      },
    },
  ),
);
```

```js
// "New since your last visit": papers a watch rule picked up after a program update (#7)
const newCount = items.filter((d) => d.new).length;
const newNotice = newCount
  ? (() => {
      const seen = html`<button class="btn-text">Mark as seen</button>`;
      seen.onclick = () => store.markSeen();
      return html`<p class="new-notice"><span class="new-badge">New</span> ${newCount} ${newCount === 1 ? "paper" : "papers"} joined My Papers through your watch rules since your last visit. ${seen}</p>`;
    })()
  : html`<span></span>`;
```

```js
// Watching (#7): manage friends and institutions whose papers stay in My Papers
const watchingSection = renderWatching(
  {
    rules: rulesState.rules,
    countFor: (id) => items.filter((d) => d.ruleIds?.includes(id)).length,
    removableFor: (id) => ruleOnlyCount(items, id),
    // Where each rule's papers fall in the program (US11.2), in the conference timezone
    summaryFor: (id) => scheduleSummary(items.filter((d) => d.ruleIds?.includes(id)), tz),
    // A research topic from a share link has no cached matches until the model evaluates it
    noteFor: (rule) =>
      rule.type !== "topic" || rule.evaluatedOn
        ? null
        : topicStatus === "save-data"
          ? "Matches not computed yet: data saver is on. Open Explore to compute them."
          : topicStatus === "error"
            ? "Matches not computed yet: the language model didn't load."
            : "Finding matching papers…",
    names: {
      author: facetValues(papers, "authors").map((d) => d.value),
      affiliation: facetValues(papers, "affiliations").map((d) => d.value),
    },
  },
  {
    onAdd: (rule) => {
      if (rulesStore.has(normalizeRule(rule)?.id)) return showToast(`Already watching ${rule.value}`);
      const saved = store.watch(rule);
      const n = store.value.filter((d) => d.ruleIds.includes(saved.id)).length;
      const message = n
        ? `Watching ${rule.value} · ${n} ${n === 1 ? "paper" : "papers"} in My Papers`
        : `Watching ${rule.value} · no papers match yet (check the spelling; new ones will appear if the program changes)`;
      showToast(message, { actionLabel: "Undo", onAction: () => store.unwatch([saved.id]) });
    },
    onRemove: (id, { keepPapers }) => {
      // Undo puts the same rule back; with keepPapers it also drops the copies kept by hand
      const rule = rulesStore.value.rules.find((r) => r.id === id);
      const kept = keepPapers ? store.value.filter((d) => !d.manual && d.ruleIds.includes(id)).map((d) => d.id) : [];
      store.unwatch([id], { keepPapers });
      showToast(keepPapers ? "Stopped watching; its papers stay in My Papers" : "Stopped watching and removed its papers", {
        actionLabel: "Undo",
        onAction: () => {
          if (kept.length) followedStore.remove(kept);
          if (rule) rulesStore.add(rule);
        },
      });
    },
  },
);
```

```js
// After a Replace, the previous list stays in a backup: offer to bring it back once the Undo
// toast is gone (#52)
followed;
const previous = followedStore.backup();
const sameIds = (a, b) => a.length === b.length && a.every((d, i) => d.id === b[i].id);
// Nothing to offer when the backup is the list you already have
const restoreButton = previous && !sameIds(previous, followedStore.value)
  ? (() => {
      const button = html`<button class="btn-text">Restore previous list (${previous.length})</button>`;
      button.onclick = () => {
        const undo = followedStore.restoreBackup();
        showToast(`Restored your previous list of ${previous.length} papers`, { actionLabel: "Undo", onAction: undo, focusAction: true });
      };
      return button;
    })()
  : html`<span></span>`;
```

```js
// My research topics (#27): their abstracts leave the browser only through Export, so say so
// (its own cell: follows the rules without rebuilding the Share/Export buttons)
const exportNoteText = exportNote(rulesState.rules) ? html` <span class="muted export-note">${exportNote(rulesState.rules)}</span>` : "";
```

```js
// Paper details (#70): the same panel and ?paper=<shortId> URL as on Explore. Related papers
// need the embeddings, loaded only now (they show "unavailable" if that fails offline)
const paperRoute = createPaperRoute({ resolveId: (key) => papers.find((p) => p.shortId === key || p.id === key)?.id });
invalidation.then(() => paperRoute.stop());
const paperParam = Generators.input(paperRoute);
const openPaper = (p) => paperRoute.open(p.shortId ?? p.id);
```

```js
const paperDetail = paperPanel(paperParam, {
  papers,
  tz,
  store,
  route: paperRoute,
  related: (paper) => loadMatrix().then((matrix) => relatedPapers(paper.id, matrix, papers)),
});
invalidation.then(paperDetail.dispose);
```

```js
followed;
paperDetail.update?.();
```

```js
// Recommended papers (#26): the embeddings load after first paint (never before), then papers
// like yours are ranked against My Papers; dismissals stay on this device
const dismissedStore = createDismissedStore(conference.id);
const dismissed = Generators.input(dismissedStore);
const recommendState = { shown: 10, focus: null, key: null, retry: null };
// Created once: the cell below redraws it only when the recommendations change (`now` ticks)
const recommendedSection = html`<div></div>`;
const recommendMatrix = Generators.observe((notify) => {
  // Also "Try again" after a failed load (offline): lazyLoader retries a failed load
  const load = () => {
    notify({ status: "loading" });
    loadMatrix().then(
      (matrix) => notify({ status: "ready", matrix }),
      () => notify({ status: "error" }),
    );
  };
  recommendState.retry = load;
  afterFirstPaint(load);
});
```

```js
// Only the current program: papers no longer in it neither get recommended nor recommend, and
// papers already over aren't recommended
const recommendations = !items.length
  ? { status: "empty" }
  : recommendMatrix.status !== "ready"
    ? recommendMatrix
    : { status: "ready", recs: recommendPapers(items.map((d) => d.id), recommendMatrix.matrix, papers, { exclude: new Set(dismissed), now }) };
const drawRecommended = () => {
  recommendedSection.replaceChildren(
    renderRecommended(recommendations, {
      tz,
      shown: recommendState.shown,
      onShowMore: (n) => {
        recommendState.shown = n;
        drawRecommended();
      },
      onOpen: (p) => openPaper(p),
      onRetry: () => recommendState.retry?.(),
      onAdd: (p) => {
        recommendState.focus = recommendations.recs.indexOf(p);
        const undo = addWithUndo(store, [p], recommendReason(p.because));
        showToast("Added to My Papers", { actionLabel: "Undo", onAction: undo });
      },
      onDismiss: (p) => {
        recommendState.focus = recommendations.recs.indexOf(p);
        const undo = dismissedStore.dismiss(p.id);
        showToast("Dismissed from recommendations", { actionLabel: "Undo", onAction: undo });
      },
    }),
  );
};
const recommendKey = `${recommendations.status}:${(recommendations.recs ?? []).map((p) => p.id).join()}`;
if (recommendKey !== recommendState.key) {
  recommendState.key = recommendKey;
  drawRecommended();
}
// After Add or Dismiss the row is gone: keep the keyboard on the row that took its place
if (recommendState.focus != null) {
  const index = recommendState.focus;
  recommendState.focus = null;
  // once Framework has put the new section on the page
  requestAnimationFrame(() => {
    const rows = recommendedSection.querySelectorAll(".recommended-paper");
    rows[Math.min(index, rows.length - 1)]?.querySelector(".follow-toggle")?.focus();
  });
}
```
