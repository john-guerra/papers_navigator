import { html } from "htl";
import { renderPaperDetail } from "./paperDetail.js";
import { showToast } from "./toast.js";
import { addWithUndo as addWithUndoDefault } from "../lib/selection.js";

/**
 * The paper details panel for the paper whose key (`shortId` or `id`) is in the URL, as both
 * pages show it (#22, #23, #70): the My Papers toggle with an Undo toast, related papers that
 * open their own details through `route`, Close and Esc. `related(paper)` returns the related
 * papers, or a Promise of them. Without a paper it returns an empty placeholder.
 *
 * `el.update()` refreshes the toggles in place; `el.dispose()` stops listening to Esc.
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
  },
) {
  const paper = key
    ? papers.find((p) => p.shortId === key || p.id === key)
    : null;
  if (!paper) {
    const empty = html`<span></span>`;
    empty.update = empty.dispose = () => {};
    return empty;
  }
  // reads the store (not a reactive copy), so toggling doesn't rebuild the panel
  const inMyPapers = (id) => store.value.some((d) => d.id === id);
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
    onOpen: (id) => route.open(papers.find((p) => p.id === id)?.shortId ?? id),
    onClose: () => route.close(),
  });
  const onKey = (event) => event.key === "Escape" && route.close();
  addEventListener("keydown", onKey);
  el.dispose = () => removeEventListener("keydown", onKey);
  // after the page attaches the panel
  requestAnimationFrame(() => el.querySelector(".paper-detail-close")?.focus());
  return el;
}
