---
title: My Papers
toc: false
---

```js
import { createFollowedStore, resolveFollowed } from "./lib/followed.js";
import { createMyPapers, createRulesStore, filterByReason, normalizeRule, pickReason, reasonOptions, ruleOnlyCount } from "./lib/rules.js";
import { facetValues } from "./lib/filters.js";
import { renderWatching } from "./components/watching.js";
import { showToast } from "./components/toast.js";
import { groupIntoSlots, nowNext } from "./lib/schedule.js";
import { renderItinerary } from "./components/itinerary.js";
import { renderNowNext } from "./components/nowNext.js";
import { PapersList } from "./widgets/papersList.js";
import { decodeShareHash, resolveShortIds, shareUrl } from "./lib/share.js";
import { renderShareBanner, renderShareDialog } from "./components/shareDialog.js";
import { bindMyPapersBadge } from "./components/badge.js";
```

```js
const conference = FileAttachment("data/conference.json").json();
const papers = FileAttachment("data/papers.json").json();
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
const current = nowNext(fullSchedule.days, now, tz);
```

<h1>My Papers <small>(${items.length})</small></h1>

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
const clearHash = () => history.replaceState(null, "", location.pathname + location.search);
const sharedReason = () => shared.ids.map((id) => ({ id, reason: "📱 shared", addedOn: new Date().toISOString() }));
const banner = html`<div></div>`;
if (shared.ids.length || shared.unknown.length) {
  const done = () => {
    clearHash();
    banner.replaceChildren();
  };
  banner.append(
    renderShareBanner(shared, {
      onMerge: () => (followedStore.merge(sharedReason()), done()),
      onReplace: () => (followedStore.replace(sharedReason()), done()),
      onIgnore: done,
    }),
  );
}
display(banner);
```

<div class="my-papers-tools">${viewInput} ${reasonInput} ${shareButton} ${exportButton} ${importInput}</div>
${newNotice}
<div>${sharePanel}</div>

```js
// Created once (no dependency on the followed list) so following/unfollowing keeps the choice
const isSmall = window.matchMedia("(max-width: 640px)").matches;
const initialDays = groupIntoSlots(resolveFollowed(store.value, papers).items, tz).days;
const liveAtLoad = nowNext(initialDays, nowParam ? new Date(nowParam) : new Date(), tz);
const viewInput = Inputs.radio(["Now / Next", "Itinerary"], {
  value: isSmall && liveAtLoad ? "Now / Next" : "Itinerary",
});
const viewMode = Generators.input(viewInput);
```

```js
const sharePanel = html`<div></div>`;
const shareButton = html`<button>📱 Send to my phone</button>`;
shareButton.onclick = () =>
  sharePanel.childElementCount
    ? sharePanel.replaceChildren()
    : sharePanel.replaceChildren(
        renderShareDialog(shareUrl(store.value, papers), { count: store.value.length }),
      );
const exportButton = html`<button>⬇️ Export JSON</button>`;
exportButton.onclick = () => {
  const blob = new Blob([followedStore.exportJSON()], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `${conference.id}-my-papers.json`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
};
const importInput = html`<label class="import">⬆️ Import JSON <input type="file" accept="application/json,.json"></label>`;
const importStatus = html`<span class="import-status"></span>`;
importInput.querySelector("input").onchange = async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const text = await file.text();
  const run = (replace) => {
    try {
      const before = followedStore.value.length;
      followedStore.importJSON(text, { replace });
      importStatus.textContent = replace
        ? `Replaced your list with ${followedStore.value.length} papers.`
        : `Added ${followedStore.value.length - before} papers (${store.value.length} total in My Papers).`;
    } catch (error) {
      importStatus.textContent = error.message;
    }
  };
  const merge = html`<button>Merge into my list</button>`;
  const replace = html`<button>Replace my list</button>`;
  merge.onclick = () => run(false);
  replace.onclick = () => run(true);
  importStatus.replaceChildren(`Import “${file.name}”: `, merge, " ", replace);
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
      ? renderNowNext(current, { tz })
      : html`<p class="muted">The conference is not in session right now. Here is your itinerary.</p>`,
  );
}
if (viewMode === "Itinerary" || !current) {
  display(renderItinerary(schedule, { tz, onUnfollow: unfollow, now, state: itineraryState }));
}
```

${missing.length ? html`<details class="missing" open><summary>⚠️ ${missing.length} of your papers are no longer in the program</summary><ul>${missing.map((m) => html`<li><code>${m.id}</code> — ${m.reason} <button onclick=${() => store.remove([m.id])}>Remove</button></li>`)}</ul></details>` : ""}

${watchingSection}

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
      preamble: (p) =>
        html`${p.new ? html`<span class="new-badge">New</span> ` : ""}${(p.reasons ?? [p.reason]).map((r) => html`<span class="reason-chip">${r}</span> `)}· Added ${new Date(p.addedOn).toLocaleDateString()}`,
      actions: (p) => {
        const button = html`<button class="follow-toggle" title="Remove from My Papers" aria-label="Remove from My Papers"><span class="ring" aria-hidden="true"></span>Remove</button>`;
        button.onclick = () => unfollow(p.id);
        return button;
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
