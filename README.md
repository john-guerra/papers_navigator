# Papers Navigator

Explore a conference's papers by meaning: semantic search, a 2D embedding map, filters by type, authors, institutions, keywords and sessions, and a personal **My Papers** schedule that tells you which room to go to, with a phone-friendly **Now / Next** view.

First conference: **IEEE VIS 2026** → https://johnguerra.co/viz/papersNavigator/ieeevis2026/ (all conferences: https://johnguerra.co/viz/papersNavigator/)

By [John Alexis Guerra Gómez](https://johnguerra.co). The design lives in `docs/superpowers/specs/2026-10-23-papers-navigator-design.md`.

## How it works

```
ieeevis.org ──► pipeline/fetch_ieeevis.py  ──► papers.raw.json   (not committed)
            └─► pipeline/fetch_sessions.py ──► sessions.json     (every session, also plenaries/panels)
                pipeline/embed.py          ──► papers.json, embeddings.bin, projections/<method>.json
                  ├─ pipeline/clusters.py      ──► clusters.json (+ topic per paper)
                  └─ pipeline/short_labels.py  ──► shortLabel per paper (+ shortLabels.json)
                                                │
                Observable Framework site ◄─────┘  (src/, built to dist/, rsynced to johnguerra.co)
```

All outputs live in `conferences/<id>/data/` and are committed, except `papers.raw.json`.

- Embeddings: `all-MiniLM-L6-v2` on `title + "\n" + abstract`. The browser embeds the query with the same model (Transformers.js), loaded after the page shows.
- Projections are precomputed per method (UMAP, t-SNE, PCA) and listed in the conference config, so new DR methods only need a function in `pipeline/embed.py` plus a config entry.
- Followed papers, notes, ratings and the rest are stored in the browser (localStorage). "Send to my phone" makes a link/QR with short paper ids; JSON export/import carries everything.

## Setup

```sh
npm install
python3 -m venv .venv            # Python 3.12 (what the pipeline is tested with)
.venv/bin/pip install -r pipeline/requirements.txt
```

## Data pipeline (per conference)

Run in this order (`ieeevis2026` stands for the conference id):

```sh
# 1. Papers: the listing is always re-downloaded; paper/session pages come from
#    pipeline/cache/ (≤1 req/s). Prints what changed vs the previous papers.raw.json.
#    --refresh re-downloads every page (~8 min), for when papers changed on the site.
.venv/bin/python -m pipeline.fetch_ieeevis --conference ieeevis2026

# 2. Sessions (one request): what Live needs for plenaries, panels, meetups.
.venv/bin/python -m pipeline.fetch_sessions --conference ieeevis2026

# 3. Embeddings, projections, topic clusters and short labels (from committed labels + cache).
#    Keeps the previous map layout when the papers barely changed; --relayout forces new ones.
.venv/bin/python -m pipeline.embed --conference ieeevis2026

# 4. Optional: new 1–2 word map labels from a local LM Studio model (~50 min uncached).
#    Without it, papers with no committed label get a keyphrase.
.venv/bin/python -m pipeline.short_labels --conference ieeevis2026 --llm lmstudio

# 5. Always: Framework caches data-loader output and won't notice the new files.
rm -rf src/.observablehq/cache/data
```

Then build or preview (below). Run 1–3 and 5 whenever the program changes, even for a moved time or room: `embed` is what writes `papers.json` from `papers.raw.json`. `pipeline.clusters` can recompute the clusters alone.

Regenerated data goes in its own PR, never mixed with a feature (the files are large and binary).

## Develop

```sh
npm run dev      # http://127.0.0.1:3000
npm test         # Vitest (JS)
npm run lint
.venv/bin/pytest pipeline
```

Debug a given moment: My Papers' phone view takes `/my-papers?now=2026-11-10T15:14:00Z`; the Live page has a date-and-time field at the top (it counts only on the day you set it).

## Deploy

```sh
scripts/deploy.sh ieeevis2026
```

Builds with `CONFERENCE=ieeevis2026`, rsyncs `dist/` to `<DEPLOY_ROOT>/<deployDir>` from the conference config, refreshes the landing page listing all conferences, and writes redirects for `legacyDirs`. Server host, SSH key and web root come from the gitignored `.env.deploy` (copy `.env.deploy.example`). Each deploy installs a new offline service worker, so visitors get it on their next visit; their saved data is untouched.

## Adding a conference (or next year)

1. **Config.** Copy `conferences/ieeevis2026/config.json` to `conferences/<id>/config.json` and go through every key (table below). Several values are tied to this year and break things quietly if copied as is.
2. **Fetcher.** For IEEE VIS, the existing `fetch_ieeevis` and `fetch_sessions` read the program site. First check they still parse it: save a current listing, paper and sessions page over the fixtures in `pipeline/tests/fixtures/` and run `.venv/bin/pytest pipeline` (the expected counts in the tests will change; the field checks shouldn't). For another conference, write a fetcher that outputs `conferences/<id>/data/papers.raw.json` in the normalized format (`pipeline/normalize.py`, spec §5.2), and optionally a `sessions.json` for Live.
3. **Pipeline.** Run the data pipeline above with `--conference <id>`. For a new year there are no committed LLM labels yet, so step 4 (LM Studio) is the one that gives good map labels.
4. **Build and check.** `CONFERENCE=<id> npm run build` (or `CONFERENCE=<id> npm run dev`) and look at Explore, My Papers and Live (set Live's time to a conference day).
5. **Social card.** After the first deploy, `npm i --no-save playwright && node scripts/og.js` screenshots the live site into `src/<ogImage>`; commit it and deploy again.
6. **Deploy.** `scripts/deploy.sh <id>`. The default id in `scripts/deploy.sh` and `src/lib/conference.js` (`DEFAULT_CONFERENCE`) is `ieeevis2026`; change it when the new conference becomes the main one.

### Config keys

| Key | What it does | For next year / another conference |
|---|---|---|
| `id`, `name`, `year` | Folder id, the name shown everywhere, the year | Change all three |
| `timezone`, `timezoneLabel` | Every time and day boundary on the site (IANA name, e.g. `US/Eastern`, and its short label, `ET`) | Change with the city |
| `days` | Conference days (`YYYY-MM-DD`): the About page's dates, My Papers' Now / Next ("the conference is over"), the backup reminder's last day | Change |
| `city` | The social card | Change |
| `baseUrl`, `listingUrl`, `sessionsUrl` | Where the fetchers read the program | Contain `/year/2026/`: change |
| `projections` | DR methods to precompute (`umap`, `tsne`, `pca`) | Keep |
| `clusters` | Topic clusters: `minClusterSize`, `minSamples`, `stopWords` | `stopWords` has `"2026"`: change; tune sizes if the topics look too coarse or fine |
| `shortLabels` | Map labels: `enabled`, LM Studio `model` and `baseUrl`, `weakLabels`, `labelOverrides` | **Empty `weakLabels` and `labelOverrides`**: they name this year's labels and paper ids |
| `excludeTypeLabels` | Paper types left out of the map and list (keynotes, plenaries) | Check against the new program's type labels |
| `defaultTypes` | Type ids Explore's Type filter starts with | Check the type ids still exist |
| `typeStyles` | The type pill: `{type: {label, color}}`; `color` names a `--color-type-<color>` token in `src/style.css` (`full`, `tvcg`, `cga`, `short`, `arts`, `workshop`, `challenge`, `poster`, `talk`), or is left out (neutral) | Check the type ids |
| `sessionTypeColors` | Live's session stripe for sessions without papers: `{sessionType: color}` (same color names, plus `plenary`, `meetup`); paper sessions use their papers' type | Check the session types in `sessions.json` |
| `typeNames` | Filter name for a type whose papers carry different type labels (`{type: name}`) | Check |
| `defaultQuery`, `exampleQueries` | Explore's first search and the suggestion chips | Update to the year's topics |
| `siteUrl` | Absolute URL of the deployed site (Live's "This tool" link in Bluesky drafts, the social card's `og:image`) | Change |
| `deployDir` | Folder under `DEPLOY_ROOT` (e.g. `papersNavigator/<id>`) | Change |
| `legacyDirs` | Old folders that redirect here | **Empty it** for a new conference |
| `ogImage` | Social card file in `src/` | New name per conference (platforms cache cards by URL) |

Not in config yet, and specific to IEEE VIS: the Bluesky account read for "💬 Discussion" (`papers.ieeevis.org`) and the `#ieeevis` hashtag in post drafts (`src/lib/bluesky.js`), and the "Details on ieeevis.org" link label on Live.
