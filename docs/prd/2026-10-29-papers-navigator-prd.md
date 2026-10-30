# Papers Navigator — Product Requirements (PRD)

Date: 2026-10-29 · Owner: John Alexis Guerra Gómez · Drafted with Claude
Status: **draft for John's review**
Supersedes the feature list in §6 of the design spec (`docs/superpowers/specs/2026-10-23-papers-navigator-design.md`) as the source of _what the app must do_. The spec stays the source of _how_ (architecture, data format, pipeline).

## 1. Why this document

Stage 1 was built mostly as feature parity with the VIS 2025 / CHI 2026 explorers. That brought over controls whose purpose overlaps (several ways to "select" papers, several "follow" buttons, a "Where to go?" for search results next to a schedule for followed papers). This PRD restates the product from the attendee's point of view so each screen element can be justified by a user story, or removed.

Provenance tags: **[J]** = John said it (quoted or paraphrased from the 2026-10-23 brainstorming and later sessions); **[C]** = Claude's inference, for John to confirm or cut.

## 2. Product in one sentence

Help a conference attendee find the papers they care about, keep a personal list, and know **which room to be in, every day** — on a laptop while planning and on a phone at the venue. [J]

## 3. Users

| Persona                   | Context                                                                            | What they need                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Planner**               | Before the conference, laptop, 10–30 min session                                   | Discover relevant papers across ~500 items; build a list; see the resulting schedule and conflicts. [J]       |
| **Attendee on the floor** | During the conference, phone, seconds between talks, flaky Wi‑Fi                   | What's on now / next from _my_ list, and which room. [J]                                                      |
| **Browser**               | Curious researcher, maybe not attending — **first-class audience** (tentative) [J] | Get a sense of the program's topics; find work by people/institutions; read a paper and its related work. [C] |
| **Maintainer (John)**     | Before each conference                                                             | Add a conference with a config + fetcher; re-scrape during conference week. [J]                               |
| **DR researcher (John)**  | After launch                                                                       | Compare projection methods (UMAP, t‑SNE, PCA, later Druid/ZADU) on real data. [J]                             |

## 4. Core concepts (vocabulary the UI must keep distinct)

- **Program**: every item presented at the conference (papers, posters, workshops, panels…). [J: "everything presented at VIS"]
- **Candidates**: the items currently shown after search + filters + map brush. Temporary; changes as you explore. [C]
- **My list** (followed papers): items the user chose to keep. Persistent per conference, per device. [J]
- **Watch rules**: standing reasons to keep papers — _these authors (my friends), this institution (Northeastern), this topic_. Every program item matching a rule belongs in My list, with the rule as its reason, including items added in later re-scrapes. [J]
- **Schedule**: My list arranged by day, slot, room. [J]

A recurring source of confusion is mixing _candidates_ with _my list_. Every control should make clear which of the two it acts on. [C]

## 5. Use cases and user stories

Priority: **M** = must for Stage 1 launch (~Nov 3), **S** = should, **L** = later stage.

### UC1 — Find papers on a topic (Planner, Browser)

- **US1.1 (M) [J]** As a planner, I type a topic in my own words and get the program ranked by meaning, best matches first, so I don't need exact keywords.
  - _Acceptance:_ results appear without a page reload; ranking uses semantic similarity; the score is visible per item; works for multi‑word descriptions.
- **US1.2 (M) [C]** As a planner, I can tell how many results are "really relevant" vs. the long tail, and narrow to the relevant ones, so I don't follow noise.
- **US1.3 (S) [J]** As a first-time visitor, I can click an example topic to see how search works.

### UC2 — See the landscape (Browser, Planner)

- **US2.1 (M) [J]** As a browser, I see a map where similar papers are near each other, and my search results are highlighted on it, so I can spot related clusters I didn't search for.
- **US2.2 (M) [J]** As a planner, I can select a region of the map and see those papers listed.
- **US2.3 (L) [J]** As a browser, I see labeled topic clusters on the map (Stage 2).
- **US2.4 (L) [J]** As a DR researcher, I can switch projection methods and compare them (and later compute live DR + quality metrics).

### UC3 — Find papers by people, places, kinds (Planner)

- **US3.1 (M) [J]** As a planner, I filter by type, author, institution, keyword and session, and the filters combine with search and the map.
- **US3.2 (M) [J]** As a planner, the default view shows the main paper tracks (Full, Short, TVCG, CG&A) and I can opt into workshops, posters, etc.
- **US3.3 (S) [C]** As a planner, I can see at a glance which filters are active and clear them.

### UC4 — Build my list (Planner) — _the area to rethink_

- **US4.1 (M) [J]** As a planner, I add a paper I'm looking at to my list with one obvious action, and remove it the same way.
- **US4.2 (M) [J]** As a planner, I add _all current candidates_ (e.g. "top results for 'uncertainty'" or "everything by this author") in one action, and the app remembers _why_ each was added.
- **US4.3 (M) [C]** As a planner, before a bulk add I can see exactly which and how many papers will be added, and undo it.
- **US4.4 (M) [J]** As a planner, I can see which candidates are already in my list (on the list and on the map) and how big my list is, without leaving the page.
- **US4.5 (M) [J]** As a planner, my list survives reloads and browser restarts.

### UC5 — Plan my days (Planner)

- **US5.1 (M) [J]** As a planner, I see my list as a per-day itinerary: for each time slot, the room to go to and the session name, with my papers in talk order.
- **US5.2 (M) [J]** As a planner, I see conflicts (two sessions with my papers at the same time) and the alternatives.
- **US5.3 (S) [J]** "Where to go" lives in **My Papers only** (decided 2026-10-29); Explore does not show a schedule preview. As a planner, I can still see where a topic's papers are by following them (or a topic rule) and filtering My Papers by reason.
- **US5.5 (M) [J]** As a planner, I can filter or group my itinerary by reason (friends, Northeastern, a topic) so I can tell _why_ I'm going to a room.
- **US5.4 (M) [J]** Times and days are always in the conference timezone, never the device's.

### UC6 — At the venue (Attendee on the floor)

- **US6.1 (M) [J]** As an attendee, opening the app on my phone shows **Now** (room, session, until when, next talk of mine) and **Next** slots, in seconds.
- **US6.2 (M) [J]** As an attendee, when nothing of mine is happening, I see the rest of today's itinerary rather than an empty screen.
- **US6.3 (S) [C]** As an attendee, the phone view works after the first load even on weak Wi‑Fi.

### UC7 — Move or share my list (Planner → Attendee)

- **US7.1 (M) [J]** As a planner, I send my list from my laptop to my phone with a QR code or link, no account.
- **US7.2 (M) [J]** As the receiver, I choose to merge with or replace my current list, and I can't lose my list by accident.
- **US7.3 (S) [C]** As a planner, I share my list with a colleague the same way.
- **US7.4 (S) [J]** As a planner, I export/import my list (with reasons) as a file.

### UC8 — Check one paper (all)

- **US8.1 (M) [J]** As anyone, for a paper I see title, authors + affiliations, type, session, room, day/time, abstract, award and public links (preprint, supplemental, conference page).
- **US8.2 (S) [J]** As anyone, I can open a paper's detail view (from the list, the map, My Papers) with its own shareable URL.
- **US8.3 (S) [J]** As anyone, the detail view shows **related papers** (nearest in embedding space) with their session/time, and I can follow them or open their details, to explore by hopping paper to paper.

### UC10 — Never miss my people and institutions (Planner) [J]

> "I want to make sure I don't miss anything by Northeastern University, or by my friends; these are the reasons why I want that paper."

- **US10.1 (M) [J]** As a planner, I add authors (my friends) to a watch list; all their papers are in My list with reason "👥 Friend: _name_".
- **US10.2 (M) [J]** As a planner, I add institutions (e.g. Northeastern University); all papers with an author from there are in My list with reason "🏫 _institution_".
- **US10.3 (M) [C]** As a planner, after the program is re-scraped, new papers matching my rules appear in My list automatically (with a "new" marker), and I don't have to redo anything.
- **US10.4 (M) [C]** As a planner, I can see and edit my rules; removing a rule asks whether to also remove its papers; a paper I unfollowed by hand stays unfollowed even if a rule matches (exception), and a paper matching several reasons shows all of them.
- **US10.5 (S) [C]** Rules travel with the list in the share link / export, so my phone keeps them too. (Constraint: QR size — rules are short strings, likely fine.)

### UC11 — Cover my research topics; recommendations (Planner, Browser) [J]

- **US11.1 (S) [J]** As a planner, I save a research topic (a description in my own words + a relevance threshold) as a watch rule; matching papers are in My list with reason "🔍 _topic_", same machinery as UC10.
- **US11.2 (S) [C]** As a planner, for each topic I see how many papers match and where they cluster in the schedule, and I can adjust the threshold with a preview of what's in and out.
- **US11.3 (L) [J]** As a planner, I get **recommended papers**: items similar to my list that I haven't followed, with "why recommended" (most similar followed paper), and I can follow or dismiss each.
- **US11.4 (L) [C]** As a researcher, I paste one of my abstracts and get the program ranked against it ("papers about my research").

### UC9 — Run it for a conference (Maintainer)

- **US9.1 (M) [J]** Adding a conference = config + fetcher; no conference specifics in pages.
- **US9.2 (S) [J]** Re-scraping during conference week picks up program changes (times, rooms, new links) without breaking existing lists or share links.

### Quality requirements

- **Q1 (M) [J]** Map visible in ~2 s on a normal connection; search ready shortly after, without blocking the map.
- **Q2 (M) [J]** Usable on a phone with the **full feature set** of Explore and My Papers (decided 2026-10-29), not just "works better on desktop".
- **Q3 (M) [J]** No backend, no login; static deploy.

## 6. Roadmap

| Stage               | Target              | Stories                                                                                                                                       |
| ------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Launch          | ~Mon Nov 3, 2026    | UC1, UC2 (US2.1–2.2), UC3, UC4 (after the selection redesign), UC5, UC6, UC7, US8.1, **UC10 (watch rules for friends + institutions)**, Q1–Q3 |
| 2 — Before sessions | by Tue Nov 10, 2026 | US2.3 clusters, US8.2–8.3 paper details + related papers, US11.1–11.2 topic rules                                                             |
| 3 — After launch    | —                   | US2.4 live DR + ZADU, US11.3 recommendations, US11.4 "papers about my research", US10.5 if not done                                           |

Risk: UC10 at launch is 5 days of work away from the Nov 3 target together with the UC4 redesign; if time runs short, ship UC10 first (John's "regular use case") and keep the current bulk-follow buttons.

Tracking: every story or redesign item becomes a GitHub issue in `john-guerra/papers_navigator`, labelled by area and milestone = stage (see `AGENTS.md` → Workflow).

## 7. Out of scope (Stage 1)

Accounts or sync service; recommendations from other users; editing the program; clusters (Stage 2); live DR / ZADU (Stage 3).

## 8. Decisions (2026-10-29)

1. "Where to go" lives in My Papers only (US5.3).
2. Bulk-add: Claude proposes a redesign of the selection workflow (UC4) after the independent review; John decides.
3. Browser persona: first-class audience, tentatively.
4. Phone: full feature set (Q2).
5. New: watch rules for friends and institutions (UC10, launch), related papers (US8.3), research topics and recommendations (UC11).
