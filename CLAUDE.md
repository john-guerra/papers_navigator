# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Pre-scaffold. The only source of truth right now is the approved design: `docs/superpowers/specs/2026-10-23-papers-navigator-design.md`. Read it before doing anything. When the Framework app and pipeline exist, replace this section with real build/lint/test/deploy commands (do not guess them before then).

## What this is

A reusable conference paper navigator (semantic search + embedding map + filters + "My Papers" schedule). One codebase, one config per conference; first target IEEE VIS 2026 (Boston, US/Eastern), with staged releases: Explore + My Papers by ~Nov 3 2026, Clusters by Nov 10 2026, Advanced panel after (design §11).

## Architecture (from the design)

- **Observable Framework** static site (Markdown pages + `.js` modules), deployed by `rsync` to `johnguerra.co:/var/www/viz/<conference>Papers`. One conference per build.
- **Offline Python pipeline** per conference: fetcher → normalized papers JSON (design §5.2 is the contract every fetcher must output) → MiniLM embeddings (`all-MiniLM-L6-v2`, `title + "\n" + abstract`) → UMAP → HDBScan + c-TF-IDF topic labels. Framework data loaders read these outputs. Nothing heavy runs at page load.
- **Widgets** live in `src/widgets/` as plain ES modules following the reactive-widget contract (https://reactivewidgets.org): return an HTMLElement whose `.value` is the selection and which emits/listens to `input` events (`new Event("input", {bubbles: true})`). They must not depend on Observable runtime globals, so they work outside Framework. In pages, consume them with `view(widget)`.
- Keep conference-specific details (timezone, dates, URLs, content types, branding) in the conference config, never in pages or widgets.
- Schedule times are always shown in the **conference timezone**, not the device's.

## Reference material (outside this repo / not committed)

- Previous implementations: `/Users/aguerra/workspace/chi2026_papers` (has its own CLAUDE.md, `scripts/compute_topic_labels.py`, `doc/observable_notebook_architecture.md`) and `/Users/aguerra/workspace/ieeevis2025_papers`.
- Exported Observable notebooks (source of widgets to port): `notebooks/ieeevis2025-papers.tgz`, `notebooks/chi2026-papers.tgz`, `data/chi2026-mypapers.tgz`. Extract to a scratch dir; the main notebook is the file `index.js` re-exports.
- Already-published widget packages with local repos under `/Users/aguerra/workspace/`: `navio`, `reactive-widget-npm` (`reactive-widget-helper`), `vega-selected`.
- VIS 2026 data: scrape `https://ieeevis.org/year/2026/program/content/` (~488 items; each page has authors+affiliations, keywords, session, per-talk time, room, abstract). Cache raw HTML and rate-limit (~1 req/s). `data/ieeevis2026_papers_list.tsv` (from `ieee-vgtc/ieeevis.org` branch `vis2026`) has no abstracts; use only as a cross-check.

## Conventions (carried over from the previous projects)

- ES modules, double quotes, semicolons, 2-space indent; ESLint v9 flat config + Prettier.
- Dated data files: `YYYY_MMmon_DD_<description>.<ext>` (e.g. `2026_04Apr_10_chi2026_umap_TitleAbstract.csv`).
- Repo is **public**: don't commit raw conference dumps or notebook exports (`.gitignore` excludes `*.tgz`; `data/` is currently untracked on purpose).
