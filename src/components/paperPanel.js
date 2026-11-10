import { html } from "htl";
import { renderPaperDetail } from "./paperDetail.js";
import { renderPaperNote } from "./paperNote.js";
import { showToast } from "./toast.js";
import { addWithUndo as addWithUndoDefault } from "../lib/selection.js";
import { createAnimationSettings } from "../lib/animationSettings.js";
import { createMiniMap } from "../widgets/miniMap.js";
import { verdict } from "./verdict.js";
import { attendedToggle } from "./attendedPapers.js";

// Per route: the id of the paper whose panel is showing, to tell a redraw from an open (#152)
const shown = new WeakMap();

// This device's map animation settings (one store per page), when the page passes none
let deviceSettings = null;
const deviceAnimation = () => (deviceSettings ??= createAnimationSettings());

/**
 * The paper details panel for the paper whose key (`shortId` or `id`) is in the URL, as both
 * pages show it (#22, #23, #70): the My Papers toggle with an Undo toast, related papers that
 * open their own details through `route`, Close and Esc. `related(paper)` returns the related
 * papers, or a Promise of them. Without a paper it returns an empty placeholder.
 *
 * The neighbourhood mini-map (#101) places the papers as `mapRows()` gives them (Explore: as its
 * map draws them; elsewhere the papers' own x/y, the default projection) and moves as the map
 * animation settings say (`animation`, a store with `.value`; read from this device by default).
 *
 * With `notes` (the notes store, #152) the panel has "My note", saved on this device as you
 * type; closing the panel saves what's pending.
 *
 * `el.update()` refreshes the toggles in place; `el.highlight(id | null)` shows a paper on the
 * mini-map; `el.refreshMiniMap(key)` redraws it when the map's positions change (a new key); `el.dispose()` stops listening to Esc and stops the mini-map.
 */
export function paperPanel(
  key,
  {
    papers,
    tz,
    tzLabel,
    store,
    route,
    related = () => [],
    addReason = "★ Added by hand",
    toast = showToast,
    addWithUndo = addWithUndoDefault,
    mapRows = () => papers,
    animation = null,
    miniMap = true,
    notes = null,
    // Ratings store (#203 Stage B): "Your rating" stars before the note
    ratings = null,
    // 👎 Not for me (#208), and what a star rating does (addOnRate: adds to My Papers)
    disliked = null,
    onRated,
    // Attended papers (#208): "I was there" for any paper
    attended = null,
  },
) {
  const paper = key
    ? papers.find((p) => p.shortId === key || p.id === key)
    : null;
  if (!paper) {
    shown.delete(route);
    const empty = html`<span></span>`;
    empty.update =
      empty.dispose =
      empty.highlight =
      empty.refreshMiniMap =
        () => {};
    return empty;
  }
  // reads the store (not a reactive copy), so toggling doesn't rebuild the panel
  const inMyPapers = (id) => store.value.some((d) => d.id === id);
  const open = (id) =>
    route.open(papers.find((p) => p.id === id)?.shortId ?? id);
  // A redraw while typing: save the old panel's pending text first, so the new note shows it
  document.activeElement?.closest?.(".paper-note")?.flush?.();
  const el = renderPaperDetail(paper, {
    tz,
    tzLabel,
    related: related(paper),
    inMyPapers,
    onToggle: (p) => {
      if (inMyPapers(p.id)) {
        const undo = store.remove([p.id]);
        toast("Removed from My Papers", {
          actionLabel: "Undo",
          onAction: undo,
        });
      } else {
        const undo = addWithUndo(store, [p], addReason);
        toast("Added to My Papers", { actionLabel: "Undo", onAction: undo });
      }
    },
    onOpen: open,
    // Related titles link to their details on this page, its other params kept
    detailsHref: route.href && ((p) => route.href(p.shortId ?? p.id)),
    onClose: () => route.close(),
    note: notes ? renderPaperNote(paper, { notes, toast }) : null,
    rating:
      ratings || attended
        ? ratingControl(paper, { ratings, disliked, onRated, attended })
        : null,
    miniMap: miniMap
      ? (relatedPapers) =>
          createMiniMap({
            rows: mapRows(),
            focusId: paper.id,
            title: paper.title,
            relatedIds: relatedPapers.map((p) => p.id),
            onOpen: open,
            animation: () => (animation ?? deviceAnimation()).value,
          })
      : null,
  });
  // An Escape another layer already handled (a toggletip, #177) closes only that layer
  const onKey = (event) =>
    event.key === "Escape" && !event.defaultPrevented && route.close();
  addEventListener("keydown", onKey);
  // The map's positions changed (`key`: e.g. projection and alignment): redraw the mini-map.
  // The first key is the one it was drawn with.
  const refreshDetail = el.refreshMiniMap;
  let mapKey;
  el.refreshMiniMap = (key) => {
    const first = mapKey === undefined;
    if (key === mapKey) return;
    mapKey = key;
    if (!first) refreshDetail();
  };
  const disposeDetail = el.dispose;
  el.dispose = () => {
    removeEventListener("keydown", onKey);
    disposeDetail();
  };
  // Opening a paper focuses Close; a redraw of the same paper (the page re-ran its cell) keeps
  // focus where it was, so typing in the note isn't interrupted (#152). The old panel is still
  // on the page while the new one is built.
  const redraw = shown.get(route) === paper.id;
  shown.set(route, paper.id);
  const active = document.activeElement;
  const typing = redraw && active?.closest?.(".paper-note");
  const inside = redraw && active?.closest?.(".paper-detail");
  // after the page attaches the panel
  requestAnimationFrame(() => {
    const input = el.querySelector(".paper-note textarea");
    if (typing && input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (!redraw || inside)
      el.querySelector(".paper-detail-close")?.focus();
  });
  return el;
}

/** "Your rating": stars or 👎 Not for me (#208), following the stores; `dispose()` stops that. */
function ratingControl(paper, { ratings, disliked, onRated, attended }) {
  const was = attended ? attendedToggle(paper, attended, "I was there") : "";
  const control = ratings
    ? verdict(paper, { ratings, disliked, onRated, label: "Your rating" })
    : null;
  const box = html`<div class="paper-detail-rating">
    ${control ? html`<span class="paper-detail-rating-label">Your rating</span>${control}` : ""}
    ${was}
  </div>`;
  box.dispose = () => (control?.dispose(), was?.dispose?.());
  return box;
}
