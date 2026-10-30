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
- `observablehq.config.js` `head`/`header` are JS template literals: a backslash in them (e.g. a regex) is silently eaten, so inline scripts there must avoid backslashes. `cleanUrls: false` because johnguerra.co (Apache) serves `my-papers.html`, not `/my-papers`.
- Offline (#15): `src/sw.js` is a classic service worker that `npm run build` copies to `dist/sw.js` via `scripts/buildSw.js`, stamping a hash of the built pages into `VERSION` so every deploy installs a new worker (Framework doesn't build it: `dynamicPaths` would turn it into an ES-module re-export stub). Registered from the `head` in `observablehq.config.js`; absent in `npm run dev` (registration fails quietly). Bump the `v1` in its `VERSION` if the caching rules change.
- Don't run `prettier --write` on `src/*.md` pages or whole folders: the pages are intentionally unformatted and Prettier reflows their inline HTML/htl templates (large diffs, changed whitespace). Format only the `.js`/`.css` files you touched.
- Vega-Lite interval brushes: drive them in tests with `view.signal("drag_x", …)`/`drag_y`, not `drag`.

## Product docs

- PRD (what to build, user stories with IDs): `docs/prd/2026-10-29-papers-navigator-prd.md`
- Visual design system + UX guidelines: `docs/DESIGN.md` (Google DESIGN.md format). UI work follows its tokens, vocabulary ("Add to My Papers" / "Remove", "Watch", "Matching papers") and reactive-widget rules; where it differs from the PRD or the redesign doc, DESIGN.md wins. Lint it with `npx @google/design.md lint docs/DESIGN.md` after editing.
- Selection/list redesign (option B chosen) and independent review: `docs/prd/2026-10-29-selection-redesign.md`, `docs/prd/2026-10-29-review.md`

## Workflow (issues, several agents in parallel)

- Work is tracked as GitHub issues in `john-guerra/papers_navigator`; each references PRD story IDs and has acceptance criteria. Milestones = release stages; labels `area:*`, `P0`–`P2`.
- Only pick issues labelled `agent-ready`. `needs-decision` means John hasn't decided yet — don't implement it.
- Claim an issue before starting: assign it / comment that you're on it, and add `in-progress`. One agent per issue.
- One issue = one branch `issue-<number>-<slug>` in its own git worktree (Claude Code: `EnterWorktree`; otherwise `git worktree add ../papersNavigator-<number> -b issue-<number>-<slug>`). Run `npm install` in the worktree.
- Base branch: `main` (Stage 1 merged 2026-10-29). Live site: https://johnguerra.co/viz/papersNavigator/ieeevis2026/ — deploy only with John's go-ahead.
- TDD; before opening a PR run `npm test`, `.venv/bin/pytest pipeline`, `npm run lint`, `npm run build`, and check UI changes in Chrome at 1600×1000 and 400×860. PR body says `Closes #<n>` (template in `.github/`).
- Avoid parallel edits to the same hot files: `src/index.md` and `src/style.css` are shared by most UI issues — keep changes there small and move logic into `src/lib/`, `src/components/`, `src/widgets/`. Regenerating `conferences/*/data/` (binary, large diffs) is its own issue; never in a feature PR.
- Comments/PRs written on GitHub on John's behalf start with "Claude (<model-and-version>) in behalf of John".

## Reference material (not committed)

- Previous implementations: `/Users/aguerra/workspace/chi2026_papers`, `/Users/aguerra/workspace/ieeevis2025_papers`.
- Exported Observable notebooks: `notebooks/*.tgz`, `data/chi2026-mypapers.tgz`.

## Conventions

- ES modules, double quotes, semicolons, 2-space indent; ESLint flat config + Prettier.
- Repo is **public**: don't commit `pipeline/cache/`, `*.tgz`, `data/`, or `papers.raw.json`.
