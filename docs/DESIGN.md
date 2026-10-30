---
version: alpha
name: Papers Navigator — Proceedings
description: >-
  Visual identity and UX guidelines for the Papers Navigator, a reusable
  conference paper explorer (first target IEEE VIS 2026). Editorial, warm
  paper, serif titles, one oxblood accent. Light is the default theme; dark is
  a selected variant (tokens prefixed `dark-`).
colors:
  # Light (default)
  primary: "#903129" # oxblood accent: primary action, selected state, similarity
  on-primary: "#fbf8f1"
  primary-hover: "#78231d"
  primary-container: "#ffe4e0" # soft accent: conflict notes, selected rows
  on-primary-container: "#241e1a"
  background: "#fcf9f3" # warm paper
  surface: "#fffdfa" # nav, popovers, cards
  surface-sunken: "#f6efe1" # active facet, highlighted text, hover
  surface-hover: "#ece7df"
  on-surface: "#241e1a" # ink
  on-surface-muted: "#605954" # secondary text; also control outlines (>= 3:1)
  outline: "#d8d3cc" # hairline rules, decorative only (1.4:1)
  focus: "#1f74bf" # focus ring, the only blue in the UI
  # Data visualization (light)
  viz-similarity-1: "#d5958c" # weakest still-matching paper
  viz-similarity-2: "#b14f45"
  viz-similarity-3: "#75201a" # strongest match
  viz-reliability-1: "#a3b0dc" # most reliable paper (map neighborhood preserved)
  viz-reliability-2: "#5f74bf"
  viz-reliability-3: "#28377a" # least reliable; also the distortion overlay fill
  viz-dim: "#e1ddd8" # filtered-out / outside brush
  viz-neutral: "#605954" # points when no query and no color-by
  viz-followed-ring: "#241e1a" # "in My Papers" ring
  viz-cat-1: "#2a78d6"
  viz-cat-2: "#eb6834"
  viz-cat-3: "#1baf7a"
  viz-cat-other: "#c9c3bb"
  # Dark (selected variant)
  dark-primary: "#eb8373"
  dark-on-primary: "#16100f"
  dark-primary-hover: "#fb9989"
  dark-primary-container: "#492924"
  dark-on-primary-container: "#eeebe5"
  dark-background: "#181512"
  dark-surface: "#221f1b"
  dark-surface-sunken: "#2d2823"
  dark-surface-hover: "#312d28"
  dark-on-surface: "#eeebe5"
  dark-on-surface-muted: "#aeaaa4"
  dark-outline: "#413c38"
  dark-focus: "#70b3f7"
  dark-viz-similarity-1: "#8f4e44"
  dark-viz-similarity-2: "#d67161"
  dark-viz-similarity-3: "#ffa99a"
  dark-viz-reliability-1: "#3d4a80"
  dark-viz-reliability-2: "#6f84cf"
  dark-viz-reliability-3: "#b4c3ff"
  dark-viz-dim: "#3b3734"
  dark-viz-neutral: "#aeaaa4"
  dark-viz-followed-ring: "#eeebe5"
  dark-viz-cat-1: "#3987e5"
  dark-viz-cat-2: "#d95926"
  dark-viz-cat-3: "#199e70"
  dark-viz-cat-other: "#5a554f"
typography:
  display: # page titles ("My Papers"), room name on the Now card
    fontFamily: Newsreader
    fontSize: 1.75rem
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: -0.01em
  room: # room name in the Now card
    fontFamily: Newsreader
    fontSize: 1.875rem
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: -0.015em
  headline: # section heads ("Matching papers"), italic in use
    fontFamily: Newsreader
    fontSize: 1.25rem
    fontWeight: 500
    lineHeight: 1.2
  search: # the search field text, italic in use
    fontFamily: Newsreader
    fontSize: 1.375rem
    fontWeight: 400
    lineHeight: 1.2
  title-paper: # paper titles in lists
    fontFamily: Newsreader
    fontSize: 1.0625rem
    fontWeight: 500
    lineHeight: 1.3
  brand:
    fontFamily: Newsreader
    fontSize: 1.1875rem
    fontWeight: 500
    lineHeight: 1
  body-md:
    fontFamily: Source Sans 3
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.5
  body-sm: # authors, abstracts in lists
    fontFamily: Source Sans 3
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.45
  label-md: # buttons, tabs, chips
    fontFamily: Source Sans 3
    fontSize: 0.8125rem
    fontWeight: 500
    lineHeight: 1.2
  label-caps: # group headers in popovers, "NOW · UNTIL 09:30"
    fontFamily: Source Sans 3
    fontSize: 0.6875rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.08em
  meta: # type · room · time line; counts
    fontFamily: Source Sans 3
    fontSize: 0.78125rem
    fontWeight: 400
    lineHeight: 1.3
    fontFeature: '"tnum" 1'
rounded:
  none: 0px
  sm: 3px # buttons, segmented controls, inputs with a box
  md: 6px # popovers, cards, the Now card
  lg: 12px # bottom sheets (top corners only)
  full: 9999px # chips, badges, follow toggle, map marks
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px # phone side gutter
  xl: 24px # list column padding
  2xl: 28px # desktop page gutter
  3xl: 40px
  touch: 44px # minimum hit target on phones
components:
  nav-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.label-md}"
    height: 56px
    padding: 0 28px
  nav-tab-active:
    textColor: "{colors.on-surface}"
  tab-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.label-md}"
    height: 56px
  badge-my-papers:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.meta}"
    rounded: "{rounded.full}"
    height: 20px
    padding: 0 6px
  search-field:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface}"
    typography: "{typography.search}"
    rounded: "{rounded.none}"
    height: 44px
  relevance-segment:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    height: 40px
    padding: 0 14px
  relevance-segment-selected:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
  segmented-control: # Now / Next · Itinerary, Appearance, Motion, Speed: like the relevance control
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    height: 36px
    padding: 0 12px
  select:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    height: 34px
    padding: 0 28px 0 10px
  checkbox:
    backgroundColor: "{colors.background}"
    rounded: "{rounded.sm}"
    size: 16px
  checkbox-checked:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
  chip:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    height: 28px
    padding: 0 6px 0 10px
  facet-button:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    height: 30px
    padding: 0 10px
  facet-button-active:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.on-surface}"
  facet-button-open:
    backgroundColor: "{colors.on-surface}"
    textColor: "{colors.background}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    height: 34px
    padding: 0 14px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    height: 34px
    padding: 0 12px
  button-text:
    backgroundColor: "{colors.background}"
    textColor: "{colors.primary}"
    typography: "{typography.label-md}"
  follow-toggle:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    height: 28px
    padding: 0 10px 0 4px
  popover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
  bottom-sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
  paper-row:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface}"
    typography: "{typography.title-paper}"
    padding: 14px 0
  now-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 16px
  conflict-note:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 8px 10px
  toast:
    backgroundColor: "{colors.on-surface}"
    textColor: "{colors.background}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: 10px 14px
---

# Papers Navigator — Design

Status: approved direction **A · Proceedings** (2026-10-29). Mockups: [Claude Design project](https://claude.ai/design/p/6ae09146-78b7-466f-9d56-e58c61ca6faa?file=Directions.dc.html) (directions) and [filters](https://claude.ai/design/p/6ae09146-78b7-466f-9d56-e58c61ca6faa?file=A+Filters.dc.html).

This file follows the [DESIGN.md format](https://github.com/google-labs-code/design.md): the YAML front matter holds the **normative tokens**; the sections below explain how to apply them. After the standard sections come project-specific ones (Vocabulary, Interaction & State, Data Visualization, Emoji, Mobile, Accessibility, Building UI). What to build lives in the PRD (`docs/prd/2026-10-29-papers-navigator-prd.md`); story IDs like US4.3 refer to it.

Check this file with `npx @google/design.md lint docs/DESIGN.md`.

**Scope and authority.** This file describes the target look and behavior; it is built incrementally through the GitHub issues (AGENTS.md → Workflow), not in one pass. Where the mockups and this file disagree, this file wins; the mockups are illustrative. Where this file and the PRD disagree on _what_ to build, the PRD wins and this file gets fixed. Decisions are logged at the end.

## Overview

The Papers Navigator helps a conference attendee find the papers they care about, keep a personal list, and know which room to be in, on a laptop while planning and on a phone at the venue.

**Feel: a well-typeset proceedings volume that happens to be interactive.** Clean, elegant, with a research appeal; never a SaaS dashboard. Warm paper background, ink text, serif for anything you _read_ (titles, rooms, headings, the search query), a quiet sans for anything you _operate_ (buttons, labels, counts). One accent color, oxblood, carries meaning and nothing else. Hairline rules instead of boxes. Generous whitespace, but dense where scanning matters (lists, itineraries).

**It must be particularly easy to use.** A first-time visitor understands the page in five seconds; an attendee between talks gets the room in two.

### Design principles

Every UI decision should be traceable to one of these. When a PR breaks one, it says which and why.

1. **One concept, one mark.** A concept looks the same everywhere it appears. "In My Papers" is a ring on the map, a filled ring toggle in lists, and a count badge in the nav, never a color, never three different labels. Similarity is the oxblood ramp, nothing else is. (Consistency; Norman.)
2. **No hidden state.** Every constraint narrowing what you see is visible on screen and removable in one click: the query, the relevance level, each facet, the map brush. If the list shows 12 of 283, the page says why. (Visibility of system status; Nielsen #1.)
3. **Overview first, zoom and filter, then details on demand.** The map gives the landscape; search, relevance and facets narrow it; a paper opens for details. (Shneiderman's mantra.)
4. **Recognition over recall.** Offer what exists instead of asking people to remember it: counted facet lists, example queries, autocomplete. (Nielsen #6.)
5. **Make actions reversible instead of asking for confirmation.** Prefer Undo after the fact over "Are you sure?". The only confirmations are inline two-step ones for destroying a list (Replace). (Nielsen #3, #5.)
6. **Say exactly what an action will do.** Buttons carry their count and target: "Add 96 to My Papers", "3 already there". A count on a button always equals what is listed. (US4.3.)
7. **Data-ink first.** Chrome recedes: hairlines, muted labels, no decorative color, no gradients, no shadows except on floating layers. Ink goes to papers and data. (Tufte.)
8. **The conference clock is the truth.** Times and days are always in the conference timezone, labelled (ET), never the device's.
9. **Phone is a first-class target, not a fallback.** Full feature set on a 400px screen (Q2), with a layout designed for it, not squeezed.
10. **Fast perceived performance.** Map visible in ~2 s; controls that depend on the model show a loading state, never a broken one (Q1).

## Colors

Tokens are in the front matter. Rules:

- **Oxblood (`primary`) is reserved for meaning:** the one primary action on a screen, the selected state (relevance segment, follow toggle, active "Now"), the similarity ramp, and the My Papers badge. Never decoration, never headings, never borders.
- **Ink (`on-surface`) for content, muted (`on-surface-muted`) for metadata.** Muted is also the outline for interactive controls that need a visible boundary (checkboxes, unchecked toggles), since it clears 3:1. `outline` (1.4:1) is for decorative hairlines only.
- **`surface-sunken`** marks "active but not primary": an applied facet button, matched text in suggestions, a hovered row.
- **`primary-container`** is for notes that need attention without alarm: schedule conflicts, "new since last update".
- **Focus is blue (`focus`)**, the only blue in the UI, so keyboard focus is never confused with selection.
- **Status colors are not part of this palette.** The app has no good/warning/error states beyond conflicts; those use `primary-container` plus a ⚠ marker and text, never color alone.
- **Dark theme** is a selected variant, not an automatic inversion: use the `dark-*` tokens. An **Appearance toggle (Auto · Light · Dark)** is OK and lives only in Options (Explore); other pages follow the saved choice and show no control: Auto follows `prefers-color-scheme`, Light/Dark force a theme via `data-theme` on `<html>`, remembered per browser and applied before first paint. Light is the default and the reference for screenshots.
- Text contrast (WCAG): ink on paper 15.7:1, muted on paper 6.5:1, on-primary on primary 7.5:1; dark: 15.3, 7.9, 7.2. All AA.

## Typography

- **Newsreader** (serif, optical sizes) for what you read: paper titles, room names, page and section headings, the search query, the brand. Section heads and the query are set in _italic_.
- **Source Sans 3** for what you operate: buttons, tabs, chips, labels, authors, metadata, counts.
- **Numbers are tabular** (`font-feature-settings: "tnum"`) wherever they align or update: counts, times, scores.
- Self-host both (`src/fonts/`, generated by `scripts/fonts.js` from `@fontsource-variable`), never Google Fonts (it sees every visitor's IP); `font-display: swap`, subset by `unicode-range`; fall back to Georgia / system-ui.
- Paper titles wrap with `text-wrap: pretty`; never truncate a title with ellipsis (one exception: the floating Nearest neighbours card's rows, see Interaction & State → Nearest neighbours). Author lists and abstracts may clamp to 2–4 lines with a "more" toggle, **never an inner scroll box**.
- Uppercase only for `label-caps` (popover group headers, card kickers), always letter-spaced.
- Measure: running text (abstracts) max 70ch.

## Layout

- **Breakpoints:** phone `< 640px`, tablet `640–1023px`, desktop `≥ 1024px`. Test at 400×860 and 1600×1000 (AGENTS.md). Stylesheets write them as `(max-width: 639.98px)` and `(max-width: 1023.98px)` (no other widths; a test checks), JS uses `PHONE_QUERY` / `STACKED_QUERY` from `src/lib/breakpoints.js`. Explore stacks controls, map and list below 1024px; phone-only changes (Filters sheet, Select region, 16px gutter) start below 640px.
- **Gutters:** 28px desktop, 16px phone. Spacing comes from the 4px scale in the tokens; don't invent values.
- **Explore, desktop:** nav (56px) → controls band (search + relevance, then the facet strip) → body split **7fr map / 5fr list**, separated by a hairline. The map is sticky (under the nav, 12px gap) and fits the viewport height; the list scrolls. Only on this two-column layout: below 1024px the map scrolls with the page, above the list. The map's height comes from `src/lib/mapSize.js` (3/4 of its width, 320–620px, and never taller than the viewport minus the nav, title and controls); the Nearest neighbours card floats over the map's corner here, so the column never grows; only a window too short for the 240px minimum makes the map column scroll on its own.
- **Explore, phone:** nav → search → relevance → one "Filters (n)" button → chips → **map** (visible by default, "Hide map" tucks it away; decision 8) → list. The map never captures page scrolling (see Mobile & At the venue).
- **Phone navigation:** below 640px the nav's links move to a **bottom tab bar** on every page (see Nav bar); the top bar keeps the brand and ⚙ Options. Pages leave room for it (`body` padding, toasts above it, except while a layer that covers it is open: details panel, Options drawer, Filters sheet).
- **My Papers, phone and tablet:** title → Now / Next · Itinerary segmented control and Show filter → list tools (Share, Export, Import) → Now / Next or the itinerary → Watching → Recommended papers → All my papers, one column.
- **My Papers, desktop:** two columns, separated by a hairline. **Main** (fluid): the segmented control and Show filter, the itinerary by day (tabs) with slots as rows (or Now / Next), then All my papers. **Side column** (300–360px): list tools (Share / Send to my phone, Export JSON, Import JSON, Restore previous list), Watching (the rules), Recommended papers ✨. The sections move between columns in the DOM (`src/components/myPapersLayout.js`), not with CSS `order`, so reading and focus order match the screen.
- No horizontal page scroll at any width. Rows of sibling controls use flex/grid with `gap`, never margins between inline elements.

## Elevation & Depth

The page is flat paper. Structure comes from hairlines (`outline`) and whitespace, not boxes or shadows.

- **Level 0** (everything on the page): no shadow.
- **Level 1** (floating layers only: popovers, autocomplete, bottom sheets, toasts): `0 12px 32px -12px rgb(36 30 26 / .28), 0 2px 6px -2px rgb(36 30 26 / .12)`; in dark, `0 12px 32px -12px rgb(0 0 0 / .6), 0 2px 6px -2px rgb(0 0 0 / .4)`. Use `var(--elevation-1)`, never a hand-written shadow, so dark gets its own.
- The Now card is distinguished by a 1.5px ink border, not a shadow.
- No glassmorphism, no blur.

## Shapes

- Controls: `rounded.sm` (3px). Popovers and cards: `rounded.md` (6px). Sheets: `rounded.lg` on the top corners.
- Pills (`rounded.full`) only for chips, the badge, the follow toggle and map marks.
- The search field is an underline (1.5px ink), not a box, on desktop and phone.
- No left-border accent stripes on cards.

## Components

Visual specs; tokens in the front matter. Behavior in _Interaction & State_.

- **Nav bar.** Brand (Newsreader) + conference name in `label-caps` muted; tabs Explore · My Papers · Researchers · About with **badge-my-papers** showing the list size on every page (US4.4). Active tab: ink text with a 2px ink underline (`aria-current="page"`).
- **Tab bar (phones).** Below 640px, the nav's four links (Explore · My Papers · Researchers · About, same badge) sit in a bar fixed to the bottom of the screen: `surface`, `outline` hairline on top, four equal cells, each a 56px-tall target, padded by `env(safe-area-inset-*)` (the head adds `viewport-fit=cover`). Current page: ink text with a 2px ink bar on the top edge. It replaces the ☰ menu (gone). Floating layers that cover the page (details panel, Options drawer, Filters sheet) also cover the tab bar.
- **Search field.** Newsreader italic, underline only, an example search as the placeholder. While the model loads: disabled with "Loading the language model…" as the placeholder, never a spinner over the map; if it fails, "Search unavailable: …" (text, no marker).
- **Relevance control.** Segmented control _Strong n · Good n · Weak n · All n_ with counts; selected segment is `primary`. Replaces the score histogram in the default UI (the histogram may live in an advanced view).
- **Facet strip.** A row of **facet buttons** under the search: `Type: Main tracks ▾ · Author ▾ · Institution ▾ · Keyword ▾ · Session ▾ │ Clear all` (a Day facet is optional, builder's call). A facet with a value shows it in the button ("Institution: Northeastern +1") on `surface-sunken`, with a ✕ that clears that facet, so **an active facet button is the chip for that facet**; the open facet is inverted (ink background). Each opens a **popover**: a search input (underline), a `label-caps` header ("Among matching papers"), rows of _checkbox · name · scent bar · count · row action (Watch)_, and a footer ("Show all 513"). Counts are crossfilter-style (computed with every other constraint applied). On phones the strip collapses into one "Filters (n)" button opening a bottom sheet with the facets stacked. The facet strip is a reactive widget; its API is specified in its own issue, not here.
- **Chips.** For constraints not in the facet strip (topic query, map region): label in muted + value in ink + ✕. Pill, transparent with an `outline` border. Followed by "Clear all" as a text button. **Clear all** here empties the search (like its chip's ✕; the default search is for first visits only) and the map region; the facet strip's Clear all goes back to Main tracks and hides there. After both, the fragment is just `#q=`.
- **Segmented control.** A row of buttons in one `outline` box, the selected one `primary` (`aria-pressed`, in a labelled `role="group"`): the relevance control, My Papers' _Now / Next · Itinerary_, Appearance, Motion and Speed. Use it instead of radios when there are 2–4 options; `src/widgets/segmentedControl.js` is the reactive widget (`.value` + `input`).
- **Select.** A native `<select>` (keyboard, screen readers and the platform's option list stay) drawn like a secondary button: `surface`, muted outline, `rounded.sm`, 34px, a muted chevron on the right. For 5+ options or dynamic lists (Color by, Projection, Show: reasons, Sort by, Watch type). The label sits beside it in muted `label-md`.
- **Checkbox.** A native checkbox drawn as a 16px box with a muted outline; checked = `primary` fill with an `on-primary` check. Its label is part of the hit area (Topic labels, Animation switches, Advanced options).
- **Buttons.** One **primary** per view (e.g. "Add 96 to My Papers"). **Secondary** for alternatives (Export, Share). **Text** buttons for tertiary actions (Clear all, Undo, Show all). Destructive actions are never primary-colored until the inline confirm step.
- **Follow toggle.** A labelled pill (28px tall, 44px on phones; `outline` border): a 14px ring mark + the label. Empty muted ring + "Add to My Papers" = not in My Papers; ink ring with an oxblood dot + "In My Papers" (`aria-pressed`, tooltip "In My Papers — remove") = in My Papers. Same mark as the map ring. In My Papers' own lists it reads "Remove".
- **Paper row.** Title (`title-paper`), authors (`body-sm`, muted, matched names highlighted on `surface-sunken`), meta line (`meta`: award (🏆 Best paper / 🏅 Honorable mention) · type · session · 📍 **room** · day, time ET, e.g. "Tue Nov 10 10:00 ET"), follow toggle, "Conference page ↗" (muted `meta`, sans, smaller than the toggle) and the score ("54%", muted `meta`, tabular; "54% · abstract 2" with several My research abstracts) at the right end, after the title. Separated by hairlines. Clicking the title expands the row in place (abstract, affiliations, award, links: preprint, supplemental, conference page), US8.1. A separate details view with its own URL and related papers is Stage 2 (US8.2–8.3); on phones it becomes a sheet.
- **Map options.** "⚙ Options" in the nav bar (Explore only) opens a right-side drawer titled "Map options" with view settings only, in groups: Dimensionality reduction (UMAP / t-SNE / PCA), Animation, Appearance, Advanced (live projections, clusters and quality; the navio summary). Color by, Topic labels and Hide map sit under the map itself. Close ✕ / Done, Esc or a tap outside closes it; its open state is remembered per browser. Filters never live here.
- **Options → Animation** (#82). A group in the Options drawer, after Dimensionality reduction: switches _Animate the map_, _Align projections_, _Animate filter changes_, then segmented controls _Motion: All at once · By topic_ (only when the conference has topics) and _Speed: Slow · Normal · Fast_. While _Animate the map_ is off, the options that only shape motion are disabled (alignment still applies). Remembered per browser (`papersNavigator:animation`); only explicit choices are stored.
- **Add bar.** Above the list: "Matching papers n" (headline italic) + primary "Add N to My Papers" + muted note "k already there". When all are in: disabled "✓ All n in My Papers".
- **Toast.** Bottom-center, inverted (ink background). Always carries Undo when it reports a change: "Added 96 · Undo". Lives 10 s; never stacks more than one.
- **Inline confirm.** Replaces the button in place: "Replace your 14 papers with these 2? [Replace] [Cancel]". No native `confirm()`.
- **Now card (phone).** `label-caps` kicker in primary ("NOW · UNTIL 09:30") + "3 of yours"; room in `room` type; session name muted; my talks with times (current talk's time in primary); conflict note at the bottom. 1.5px ink border.
- **Slot row (itinerary / Next).** Time (tabular, ink) · room (Newsreader) + session (muted) · count of my papers. Hairline separated.
- **Conflict note.** `primary-container` background: "⚠ Also now: America center · How can I do this myself? · 1 of yours". Shows its own time range when it differs.
- **Researchers index** (#78). `authors.html`: an underline search over names and institutions (accent-insensitive), a muted count line ("1,455 researchers in the program, most papers first"), then hairline rows _name (`title-paper`, links to the profile) · institutions (muted) · "3 papers" (`meta`)_, 100 at a time with "Show n more". On phones the institutions wrap under the name.
- **Researcher profile** (#78). `authors.html?name=<name>`: "← All researchers", the name (`display`), affiliations as listed (with counts when more than one; when they differ beyond case, accents and punctuation, the muted note "Listed with 2 affiliations: this may be more than one person with the same name"), then the actions **Watch** (secondary; "Watching" when the author rule exists) and the primary "Add N to My Papers" ("✓ All n in My Papers" when all are in; reason "👤 _Name_"). Sections: _When they present_ ("3 papers · Tue 2 talks · Thu 1 poster", then "NEXT Tue Nov 10 10:00 ET · 📍 Room · _title_", or NOW while one is on), _Topics_ (map topics and keywords as chips with counts), _Co-authors_ (links to their profiles, shared-paper counts), _Papers_ (paper rows with the follow toggle; the title opens the details, "Conference page ↗" opens the conference site). A paper that overlaps something in My Papers (other session) gets a conflict note in its row: "⚠ Same time as “_title_” in My Papers". An unknown name says so and links to the index.
- **About page** (#88). `about.html`: the project, the privacy policy and a tutorial by task (Explore, My Papers, Researchers), with an "On this page" contents list of anchors; running text at 70ch, headings in Newsreader. Conference facts (name, dates, program website) come from the config. Its privacy claims must match the code: the localStorage list is `STORAGE_ITEMS` in `src/lib/about.js`, and a test fails when the app writes a key it doesn't list. The footer links to it as "About & privacy".
- **Empty states** say what to do next, in one sentence and one action: "Nothing of yours right now. Next: 10:00, Essex north."

## Do's and Don'ts

**Do**

- Use tokens via CSS custom properties; add a token here before using a new value.
- Put the count on every bulk button and make it equal what's listed.
- Show every active constraint on screen; make each removable.
- Give every list-changing action an Undo.
- Use serif for reading, sans for operating.
- Keep the map's color for similarity (or one chosen category), and the ring for My Papers.

**Don't**

- Don't use default browser controls unstyled (selects, checkboxes, range inputs, `details` triangles). Style them to these tokens or use our widgets.
- Don't use gradients (except the legend ramp), glassmorphism, drop shadows on in-page elements, or colored left-border cards.
- Don't use the accent for decoration or headings.
- Don't put nested scroll boxes inside rows.
- Don't use Inter, Roboto or Arial.
- Don't hide filters behind a drawer with no on-page trace.
- Don't use `alert`/`confirm`/`prompt`.

## Vocabulary

UI copy uses these terms and only these (PRD §4). Sentence case everywhere.

| Say                           | Meaning                                                                                            | Never say                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Program**                   | everything presented at the conference                                                             | data, items                                                |
| **Matching papers**           | what's listed now after search, relevance, facets, map region                                      | selected papers, selection, results in score range         |
| **My Papers**                 | the papers you keep                                                                                | followed, favorites, my selection                          |
| **Add to My Papers / Remove** | one-paper actions                                                                                  | follow / unfollow, star                                    |
| **Watch**                     | a standing rule (person, institution, research topic) whose papers are always in My Papers         | subscribe, follow author                                   |
| **Researcher**                | anyone listed as an author in the program; their page is a profile ("Researchers" in the nav)      | people, speaker, user                                      |
| **Research topic**            | a search watched as a rule at Strong or Good ("🔍 LLM agents"); kept in sync after program updates | saved search, alert, topic (that word is for map clusters) |
| **My research**               | ranking the program against your own pasted abstracts (US11.4); chip "My research (2 abstracts)"   | my profile, recommendations, upload                        |
| **Topic**                     | a cluster of similar papers on the map (US2.3), with its label                                     | research topic, category                                   |
| **Reason**                    | why a paper is in My Papers ("🏫 Northeastern University")                                         | tag, source                                                |
| **Itinerary**                 | My Papers by day, slot, room                                                                       | schedule preview, where to go                              |
| **Now / Next**                | what's on for you at the current conference time                                                   | live                                                       |
| **Strong / Good / Weak / All** | relevance levels of a search (a research topic is watched at Strong, Good or Weak)                | score range, threshold                                     |

Counts use the noun correctly ("1 paper", "2 papers"). Times: `08:24`, days: `Thu Nov 12`, always with "ET" (from config) in headers. The zone is written "ET", never "EST"/"EDT": `conferenceZone()` / `formatWhen()` in `src/lib/time.js` ("Tue Nov 10 10:00 ET"): the config's `timezoneLabel` if set, else the zone's generic code ("ET"), else its short abbreviation ("GMT+1", never "Germany Time").

## Interaction & State

- **Two things stay visibly separate:** _matching papers_ (temporary, what you see) and _My Papers_ (persistent, what you keep). Every control acts on exactly one of them, and its label says which.
- **Three ways into My Papers:** the follow toggle on one paper; **Watch** on a person/institution, or "Watch this research topic" on a search (a rule, kept in sync after re-scrapes); **Add N** for exactly the listed papers. No bulk remove on Explore.
- **Research topics** (#24): "Watch this research topic" sits under the relevance control and opens an inline preview (no dialog): Strong / Good with the count in the whole program (all types, not just the matching papers), how many would join My Papers, and the papers just in and just out. The rule keeps the score cut of the chosen level at save time, plus its matches, so My Papers shows them without the language model; pages re-evaluate them in the background after first paint (skipped with Save-Data, then a quiet note says matches are pending). The Watching section shows each rule's count and where its papers fall (papers per day, busiest session).
- **My research** (#27): a secondary "My research" button beside the search opens an inline panel: a textarea for one or more abstracts (blank line between them, up to 10), the note "Stays on this device", Rank the program / Delete from this device / Cancel. Ranking replaces the search (one ranking at a time; typing a search leaves it) and drives the same list, map colors and Strong / Good / Weak / All; its chip is "My research (n abstracts) · Good matches ✕". A paper's score is its closest abstract (max, not an average: abstracts are usually distinct projects), shown as "· abstract 2" in the row. Long abstracts are embedded in chunks of whole sentences (≤ 120 words, inside the model's 256-token window) and mean-pooled, never truncated. Abstracts score higher and more variably than short queries, so their cuts come from the score distribution: Good = mean + 2 sd, Strong = mean + 2.5 sd, Weak = mean + 1 sd (search keeps 0.30 for Good and 0.20 for Weak). "Watch as a research topic" asks for a short name ("My research"), which is the 🔍 reason; the abstracts are stored on the rule in this browser, re-evaluated like any research topic (only when the program or the rule changes; abstract vectors are cached), and **left out of share links** (private, too long, and a name alone can't be re-evaluated). Export carries them, with the note "Includes the abstracts of your research topics" beside the button. "Delete from this device" with saved research topics asks inline: delete the abstracts only (the topics keep their copy) or also stop watching them; the toast has Undo. The abstracts live in localStorage per conference and never go in a URL.
- **Recommended papers** (#26, US11.3): a My Papers section ranking papers not in My Papers by their highest similarity to any paper in it (max, not mean: a list mixes interests and the mean favors generic papers between them). Each row says why ("✨ Like _title_", opening that paper's details) and offers "Add to My Papers" (reason "✨ Like _title_") and "Dismiss" (Undo toast; kept on this device, not in exports or share links). Top 10, then "Show more". Computed after first paint from the precomputed embeddings, never the language model.
- **Researchers** (#78): only this conference's program (no external data; works offline after one visit, the page is precached). Identity is the normalized name, the same key author Watch rules match on (compatibility-normalized, case- and accent-insensitive, whitespace collapsed), so a profile groups exactly what its Watch keeps: homonyms merge and their affiliations show it; the most common spelling is the name shown. Every author name (paper rows, paper details, the Watching list) links to `authors.html?name=…`; on the Researchers page those links open in place and each profile is a history entry (Back/Forward), while paper details keep their `?paper=` panel. Times and days use the conference timezone.
- **Composition is a visible chain:** query → relevance → facets → map region → list. The list header count equals the list. Adding an author or institution facet while a query is active switches relevance to _All_ (decided in issue #1), and says so in the toast.
- **Feedback within 100 ms** for every click (state change in place); toasts for anything that changed My Papers.
- **Undo over confirm** (principle 5). Removal of one paper: toast with Undo. Remove a rule: inline choice "Remove rule only / Remove rule and its 12 papers". Replace (share link, import): inline confirm showing what will be lost, plus a one-level backup.
- **Hover is never required.** Anything shown on hover is also reachable by tap/focus.
- **URL reflects shareable state** (query, facets, open paper) so a view can be linked. Explore's view (#92) lives in the URL **fragment**, which never reaches the server's logs or other sites through Referer: `#q=…&level=…&type=…&author=…&inst=…&kw=…&session=…&topic=…&color=…&proj=…&labels=0&map=0&region=x0,x1,y0,y1`. A facet repeats its key per value (names contain commas); defaults are left out, so a fresh visit has a bare URL. Because the default view has a search and Main tracks, a cleared search is `q=` and all types is `type=`. `level` is written only with a search; `region` only with its projection (data units, 3 decimals), and only in the default projection or an aligned one (Align projections, the default), so it means the same on any device. It is written with replaceState as the view changes (no history entry per keystroke) and read once at load. Back/Forward belong to paper details (`?paper=`, a public id, so a query param); after one, the page writes its view back onto that entry. A link that differs only in its fragment, pasted into the address bar, reloads the page from that link if the fragment has one of the page's own keys (an in-page anchor such as `#privacy` doesn't). A link is attacker-controllable: at load the fragment keeps only the page's keys and the share keys (`follow`, `watch`), and one over 4 KB is dropped. Writes stay under 4 KB too: the region goes first, then facet values (with a console warning). Paper title links (`?paper=`) never carry the fragment, so copying one doesn't share your search and filters. The map region stays across redraws (filters, Color by, theme) until it's cleared or the projection changes. The Researchers search is `authors.html#q=…`. **Never in a URL:** "My research" abstracts (a link with a search pauses My research on that device, which keeps its abstracts; a toast "My research paused · Resume" brings it back), Appearance and other per-device settings, the Options drawer's open state, live projections and clusters (computed in this browser). A bare Explore URL (e.g. the nav link) starts fresh: the URL is the only place this state is kept. The `#follow=…&watch=…` share link (My Papers) uses the same fragment, and handling it removes only its own keys.
- **Loading:** map renders from static data first; search shows its loading state; nothing jumps when the model arrives.
- **Motion:** 120–200 ms ease-out for popovers, sheets and toasts; no decorative animation; respect `prefers-reduced-motion`. The one longer motion is the **map animation** (#82), which carries meaning (where papers and topics go): see _Map animation_ under Data Visualization.

## Data Visualization

The map is the overview (principle 3). Rules:

- **Position** = the 2D projection (UMAP default; t-SNE/PCA in advanced settings). No axes, no grid; a one-line caption explains it ("Similar papers sit close together").
- **Color, with a query:** similarity on the oxblood **sequential ramp** `viz-similarity-1 → 3` (light → dark; in dark mode dim → bright). Papers below the current relevance level are `viz-dim`. Without a query and without color-by: `viz-neutral`.
- **Size** may echo similarity subtly (radius ~2–5px); never encode a second variable with size (so the current "Size by" option goes away).
- **Relevance levels** (Strong / Good / Weak / All) are cut points on the similarity score (search: Good 0.30, Strong halfway from Good to the best match, Weak = ⅔ of Good, i.e. 0.20; loosely related papers that Good leaves out); how they're derived from the score distribution is left to the relevance-control issue. The ramp's light end starts at the Good cut.
- **"Color by" a category** (type, room, session) is optional and replaces similarity. Scatterplots can only keep **three** categorical hues distinguishable for color-blind readers (validated: `viz-cat-1..3`), so: the three largest categories (or the ones the user picks in the legend) get `viz-cat-1..3`, everything else is `viz-cat-other`. Color follows the category, never its rank: a filter must not repaint survivors.
- **Reliability** (#84, Advanced): once the Advanced panel has measured the projection on the map, "Color by: Reliability" shows each paper's local quality score (trustworthiness by default; continuity, steadiness or cohesiveness selectable; k from the quality table) on the indigo **reliability ramp** `viz-reliability-1 → 3`. Unlike similarity, the ramp **darkens toward the least reliable papers** (in dark mode: brightens), because those are what the reader should notice; its hue keeps it apart from similarity and from `viz-dim`. Domain: the projection's 5th percentile to its maximum (lower values clamp). Legend title names the metric and k ("Reliability (trustworthiness, k=10)"); the tooltip adds "Reliability 0.83".
- **Distortion overlay** (#84, Options → Advanced toggle): behind the points, a light grid of `viz-reliability-3` whose opacity (0–0.35) grows where the Gaussian-kernel average of nearby papers' scores (8px cells, 20px bandwidth) falls below the projection's lower quartile, strongest at its 5th percentile; blank elsewhere and far from any paper. It never takes pointer events, never moves the scales, and adds a "▪ Shaded: least reliable areas" key next to "◯ In My Papers". Both appear only once computed for the current projection (precomputed or live) and follow k and the metric.
- Palettes validated with the dataviz validator: reliability ramp single hue and monotone; its light end `viz-reliability-1` is 2.0:1 on `background`, and in dark mode its dim end `dark-viz-reliability-1` is 2.2:1 on `dark-background` (lightest marks need the legend and tooltip, not contrast alone).
- **Topic labels** (clusters, US2.3): ink text on a halo of `background` at each topic's center, on by default ("Topic labels" toggle); a label that would overlap a larger topic's is left out. They add no hue; "Color by: Topic" follows the 3 + Other rule.
- **In My Papers** = a 1.5px `viz-followed-ring` ring around the point, always on, independent of color-by. Same meaning as the follow toggle.
- **Brush / map region:** points outside are `viz-dim`; the region becomes a chip ("Map region ✕"). It survives filter, search, color and theme changes; switching projections clears it (its coordinates mean nothing in another projection).
- **Map animation** (#82, object constancy): switching projections moves each paper from where it was to where it goes, cubic ease-in-out, the scale domain easing with it so the frame never jumps. Projections are first **aligned** (orthogonal Procrustes: rotation or reflection, uniform scale, translation) to the default projection, so the motion shows real differences, not an arbitrary spin; every projection aligns to the same reference so switching back and forth is stable. _By topic_ (default) stages the motion one topic at a time, largest first and unclustered papers last, each stage one Speed step long (Slow 1200 · Normal 700 · Fast 400 ms) with overlap, at most 3 steps in total; topic labels fade out at the start and back in at their new centers as each topic lands. Filter changes animate in one step: leaving papers fade out where they were, entering ones fade in at their positions. Off by default under `prefers-reduced-motion` (the user can turn it on); a redraw mid-motion continues from where the points are.
- **Hover** a point: tooltip with title, type, room, day/time. **Click**: open that paper's details (desktop: scroll to/expand it in the list; phone: details sheet). No hidden "clicked point" mode.
- **Nearest neighbours** (#102): hovering near a point (the tooltip's 24 px radius) previews its k true neighbours (cosine in the embedding, among the papers on the map; k = 10 or 15 in Options → Advanced, "Nearest neighbours on hover", both remembered per device): 1px ink lines from the paper to each neighbour, the paper in a 2.5px ink ring, each neighbour labelled with its similarity ("72%", muted on a background halo), every other point `viz-dim`. A neighbour whose rank by map distance is beyond max(3k, 10% of the papers on the map) is a **missing neighbour** (far on the map; the cut scales with filters, and the strict "within the k nearest" would dash most lines): its line is dashed (4/3), so the distinction never rests on color; a paper among the k nearest on the map that is not a true neighbour is a **false neighbour**: dotted muted ring. No new hue: ink and muted ink only. **Click or tap** pins it and scrolls the list to that same paper (the nearest point is the one source for both); a card lists the neighbours with similarity and map-distance rank ("66% similar · map #43 (far)") and "7 of 10 close on the map (within its 30 nearest)", each title opening the details. **Desktop (sticky map, ≥ 1024px):** the card floats over the map's bottom-right corner (#114) and stays compact: `surface`, `var(--elevation-1)`, `rounded.md`, 280px wide. A one-line header "10 neighbours of ‘…’" with a ▾/▸ collapse toggle (`aria-expanded`) and ✕, then the top 5 as one-line 40px rows (44px on touch): the title clamped with an ellipsis (the one place a paper title is truncated: its full text is in the `title` tooltip on hover/focus and in the details it opens) and the similarity ("72%", "61% far") on the same line; the summary line moves to the header's tooltip. About 280px tall. "Show all k" ("Show fewer" back; it holds while the same paper stays pinned) lists them all, the card capped at 60% of the map's height with the list scrolling inside it. On maps under 600px tall it starts collapsed (header only) until the reader opens it; their choice then holds across pins. It covers and takes the pointer only in its own box. **Stacked layouts:** the full list sits under the map's controls. Hidden in print, with the tab bar and ⚙ Options. **Esc** closes the topmost layer only: paper details, then the Options drawer, then the pin; the card's ✕ or a click on empty map space also unpins. The pin survives redraws (filters, search, projections) while the paper is on the map, and is not in the URL (a passing look; `?paper=` shares a paper). Keyboard focus on a paper row previews its neighbours. Marks never take pointer events and never change the brush; mid-animation they stay hidden and fade in as the motion settles. Live and aligned projections use the drawn coordinates.
- **Query marker** (#100): with a search or My research, a **"★ Your search"** / **"★ My research"** marker shows where it lands on the map (one per abstract, numbered "★ My research 1", "2"…, when there are several). Position: an out-of-sample placement by nearest neighbours (`src/lib/placeQuery.js`), since UMAP/t-SNE have no transform for new points in the browser: the 10 papers on the map most similar to the query embedding, their drawn (filtered, live or aligned) positions averaged with weights exp((s − s_max) / 0.05), so the closest matches dominate and a paper's own text lands on its own dot. The marker is always inside the points' extent (it never changes the scales). Uncertainty: a light `primary` disc (10% fill, dashed 55% rim) whose radius is the neighbours' weighted RMS distance from the marker, capped at 35% of the map and left out under 10px; a wide disc means the projection split the closest papers and the position is approximate. Marks: a `primary` diamond (260px² symbol) outlined 2px in `background`, so it reads on any point color, with its label in bold `primary` on a background halo, drawn above everything, including topic labels. Its marks never take the pointer: within 14px of the marker the tooltip shows "Your search: “…”", "approximate (from its 10 most similar papers)" and its 3 nearest papers (each on its own row, with similarity), and thin 1px `primary` lines run to its 10 nearest papers; a paper's nearest-neighbour preview is suppressed there. Hidden without a ranking; replaced (no redraw) when the query changes; mid-animation hidden and fading in as the motion settles, like the neighbour marks. No hover on touch: the marker and its disc are the information. Abstracts and their embeddings never leave the browser.
- **Legend** always visible in the map's top-right corner on `surface` (`outline` border, `rounded.md`, 8px padding): a horizontal ramp labelled only at its ends, "less similar / more similar" (Reliability: "less reliable / more reliable"; exact values are in the tooltip), or the categories (3 + Other). "◯ In My Papers" sits under the map.
- **Scent bars** in facet lists: 4px bars in `primary` on an `outline` track, with the count as text beside them.
- Charts follow the same tokens; no chart library defaults (Vega/Plot default schemes must be overridden).
- Palettes were validated with the dataviz palette validator (CVD ΔE ≥ 9.2 for the three categorical slots, all pairs, both themes; sequential ramp monotone, single hue). Light `viz-cat-3` is 2.7:1 on paper, so categories always come with a legend.

## Emoji & Iconography

Emoji are welcome as **meaning markers**, a small fixed set, always followed by text, never alone and never decorative.

| Marker | Meaning                                                                        |
| ------ | ------------------------------------------------------------------------------ |
| 📍     | room                                                                           |
| 👥     | reason: friend (watched person)                                                |
| 🏫     | reason: institution                                                            |
| 🔍     | reason: research topic                                                         |
| ★      | reason: added by hand                                                          |
| 👤     | reason: added from an author (Author filter, "Add N" on a researcher profile) |
| ✨     | reason: recommended ("✨ Like _title of the most similar paper in My Papers_") |
| ⚠      | schedule conflict (only; errors and warnings are plain text)                   |
| 🏆     | award: best paper ("🏆 Best paper")                                            |
| 🏅     | award: honorable mention ("🏅 Honorable mention")                              |
| 📱     | shared from a link (the share banner; reason "📱 shared")                      |
| 🆕     | new since the last program update                                              |

Buttons carry no emoji ("Export JSON", "Share list", "Copy link"), except a marker that names the button's meaning ("🔍 Watch this research topic"). Line icons, if needed, are 16px, 1.5px stroke, `currentColor`. No icon fonts. No hand-drawn complex SVG in the app.

## Mobile & At the venue

- **Phone layout is designed, not shrunk:** on Explore the map shows right after search, filters and relevance, then the list; Now first on My Papers during conference hours.
- **Hit targets ≥ 44px** on touch screens (`@media (pointer: coarse)`, plus phone widths), without growing the desktop layout: small controls keep their look and extend their hit area (chip ✕, toast Undo); primary controls in the bottom half of the screen when possible (bottom tab bar, sheets).
- **The Now card answers "where do I go" in two seconds:** room name is the largest text on screen.
- **Sharing on a phone** uses `navigator.share` when available ("Share list"); the QR code is for laptops ("Send to my phone").
- **Works after first load on weak Wi-Fi** (US6.3): My Papers must not depend on the embedding model.
- Map on phones: visible by default (John wants the visualization on his phone), with a "Hide map" toggle. It ignores touches by default so page scrolling always works; a **"Select region" mode button** turns drag into brushing (US2.2 on phones) and turns itself off after one selection, so the map never hijacks page scrolling.

## Accessibility

- WCAG 2.2 AA: text ≥ 4.5:1, UI boundaries and focus ≥ 3:1 (all tokens comply; see Colors).
- Visible focus ring: 2px `focus`, 2px offset, on every interactive element.
- Full keyboard use: facet popovers and autocomplete follow the listbox pattern (↑↓, Enter, Esc), `aria-expanded` on facet buttons, toasts in an `aria-live="polite"` region.
- Never color alone: similarity has a legend and per-paper score text; My Papers has a ring + toggle state + label; conflicts have ⚠ + text.
- The map has a text equivalent: the list is the accessible view of the same data.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Forced colors (Windows High Contrast): custom-drawn controls whose state lives in backgrounds or gradients (checkbox check, select chevron) fall back to `appearance: auto`.

## Building UI: reactive widgets

We prefer **[reactive widgets](https://reactivewidgets.org)** for every interactive UI piece (facet strip, relevance control, map, list, follow toggle, itinerary).

- A widget is a function `widget(data, options) → HTMLElement` whose **`.value`** is the user's selection and which **emits `input`** on user interaction and **updates itself when `.value` is set and an `input` event is dispatched** (so pages can drive it).
- **Independent and reusable:** a widget imports nothing from `src/lib` or the conference config; everything it needs comes in through `data` and `options`. Actions that belong to the app (e.g. Watch) are injected through options/hooks.
- **Styled only with this file's tokens** (CSS custom properties with sensible fallbacks), so it looks right here and can be reused elsewhere.
- Pages compose widgets with `view()` / `Generators.input()`; the pipeline (search → relevance → facets → map → list) is wired in the page or `src/components/`, not inside widgets.
- New widgets start in `src/widgets/`; once proven in production, extract them into their own npm package like `multi-auto-select`.
- Each widget has jsdom tests for its `.value`/`input` contract.

## Checking work

- `npx @google/design.md lint docs/DESIGN.md` after editing this file.
- UI PRs: screenshots at 1600×1000 and 400×860, light theme (plus dark when colors change), and a note of which principle(s) any deviation breaks.
- Reviewers check: tokens only, vocabulary table, counts equal lists, Undo present, no default browser controls, no hidden constraints.

## Decisions (2026-10-29)

Decided by John:

1. Visual direction **A · Proceedings** (over Instrument and Atlas).
2. Filters as a **facet strip**, replacing the "Options" filter drawer; "Options" survives only for view settings, as the nav-level "Map options" drawer (Appearance, Animation, Advanced).
3. UI pieces are **reactive widgets**, independent and token-styled; the facet strip's API lives in its own issue; widgets become npm packages once proven.
4. Emoji are fine as a fixed set of meaning markers.
5. Phone map: region selection through an explicit "Select region" mode.
6. Verb: **"Add to My Papers" / "Remove"** with a ring toggle, not Follow/Unfollow/★. This supersedes the wording in the selection-redesign doc.
7. (2026-10-30) An **Appearance toggle** (Auto · Light · Dark) is OK; Auto follows the OS.
8. (2026-10-30) On phones the **map is visible by default** ("Hide map" to tuck it away), not list-first.

Calls made while writing this file (open to change): map category colors capped at 3 + Other; the score histogram leaves the default UI; Size by is removed; blue only for focus; the Day facet is optional; in Stage 1, details expand in place.
