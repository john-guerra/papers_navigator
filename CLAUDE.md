# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A reusable conference paper navigator (semantic search + embedding map + filters + "My Papers" schedule). One codebase, one config per conference; first target IEEE VIS 2026 (Boston, US/Eastern). Design: `docs/superpowers/specs/2026-10-23-papers-navigator-design.md`; release stages in its §11 (Stage 1 = Explore + My Papers, Stage 2 = Clusters, Stage 3 = Advanced/live DR + ZADU).

## Commands

```sh
npm run dev                         # Framework preview
npm test                            # all Vitest tests
npx vitest run test/schedule.test.js -t "workshop"   # one test
npm run lint
npm run build                       # CONFERENCE=<id> selects the conference (default ieeevis2026)
.venv/bin/pytest pipeline           # Python tests
.venv/bin/pytest pipeline/tests/test_fetch_ieeevis.py::test_parse_paper
.venv/bin/python -m pipeline.fetch_ieeevis --conference ieeevis2026
.venv/bin/python -m pipeline.embed --conference ieeevis2026
scripts/deploy.sh ieeevis2026       # publishes to johnguerra.co — ask John first
```

## Architecture

- **Offline Python pipeline** (`pipeline/`): fetcher → `conferences/<id>/data/papers.raw.json` in the normalized format (`pipeline/normalize.py` = spec §5.2 contract, flat `sessionId`/`sessionName`) → `embed.py` writes `papers.json` (+ x/y from the first projection), `embeddings.bin` (Float32 LE, row i ↔ papers[i], 384 dims) and `projections/<method>.json` (`{id: [x, y]}`). VIS fetcher falls back to session pages for workshops/challenges and decodes UTF-8 explicitly (the site sends no charset).
- **Framework site** (`src/`): data loaders in `src/data/` read the pipeline outputs for `CONFERENCE`; pure logic in `src/lib/` (search, filters, projections, followed store, schedule, share, time); UI widgets in `src/widgets/` and app glue in `src/components/`. Pages: `index.md` (Explore), `my-papers.md`.
- **Reactive widget contract** (https://reactivewidgets.org): an element whose `.value` is the selection and which emits/listens to `input`. Pages consume widgets with `view()` / `Generators.input()`. The followed store is an `EventTarget` with the same contract.
- Times and day boundaries always use the conference timezone (`src/lib/time.js`), never the device's.
- Conference specifics belong in `conferences/<id>/config.json`, never in pages or widgets.

## Gotchas

- John's npm widgets (`multi-auto-select`, `navio`, `vega-selected`) have a UMD `main`/`browser` field; import their ES builds explicitly (`…/dist/*.es(m).js`).
- `htl` is pinned to 0.3.1 (1.0.0's exports break Framework's resolver). The empty root `tsconfig.json` exists because vega 6 packages extend `../../tsconfig.json`.
- Inputs (`@observablehq/inputs`) only emit `input` once attached to the document — append widgets to `document.body` in jsdom tests.
- Framework caches data-loader output in `src/.observablehq/cache/` and only re-runs a loader when the loader file changes. After re-running the pipeline or editing `config.json`, `rm -rf src/.observablehq/cache/data` or the site serves stale data.
- Vega-Lite interval brushes: drive them in tests with `view.signal("drag_x", …)`/`drag_y`, not `drag`.

## Reference material (not committed)

- Previous implementations: `/Users/aguerra/workspace/chi2026_papers`, `/Users/aguerra/workspace/ieeevis2025_papers`.
- Exported Observable notebooks: `notebooks/*.tgz`, `data/chi2026-mypapers.tgz`.

## Conventions

- ES modules, double quotes, semicolons, 2-space indent; ESLint flat config + Prettier.
- Repo is **public**: don't commit `pipeline/cache/`, `*.tgz`, `data/`, or `papers.raw.json`.
