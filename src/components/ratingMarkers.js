/**
 * Ratings (#203, Stage B) on paper rows: rated papers get "★4" right after their title (Explore,
 * My Papers' list and itinerary, researcher profiles), from the ratings store. Works on any
 * paper row (`.paper[data-paper-id]`, `.itinerary-item[data-paper-id]`) under `root`, including
 * rows rendered later, so lists don't need to know about ratings (like bindNoteMarkers).
 * Follows the store. Returns a function that stops it.
 */
const ROWS = ".paper[data-paper-id], .itinerary-item[data-paper-id]";
const TITLE = "a.title, a.paper-details-open, a.live-title, a";

export function bindRatingMarkers(root, ratings, { disliked, attended } = {}) {
  // "★4" or "👎", then "✓" when you attended (#208), right after the title
  const place = (row, cls, text, title, after) => {
    let marker = row.querySelector(`:scope .${cls}`);
    if (!text) return void marker?.remove();
    if (!marker) {
      marker = document.createElement("span");
      marker.className = cls;
      const anchor = after ?? row.querySelector(TITLE);
      if (anchor) anchor.after(marker);
      else row.append(marker);
    }
    if (marker.textContent !== text) {
      marker.textContent = text;
      marker.title = title;
    }
    return marker;
  };
  const mark = (row) => {
    const id = row.dataset.paperId;
    const n = ratings.get(id);
    const no = !n && disliked?.has(id);
    const rating = place(
      row,
      "rating-marker",
      n ? `★${n}` : no ? "👎" : "",
      n ? `Your rating: ${n} of 5` : "Not for me",
    );
    place(
      row,
      "attended-marker",
      attended?.isAttended(id) ? "✓ Attended" : "",
      "You attended",
      rating,
    );
  };
  const markAll = () => root.querySelectorAll(ROWS).forEach(mark);
  markAll();
  const stores = [ratings, disliked, attended].filter(Boolean);
  for (const s of stores) s.addEventListener("input", markAll);
  // Rows rendered later; marking only touches rows whose state differs, so it settles
  const observer = new MutationObserver((records) => {
    if (records.some((r) => [...r.addedNodes].some((n) => n.nodeType === 1)))
      markAll();
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => {
    for (const s of stores) s.removeEventListener("input", markAll);
    observer.disconnect();
  };
}
