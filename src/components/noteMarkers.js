/**
 * Paper notes (#152) on paper rows: rows of papers with a note get "📝 Note" in their meta
 * line (Explore, researcher profiles, the itinerary); with `text: true` (My Papers' list) the
 * row shows the note itself under its meta line instead.
 *
 * Works on any paper row (`.paper[data-paper-id]`, `.itinerary-item[data-paper-id]`) under
 * `root`, including rows rendered later (a redrawn list, "Show n more"), so lists don't need
 * to know about notes. Follows the notes store. Returns a function that stops it.
 */
const ROWS = ".paper[data-paper-id], .itinerary-item[data-paper-id]";

export function bindNoteMarkers(root, notes, { text = false } = {}) {
  const mark = (row) => {
    const note = notes.get(row.dataset.paperId);
    const isPaper = row.classList.contains("paper");
    const showText = text && isPaper;
    // "📝 Note": in the meta line of list rows, after the title in itinerary items
    let marker = row.querySelector(":scope .note-marker");
    if (note && !showText) {
      if (!marker) {
        marker = document.createElement("span");
        marker.className = "note-marker";
        marker.textContent = "📝 Note";
        marker.title = "You have a note on this paper (paper details)";
        const where = isPaper && row.querySelector(".paper-where");
        if (where) where.prepend(marker, " · ");
        else row.append(" ", marker);
      }
    } else if (marker) {
      // also the " · " after it
      if (marker.nextSibling?.nodeType === Node.TEXT_NODE)
        marker.nextSibling.remove();
      marker.remove();
    }
    // The note itself (as text, never HTML), under the meta line
    let full = row.querySelector(":scope > .paper-note-text");
    if (note && showText) {
      const content = `📝 ${note}`;
      if (!full) {
        full = document.createElement("div");
        full.className = "paper-note-text";
        const where = row.querySelector(":scope > .paper-where");
        if (where) where.after(full);
        else row.append(full);
      }
      if (full.textContent !== content) full.textContent = content;
    } else full?.remove();
  };
  const markAll = () => root.querySelectorAll(ROWS).forEach(mark);
  markAll();
  notes.addEventListener("input", markAll);
  // Rows rendered later; marking only touches rows whose state differs, so it settles
  const observer = new MutationObserver((records) => {
    if (records.some((r) => [...r.addedNodes].some((n) => n.nodeType === 1)))
      markAll();
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => {
    notes.removeEventListener("input", markAll);
    observer.disconnect();
  };
}
