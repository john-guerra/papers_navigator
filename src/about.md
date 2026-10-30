---
title: About
toc: false
---

```js
import { STORAGE_ITEMS, conferenceDateRange, hostName } from "./lib/about.js";
import { bindMyPapersBadge } from "./components/badge.js";
import { createFollowedStore } from "./lib/followed.js";
import { createMyPapers, createRulesStore } from "./lib/rules.js";
```

```js
const conference = FileAttachment("data/conference.json").json();
// Only for the navbar's My Papers count (watched papers count too); precached like the other pages
const papers = FileAttachment("data/papers.json").json();
```

```js
// The navbar's My Papers count, like every other page
const store = createMyPapers({ followed: createFollowedStore(conference.id), rules: createRulesStore(conference.id), papers });
invalidation.then(bindMyPapersBadge(store));
const sourceHost = hostName(conference.listingUrl ?? conference.baseUrl);
const dates = conferenceDateRange(conference.days);
// A fresh element per use (a node can only be in one place)
const sourceLink = () => html`<a href=${conference.baseUrl} target="_blank" rel="noopener">${sourceHost}</a>`;
const storageTable = html`<table class="about-storage">
  <thead><tr><th>Stored as</th><th>What it holds</th></tr></thead>
  <tbody>${STORAGE_ITEMS.map((d) => html`<tr><td><code>${d.key.replace("<id>", conference.id)}</code></td><td>${d.what}</td></tr>`)}</tbody>
</table>`;
```

<style>
.about { max-width: 70ch; }
.about-toc ol { columns: 2; column-gap: var(--spacing-xl, 32px); padding-left: 1.2em; }
.about-toc ol ol { columns: 1; }
.about-toc ol > li { break-inside: avoid; }
.about-storage { font-size: 0.9em; }
.about-storage code { white-space: nowrap; font-size: 0.85em; }
.about-steps li + li { margin-top: 0.25em; }
@media (max-width: 639.98px) {
  .about-toc ol { columns: 1; }
  .about-storage code { white-space: normal; overflow-wrap: anywhere; }
}
</style>

<div class="about">

# About ${conference.name} Papers

<p class="lede">Papers Navigator helps you find the ${conference.name} papers you care about (${dates}), keep them in a personal list, and know which room to be in. It runs entirely in your browser: no account, nothing collected.</p>

<nav class="about-toc" aria-label="On this page">

**On this page**

1. [The project](#the-project)
2. [Privacy](#privacy)
3. [Tutorial: Explore](#explore)
   1. [Search by meaning](#search-by-meaning)
   2. [Filter the program](#filter-the-program)
   3. [Use the map](#use-the-map)
   4. [Open a paper](#open-a-paper)
   5. [Add papers to My Papers](#add-papers-to-my-papers)
   6. [Watch researchers, institutions and research topics](#watch-researchers-institutions-and-research-topics)
   7. [My research: rank the program against your abstracts](#my-research)
   8. [Options: projection, animation, appearance, advanced](#options)
4. [Tutorial: My Papers](#my-papers)
   1. [Now / Next and the itinerary](#now-next-and-the-itinerary)
   2. [Reasons, watching and recommendations](#reasons-watching-and-recommendations)
   3. [Share, export and import](#share-export-and-import)
   4. [At the venue and offline](#at-the-venue-and-offline)
5. [Tutorial: Researchers](#researchers)
6. [Acknowledgments](#acknowledgments)
7. [Credits and feedback](#credits-and-feedback)

</nav>

## The project

Papers Navigator is an open-source explorer for a conference program: search by meaning, a map of similar papers, filters, and a personal schedule (My Papers) that works on a phone at the venue.

- **One codebase, one configuration per conference.** Everything specific to ${conference.name} (name, days, timezone, program website, example searches) lives in one configuration file, so the same app can serve other conferences.
- **Data.** The program comes from the conference website, ${sourceLink()}. An offline script reads its public program pages (cached, at most one request per second; it never downloads PDFs) and turns them into the data this site ships. Times are shown in the conference timezone.
- **Search by meaning.** Each paper's title and abstract was turned into a list of 384 numbers (an *embedding*) with the open MiniLM language model (all-MiniLM-L6-v2). When you search, the same model runs in your browser to embed your words, and papers are ranked by how close their embeddings are to yours. Your search never leaves your device.
- **The map.** UMAP (also t-SNE and PCA) squeezes those 384 numbers into two, so similar papers sit close together. Positions are computed ahead of time; the Advanced options can compute more in your browser.
- **Topics.** The labelled groups on the map come from HDBSCAN clustering on the map positions, named with each group's most distinctive words (c-TF-IDF).

Previous versions: the <a href="https://johnguerra.co/viz/chi2026Papers/" target="_blank" rel="noopener">CHI 2026 papers explorer</a>.

## Privacy

**The app collects nothing: your papers, watches and abstracts never leave your browser.** Like any website, the servers that deliver its files (johnguerra.co, and Hugging Face for the search model) see standard request details such as your IP address.

### What the app does not do

- No accounts, no sign-in.
- No cookies.
- No analytics, trackers, ads or third-party scripts.
- The app sends none of your data anywhere: no searches, no lists, no abstracts. Search and ranking run on your device.

### What stays in this browser

Everything you do is saved in this browser's local storage, separately for each conference, and only on this device (another browser or phone has its own list until you share or export it):

${storageTable}

The browser also keeps a copy of the site's files and of the search model (Cache Storage), so pages open quickly and My Papers works offline.

### Who your browser talks to, and why

- **johnguerra.co**, the web server that hosts this site, delivers its pages and data. Like any web server it may keep standard access logs (IP address, browser, page address, time). Page addresses include an open paper (<code>?paper=…</code>) or researcher (<code>?name=…</code>) when you open or reload such a link. Your list and abstracts never go in a page address that reaches the server. Searches, filters and map options (and the Researchers search too) are kept in the page address after <code>#</code>, so you can reload or share a view; the part after <code>#</code> is never sent to the server.
- **Hugging Face** (huggingface.co and its download servers) delivers the search model files (about 23 MB) the first time you open Explore; after that the browser reuses its saved copy. My Papers also loads it in the background only if you watch research topics (and not when your device asks to save data). Only the model is downloaded: your words are never sent.
- **The conference website** (${sourceHost}) and other sites only when you follow a link, such as a paper's Conference page ↗, a PDF or a video.

The fonts (Newsreader and Source Sans 3) are served by this site itself.

### Share links, QR codes and files

- **Share list** and **Send to my phone** build a link that carries your list inside the link itself, after the <code>#</code> (for example <code>…/my-papers.html#follow=…</code>). Browsers never send that part to the server; whoever you give the link to sees the list. The QR code is drawn in your browser. Your My research abstracts are never put in a link.
- **Export JSON** saves a file on your device (it includes the abstracts of research topics you watch). **Import JSON** reads a file you pick; nothing is uploaded.

### Delete your data

- One thing at a time: **Remove** a paper, **Stop watching** a rule in My Papers → Watching, or **Delete from this device** in My research.
- Everything at once: clear this site's data in your browser's settings (site settings for johnguerra.co: "Delete data" or "Clear site data"). That removes your lists, watches, abstracts, settings and cached files. Export JSON first if you want to keep your list.

## Explore

Explore is the home page: a search box, filters, a map of the whole program and the list of matching papers.

### Search by meaning

1. Type what you are looking for in plain words, for example ${conference.exampleQueries?.slice(0, 3).map((q) => `“${q}”`).join(", ") ?? "a topic"}. Or tap one of the example searches in the introduction under the title.
2. Results are ranked by meaning, not keywords: a paper can match without using your exact words. The search box says "Loading the language model…" until the model is ready (the first visit downloads it).
3. Pick how close a match must be with **Strong · Good · Weak · All**; each shows how many papers it includes. **Good** is the default. Each paper shows its similarity on the right of its row (for example "54%").

### Filter the program

- The facet buttons under the search narrow the matching papers: **Type** (main tracks by default), **Author**, **Institution**, **Keyword**, **Topic** and **Session**. Each opens a list with counts among the matching papers and a search box.
- An active facet shows its value on the button; its ✕ clears it. **Clear all** empties the search and the map region; in the filters it goes back to Main tracks.
- Constraints that aren't facets (your search, a map region) appear as chips with a ✕.
- On a phone the facets fold into one **Filters (n)** button.
- **Share a view:** your search, relevance, filters, map region and map options are kept in the page address, so a reload brings you back to the same view. Copy the address from your browser to send someone exactly what you see. (Your abstracts from My research are never in it. A link with a search pauses My research on the device that opens it; the message offers **Resume**.)

### Use the map

Every dot is a paper; similar papers sit close together.

- **Hover** near a dot for its title, authors, type, session and topic (and similarity after a search); the tooltip follows the nearest point, so you don't have to hit the dot exactly.
- **Click or tap** a dot to open its details.
- **Select a region** to keep only the papers inside it: drag on the map on a laptop. On a phone the map never captures scrolling, so tap **Select region** first, then drag. The region becomes a chip ("Map region ✕").
- **Color by** Similarity (after a search, darker = closer; the legend in the corner runs from "less similar" to "more similar"), Type, Room, Session or Topic.
- **Topic labels** name the groups of similar papers; turn them off with the toggle under the map.
- A ring around a dot means it is **In My Papers**.
- On a phone, **Hide map** tucks the map away.

### Open a paper

- Click a paper's title (in the list, in My Papers or on a researcher profile) or its dot on the map to open its details: abstract, authors and institutions, session, room and time, links, and **Related papers**. Each paper's details have their own address, so you can bookmark or send them. A copied paper title link opens just that paper, without your search and filters.
- **Conference page ↗** opens the paper on the conference website.

### Add papers to My Papers

- One paper: the **Add to My Papers** button next to it (it then reads **In My Papers**; tap again to remove it).
- Many papers: above the list, **Add N to My Papers** adds exactly the N matching papers listed (it says how many are already there).
- Every change shows a message with **Undo**. The navbar's My Papers count shows your list size on every page.

### Watch researchers, institutions and research topics

A *watch* is a standing rule: its papers are always in My Papers, including papers added in later program updates.

- **Watch a researcher or institution** (a friend, your lab, your university): open the Author or Institution facet and press **Watch** on its row (or Watch on a researcher's profile).
- **Watch a research topic:** after a search, press **🔍 Watch this research topic** under the relevance control. A preview shows how many papers match at Strong or Good across the whole program and which would join your list; confirm to save it.
- Manage your watches in My Papers → Watching.

### My research

Rank the whole program against your own work.

1. Press **My research** beside the search box.
2. Paste one or more abstracts (up to 10, a blank line between them).
3. Press **Rank the program**. The list, map colors and Strong · Good · Weak · All now follow your abstracts; each paper is scored by its closest abstract.
4. Optionally **Watch as a research topic** to keep those papers in My Papers.

Your abstracts stay on this device: they are saved in this browser only and never put in share links. **Delete from this device** removes them.

### Options

**⚙ Options** in the navbar (Explore only) opens the map options:

- **Dimensionality reduction:** switch the map between UMAP, t-SNE and PCA.
- **Animation:** how the map moves.
  - *Animate the map*: dots glide to their new places when you switch projections. It starts off if your device asks for reduced motion.
  - *Align projections*: before moving, each projection is rotated, scaled and flipped (Procrustes alignment) to best match the default UMAP map, so dots travel as little as possible.
  - *Animate filter changes*: dots also glide when search, relevance or filters change; a selected map region is kept across those changes.
  - *Motion*: **All at once**, or **By topic** (one topic after another). *Speed*: Slow, Normal or Fast.
- **Appearance:** Auto (follows your device), Light or Dark. Every page uses your choice.
- **Advanced:** live projections, clusters and quality, all computed in your browser:
  - *Compute a projection* with DruidJS on the 384-dimensional embeddings; it joins the projection list.
  - *Re-cluster the map* with HDBSCAN or k-means; adds "Cluster (live)" to Color by.
  - *Projection quality*: trustworthiness and continuity of each projection (1 = perfect).
- **Summary of the matching papers (navio):** an overview of the matching papers by type, room, session and similarity.

## My Papers

My Papers is your personal list and schedule. Everything happens in your browser.

### Now / Next and the itinerary

- Switch between **Now / Next** and **Itinerary** at the top. **Now / Next** (the default on phones during the conference) shows what's on for you right now and what comes next, with the room in large type.
- **Itinerary** lists your papers by day, time slot and room, in the conference timezone.
- ⚠ marks a schedule conflict: two of your papers at the same time in different rooms.
- Click a paper's title to open its details; **Remove** takes it out (with Undo).

### Reasons, watching and recommendations

- Every paper shows why it's in your list (its *reason*): ★ added by hand, 👥 a watched person, 🏫 an institution, 🔍 a research topic, 👤 added from an author, ✨ recommended. Filter the list by reason.
- **Watching** lists your watches with how many papers each brings and where they fall in the week. Add one with **Watch a friend or an institution**; **Stop watching** asks whether to keep or remove its papers.
- **Recommended papers** (✨) are papers similar to the ones in your list. **Add to My Papers**, or **Dismiss** the ones you don't want. They are computed in your browser.
- **New** flags papers that joined your list through your watches after a program update; **Mark as seen** clears the flag.
- **All my papers** at the bottom has a search box and **Sort by** (Time, Room, Added on, Title, Reason).

### Share, export and import

- **Share list** (phones) opens your phone's share sheet. On a laptop, **Send to my phone** shows a QR code and **Copy link**. The link carries the papers you added and your watches (researchers, institutions, research topics), but not your My research abstracts.
- Opening a shared link offers **Merge into my list**, **Replace my list** (asks first, and can be undone) or **Ignore**.
- **Export JSON** saves your list, reasons and watches to a file; **Import JSON** brings it back, on this or another device (merge or replace).
- After a replace, **Restore previous list** brings back the list you had.

### At the venue and offline

After one visit, My Papers, the itinerary, Now / Next and Researchers keep working with weak or no Wi-Fi: the browser keeps a copy of the site, including its fonts.

## Researchers

**Researchers** in the navbar lists everyone with a paper in the ${conference.name} program.

- Search by name or institution (accents don't matter); click a name for their profile. Author names everywhere in the app link here too.
- A profile shows **When they present** (with the next talk), their **Topics**, **Co-authors** and **Papers**, with ⚠ when one overlaps something in your list.
- **Watch** keeps all their papers in My Papers; **Add N to My Papers** adds the current ones once.

## Acknowledgments

Papers Navigator stands on open-source projects and open data. Thank you to their authors.

**In your browser**

- <a href="https://observablehq.com/framework/" target="_blank" rel="noopener">Observable Framework</a> (ISC), <a href="https://github.com/observablehq/inputs" target="_blank" rel="noopener">Observable Inputs</a> (ISC) and <a href="https://github.com/observablehq/htl" target="_blank" rel="noopener">Hypertext Literal</a> (ISC): the site and its controls.
- <a href="https://vega.github.io/vega-lite/" target="_blank" rel="noopener">Vega-Lite</a> and <a href="https://vega.github.io/vega/" target="_blank" rel="noopener">Vega</a> (BSD-3-Clause), <a href="https://github.com/vega/vega-embed" target="_blank" rel="noopener">Vega-Embed</a> (BSD-3-Clause): the map.
- <a href="https://d3js.org" target="_blank" rel="noopener">D3</a> (ISC): data helpers and the histograms.
- <a href="https://github.com/huggingface/transformers.js" target="_blank" rel="noopener">Transformers.js</a> (Apache-2.0) on <a href="https://github.com/microsoft/onnxruntime" target="_blank" rel="noopener">ONNX Runtime Web</a> (MIT): the search model in your browser.
- <a href="https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2" target="_blank" rel="noopener">all-MiniLM-L6-v2</a> (Apache-2.0), in its <a href="https://huggingface.co/Xenova/all-MiniLM-L6-v2" target="_blank" rel="noopener">Transformers.js conversion</a>: the language model.
- <a href="https://github.com/saehm/druidjs" target="_blank" rel="noopener">DruidJS</a> by René Cutura (LGPL-3.0-or-later; <a href="https://www.gnu.org/licenses/lgpl-3.0.html" target="_blank" rel="noopener">license</a>): live projections in Advanced.
- <a href="https://github.com/jonathantarun/zadu-js" target="_blank" rel="noopener">zadu-js</a> by Jonathan Tarun Rajasekaran (MIT), a JavaScript port of <a href="https://github.com/hj-n/zadu" target="_blank" rel="noopener">ZADU</a>: Steadiness &amp; Cohesiveness and per-paper reliability in Advanced (its files are bundled with their license). It uses <a href="https://github.com/GeLi2001/hdbscan-ts" target="_blank" rel="noopener">hdbscan-ts</a> by Ge Li (MIT).
- <a href="https://github.com/soldair/node-qrcode" target="_blank" rel="noopener">node-qrcode</a> (MIT): QR codes.
- John's reactive widgets (MIT): <a href="https://navio.dev" target="_blank" rel="noopener">navio</a>, <a href="https://github.com/john-guerra/vega-selected" target="_blank" rel="noopener">vega-selected</a> and <a href="https://github.com/john-guerra/reactive-widget" target="_blank" rel="noopener">reactive-widget-helper</a>; see <a href="https://reactivewidgets.org" target="_blank" rel="noopener">reactivewidgets.org</a>.
- Fonts <a href="https://fonts.google.com/specimen/Newsreader" target="_blank" rel="noopener">Newsreader</a> and <a href="https://fonts.google.com/specimen/Source+Sans+3" target="_blank" rel="noopener">Source Sans 3</a> (SIL Open Font License), served by this site.

**Preparing the data** (offline, before the site is built)

- <a href="https://sbert.net" target="_blank" rel="noopener">Sentence Transformers</a> (Apache-2.0): the paper embeddings.
- <a href="https://umap-learn.readthedocs.io" target="_blank" rel="noopener">UMAP</a> (BSD-3-Clause) and <a href="https://scikit-learn.org" target="_blank" rel="noopener">scikit-learn</a> (BSD-3-Clause): map positions (UMAP, t-SNE, PCA) and HDBSCAN topics.
- <a href="https://numpy.org" target="_blank" rel="noopener">NumPy</a> (BSD-3-Clause), <a href="https://requests.readthedocs.io" target="_blank" rel="noopener">Requests</a> (Apache-2.0) and <a href="https://www.crummy.com/software/BeautifulSoup/" target="_blank" rel="noopener">Beautiful Soup</a> (MIT): reading the program.

**Data:** the ${conference.name} program, from ${sourceLink()}. Titles, abstracts and authors belong to their authors; this site only helps you find them.

## Credits and feedback

- Written by Claude (Anthropic's AI assistant) on behalf of <a href="https://johnguerra.co" target="_blank" rel="noopener">John Alexis Guerra Gómez</a>, who designs and directs the project. This page and the app's code were written the same way.
- Source code: <a href="https://github.com/john-guerra/papers_navigator" target="_blank" rel="noopener">github.com/john-guerra/papers_navigator</a>, under the <a href="https://github.com/john-guerra/papers_navigator/blob/main/LICENSE" target="_blank" rel="noopener">MIT License</a>. The bundled fonts, DruidJS and the vendored zadu-js files keep their own licenses (listed above).
- Found a problem or have an idea? <a href="https://github.com/john-guerra/papers_navigator/issues" target="_blank" rel="noopener">Open an issue on GitHub</a>.
- This site isn't affiliated with ${conference.name}; for the official program, see ${sourceLink()}.

</div>
