---
title: My Papers
toc: false
---

```js
import { createFollowedStore, resolveFollowed } from "./lib/followed.js";
import { groupIntoSlots, nowNext } from "./lib/schedule.js";
import { renderItinerary } from "./components/itinerary.js";
import { renderNowNext } from "./components/nowNext.js";
import { PapersList } from "./widgets/papersList.js";
import { decodeShareHash, resolveShortIds, shareUrl } from "./lib/share.js";
import { renderShareBanner, renderShareDialog } from "./components/shareDialog.js";
```

```js
const conference = FileAttachment("data/conference.json").json();
const papers = FileAttachment("data/papers.json").json();
```

```js
const tz = conference.timezone;
const store = createFollowedStore(conference.id);
const followed = Generators.input(store);
// Debug: ?now=2026-11-10T15:14:00Z pretends it is that moment
const nowParam = new URLSearchParams(location.search).get("now");
const now = nowParam ? new Date(nowParam) : new Date();
```

```js
const { items, missing } = resolveFollowed(followed, papers);
const schedule = groupIntoSlots(items, tz);
const current = nowNext(schedule.days, now, tz);
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
      onMerge: () => (store.merge(sharedReason()), done()),
      onReplace: () => (store.replace(sharedReason()), done()),
      onIgnore: done,
    }),
  );
}
display(banner);
```

<div class="my-papers-tools">${viewInput} ${shareButton} ${exportButton} ${importInput}</div>
<div>${sharePanel}</div>

```js
const isSmall = window.matchMedia("(max-width: 640px)").matches;
const viewInput = Inputs.radio(["Now / Next", "Itinerary"], {
  value: isSmall && current ? "Now / Next" : "Itinerary",
});
const viewMode = Generators.input(viewInput);
```

```js
const sharePanel = html`<div></div>`;
const shareButton = html`<button>📱 Send to my phone</button>`;
shareButton.onclick = () =>
  sharePanel.childElementCount
    ? sharePanel.replaceChildren()
    : sharePanel.replaceChildren(renderShareDialog(shareUrl(store.value, papers)));
const exportButton = html`<button>⬇️ Export JSON</button>`;
exportButton.onclick = () => {
  const blob = new Blob([store.exportJSON()], { type: "application/json" });
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
  if (!file) return;
  try {
    store.importJSON(await file.text());
    importStatus.textContent = `Imported ${store.value.length} papers.`;
  } catch (error) {
    importStatus.textContent = error.message;
  }
  event.target.value = "";
};
```

<div>${importStatus}</div>

```js
const unfollow = (id) => store.remove([id]);
if (viewMode === "Now / Next") {
  display(
    current
      ? renderNowNext(current, { tz })
      : html`<p class="muted">The conference is not in session right now. Here is your itinerary.</p>`,
  );
}
if (viewMode === "Itinerary" || !current) display(renderItinerary(schedule, { tz, onUnfollow: unfollow, now }));
```

${missing.length ? html`<details class="missing" open><summary>⚠️ ${missing.length} followed papers are no longer in the program</summary><ul>${missing.map((m) => html`<li><code>${m.id}</code> — ${m.reason} <button onclick=${() => store.remove([m.id])}>Remove</button></li>`)}</ul></details>` : ""}

## All followed papers

<div class="my-papers-tools">${searchInput} ${sortInput}</div>

```js
const searchInput = Inputs.search(items, { placeholder: "Search your papers" });
const searched = Generators.input(searchInput);
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
const key = (p) => (sortBy === "start" ? (p.start ?? p.sessionStart ?? "~") : (p[sortBy] ?? "~"));
display(
  PapersList(
    [...searched].sort((a, b) => d3.ascending(key(a), key(b))),
    {
      tz,
      preamble: (p) => html`<strong>Reason:</strong> ${p.reason} · <strong>Added:</strong> ${new Date(p.addedOn).toLocaleDateString()}`,
      actions: (p) => {
        const button = html`<button class="btn-follow following">★ Unfollow</button>`;
        button.onclick = () => store.remove([p.id]);
        return button;
      },
    },
  ),
);
```
