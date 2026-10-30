# Proposal — How papers get into "My Papers" (UC4 + UC10 redesign)

Date: 2026-10-29 · Status: **proposal, John decides** · Based on the PRD (`2026-10-29-papers-navigator-prd.md`) and the independent review (`2026-10-29-review.md`).

## Problem (from the review, verified in code)

1. Three bulk Follow/Unfollow pairs act on three different sets — `map.brushed`, `inRange`, `filtered` (`src/index.md:290-292`) — while the list shows a fourth (`inRange` or the clicked point). "Follow 39" can add 34 papers you never saw.
2. "Unfollow N" removes every one of the N, including papers followed earlier for other reasons (`src/components/addToFollowed.js:15`). There is no undo.
3. Five things narrow what's shown (brush, score histogram, filters, clicked point, Where-to-go min score), and most are invisible once applied. Filters are behind a drawer; the default query's relevance cut silently hides half an author's papers.
4. "Selected papers" / "Map selection" call the _shown_ papers a selection, while John's "my selection" means _his list_.
5. Explore barely shows what's already in My Papers: no map marking, the count scrolls away, and bulk buttons don't change state.

## Principle

Keep two things visibly separate:

- **Matching papers**: what you see now. Every constraint narrowing it is visible as a removable chip.
- **My Papers**: what you keep. There are exactly **three ways in**, each with a clear reason.

## The three ways in

| Way                                        | Where                                                           | Reason recorded                                                | Covers                      |
| ------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------- |
| ★ **Follow one paper**                     | every paper (list, map click → paper, My Papers)                | "Picked" or the active query                                   | US4.1                       |
| 👁 **Watch** a person, institution or topic | next to its chip: `[🏫 Northeastern University ✕] 👁 Watch (12)` | "🏫 Northeastern University", "👥 Friend: …", "🔍 uncertainty" | UC10, US11.1, most of US4.2 |
| ➕ **Add these N** (one-off bulk)          | one button above the list, bound to exactly the list            | the active chips, summarized                                   | rest of US4.2               |

- A watch is a **rule**, not a snapshot. Its papers stay in sync after re-scrapes, with a "new" marker (US10.3). Rules are managed in My Papers. A paper you unfollow by hand stays unfollowed (an exception). A paper matching several rules shows all of their reasons (US10.4).
- ➕ is stateful and reversible: "Add 4 new · 2 already in My Papers", or "✓ All 6 in My Papers". After the click: "Added 4 · Undo". Undo removes only the 4 that were _newly_ added (US4.3).
- There is no bulk Unfollow on Explore. Bulk removal happens in My Papers (remove a rule, or remove by reason).

## Matching papers: one visible chain

```
[🔍 uncertainty · Strong matches ▾ ✕] [👤 Hyeon Jeon ✕] [▭ Map region ✕]   Matching papers (12)   ➕ Add 12
```

- **Chips** above the list for the query (with its relevance level), each filter value and the map brush. Each has ✕, plus "Clear all". This replaces the hidden drawer state (US3.3) and prevents silent hiding (review problem 4).
- **Relevance** becomes a three-way control with counts, _Strong (12) · Good (31) · All (283)_, with thresholds derived from the score distribution. The histogram moves to an advanced toggle. One threshold for everything (US1.2).
- The **map brush** stays but becomes a chip, so it composes with the list like any other filter (US2.2). Unbrushed points dim. Clicking a point opens or scrolls to that paper, with no hidden "clicked" mode.
- The **default query** stays, as you asked: the map opens colored by similarity. It's just a visible chip you can clear.

## What it removes from Explore

Where to go? (decided: My Papers only), the three bulk pairs, the Where-to-go min-score input, the clicked-point mode, the Live-search toggle (always live, debounced), "Max papers to list" (replaced by "Show more"), and navio (moves to the Stage 3 Advanced view).

## What it adds everywhere

- A **"My Papers (16)" badge** in the navbar (US4.4).
- **Followed papers marked on the map** with a ring, independent of Color by (US4.4).
- **Safety**: an inline two-step confirm for Replace (share banner, import), Undo for 10 s after any removal, and a one-level backup of the list (US7.2).
- My Papers: rule management and a **filter/group by reason** in the itinerary (US5.5).

## Options for John

- **A. Conservative**: keep today's controls but fix them. One ➕ bound to the list, Undo, badge, map rings, safe Replace. About 1 day. Doesn't address watch rules or the hidden constraints.
- **B. Recommended**: everything above. For Stage 1 (Nov 3): chips + one ➕ with Undo + badge + rings + safe Replace + 👁 watch for people and institutions + removing Where to go? from Explore. Topic watches (🔍) come in Stage 2 with the paper detail view. About 3–4 days of agent work, parallelizable (see the issues).
- **C. Bold**: B, plus removing the map brush as a filter (the map is for navigation only) and starting with no query. Simplest UI, but it drops US2.2 and the CHI-style colored first view you asked for.

## Open choices inside B

1. "Options" button name: you chose "Options". The review suggests "Filters" because the drawer is mostly filters. Keep "Options"?
2. When an author or institution chip is added while a query is active, should relevance switch to _All_ automatically, so you see all of their papers?
