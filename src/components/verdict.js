import { html } from "htl";
import { starRating } from "../widgets/starRating.js";

/**
 * Your verdict on a paper (#208): 1–5 stars or "👎 Not for me", one or the other. A star clears
 * Not for me and 👎 clears the stars (the two live in separate stores: `ratings`, `disliked`). A
 * star rating calls `onRated(paper, n)` (the pages add it to My Papers: addOnRate). Follows both
 * stores; `el.dispose()` stops that.
 */
export function verdict(
  paper,
  { ratings, disliked, onRated, label = `Rate ${paper.title}` } = {},
) {
  const stars = starRating(ratings.get(paper.id), { label });
  const nope = html`<button
    type="button"
    class="not-for-me"
    aria-label="Not for me"
    title="Not for me"
    aria-pressed="false"
  >
    👎
  </button>`;
  const show = () => {
    stars.value = ratings.get(paper.id);
    nope.setAttribute("aria-pressed", String(Boolean(disliked?.has(paper.id))));
  };
  stars.addEventListener("input", () => {
    const previous = ratings.get(paper.id);
    const n = stars.value;
    ratings.set(paper.id, n);
    if (n) {
      disliked?.set(paper.id, false);
      onRated?.(paper, n, previous);
    }
    show();
  });
  nope.onclick = () => {
    const on = !disliked.has(paper.id);
    disliked.set(paper.id, on);
    if (on) ratings.set(paper.id, 0);
    show();
  };
  ratings.addEventListener("input", show);
  disliked?.addEventListener("input", show);
  show();
  const el = html`<span class="verdict">${stars}${disliked ? nope : ""}</span>`;
  el.dispose = () => {
    ratings.removeEventListener("input", show);
    disliked?.removeEventListener("input", show);
  };
  return el;
}

/**
 * Rated with stars → My Papers (#208, John): `onRated` for `verdict` that adds a paper not yet in
 * My Papers (reason "★ Rated", Undo toast). Not for me and attended papers are never added.
 */
export function addOnRate({ store, addWithUndo, toast }) {
  // Only a first rating adds: changing 4★ to 5★ never brings back a paper you removed (#208 review)
  return (paper, n, previous = 0) => {
    if (!n || previous || store.value.some((d) => d.id === paper.id)) return;
    const undo = addWithUndo(store, [paper], "★ Rated");
    toast("Rated and added to My Papers", {
      actionLabel: "Undo",
      onAction: undo,
    });
  };
}
