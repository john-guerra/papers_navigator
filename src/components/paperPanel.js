import { html } from "htl";
import { renderPaperDetail } from "./paperDetail.js";
import { showToast } from "./toast.js";
import { addWithUndo as addWithUndoDefault } from "../lib/selection.js";
import { createAnimationSettings } from "../lib/animationSettings.js";
import { createMiniMap } from "../widgets/miniMap.js";

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
 * `el.update()` refreshes the toggles in place; `el.highlight(id | null)` shows a paper on the
 * mini-map; `el.dispose()` stops listening to Esc and stops the mini-map.
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
  },
) {
  const paper = key
    ? papers.find((p) => p.shortId === key || p.id === key)
    : null;
  if (!paper) {
    const empty = html`<span></span>`;
    empty.update = empty.dispose = empty.highlight = () => {};
    return empty;
  }
  // reads the store (not a reactive copy), so toggling doesn't rebuild the panel
  const inMyPapers = (id) => store.value.some((d) => d.id === id);
  const open = (id) =>
    route.open(papers.find((p) => p.id === id)?.shortId ?? id);
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
    onClose: () => route.close(),
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
  const onKey = (event) => event.key === "Escape" && route.close();
  addEventListener("keydown", onKey);
  const disposeDetail = el.dispose;
  el.dispose = () => {
    removeEventListener("keydown", onKey);
    disposeDetail();
  };
  // after the page attaches the panel
  requestAnimationFrame(() => el.querySelector(".paper-detail-close")?.focus());
  return el;
}
