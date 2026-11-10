/**
 * Ratings (#203, Stage B) on paper rows: rated papers get "★4" right after their title (Explore,
 * My Papers' list and itinerary, researcher profiles), from the ratings store. Works on any
 * paper row (`.paper[data-paper-id]`, `.itinerary-item[data-paper-id]`) under `root`, including
 * rows rendered later, so lists don't need to know about ratings (like bindNoteMarkers).
 * Follows the store. Returns a function that stops it.
 */
const ROWS = ".paper[data-paper-id], .itinerary-item[data-paper-id]";
const TITLE = "a.title, a.paper-details-open, a.live-title, a";

export function bindRatingMarkers(root, ratings) {
  const mark = (row) => {
    const n = ratings.get(row.dataset.paperId);
    let marker = row.querySelector(":scope .rating-marker");
    if (!n) return void marker?.remove();
    const text = `★${n}`;
    if (!marker) {
      marker = document.createElement("span");
      marker.className = "rating-marker";
      const title = row.querySelector(TITLE);
      if (title) title.after(marker);
      else row.append(marker);
    }
    if (marker.textContent !== text) {
      marker.textContent = text;
      marker.title = `Your rating: ${n} of 5`;
    }
  };
  const markAll = () => root.querySelectorAll(ROWS).forEach(mark);
  markAll();
  ratings.addEventListener("input", markAll);
  // Rows rendered later; marking only touches rows whose state differs, so it settles
  const observer = new MutationObserver((records) => {
    if (records.some((r) => [...r.addedNodes].some((n) => n.nodeType === 1)))
      markAll();
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => {
    ratings.removeEventListener("input", markAll);
    observer.disconnect();
  };
}
