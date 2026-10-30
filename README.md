# Papers Navigator

Explore a conference's papers by meaning: semantic search, a 2D embedding map, filters by type, authors, institutions, keywords and sessions, and a personal **My Papers** schedule that tells you which room to go to, with a phone-friendly **Now / Next** view.

First conference: **IEEE VIS 2026** → https://johnguerra.co/viz/papersNavigator/ieeevis2026/ (all conferences: https://johnguerra.co/viz/papersNavigator/)

By [John Alexis Guerra Gómez](https://johnguerra.co). The design lives in `docs/superpowers/specs/2026-10-23-papers-navigator-design.md`.

## How it works

```
ieeevis.org ──► pipeline/fetch_ieeevis.py ──► papers.raw.json
                pipeline/embed.py          ──► papers.json, embeddings.bin, projections/<method>.json
                                                │
                Observable Framework site ◄─────┘  (src/, built to dist/, rsynced to johnguerra.co)
```

- Embeddings: `all-MiniLM-L6-v2` on `title + "\n" + abstract`. The browser embeds the query with the same model (Transformers.js), loaded on the first search.
- Projections are precomputed per method (UMAP, t-SNE, PCA) and listed in the conference config, so new DR methods only need a function in `pipeline/embed.py` plus a config entry.
- Followed papers are stored in the browser (localStorage). "Send to my phone" makes a link/QR with short paper ids; JSON export/import carries reasons too.

## Setup

```sh
npm install
/opt/homebrew/Caskroom/miniforge/base/bin/python -m venv .venv
.venv/bin/pip install -r pipeline/requirements.txt
```

## Data pipeline (per conference)

```sh
.venv/bin/python -m pipeline.fetch_ieeevis --conference ieeevis2026   # scrape (cached, ≤1 req/s)
.venv/bin/python -m pipeline.embed --conference ieeevis2026           # embeddings + projections
```

Re-run both when the program changes; cached pages are reused (`--refresh` re-downloads paper/session pages at ≤1 req/s; every run prints what changed vs the previous `papers.raw.json`).

## Develop

```sh
npm run dev      # http://127.0.0.1:3000
npm test         # Vitest (JS)
npm run lint
.venv/bin/pytest pipeline
```

Debug the phone view at a given moment: `/my-papers?now=2026-11-10T15:14:00Z`.

## Deploy

```sh
scripts/deploy.sh ieeevis2026
```

Builds with `CONFERENCE=ieeevis2026`, rsyncs `dist/` to `<DEPLOY_ROOT>/<deployDir>` from the conference config, refreshes the landing page listing all conferences, and writes redirects for `legacyDirs`. Server host, SSH key and web root come from the gitignored `.env.deploy` (copy `.env.deploy.example`).

## Adding a conference

1. Create `conferences/<id>/config.json` (copy `ieeevis2026`; set `timezone`, `days`, `projections`, `deployDir` (e.g. `papersNavigator/<id>`), `siteUrl`, …).
2. Write a fetcher that outputs `conferences/<id>/data/papers.raw.json` in the normalized format (`pipeline/normalize.py`, spec §5.2).
3. Run `pipeline.embed`, then `CONFERENCE=<id> npm run build`.
