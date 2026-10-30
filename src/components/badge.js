/** Keeps the navbar's My Papers badge (`.badge-my-papers`) in sync with the store; hidden at 0. */
export function bindMyPapersBadge(store, root = document) {
  const update = () => {
    const n = store.value.length;
    for (const badge of root.querySelectorAll(".badge-my-papers")) {
      badge.textContent = String(n);
      badge.hidden = n === 0;
      // aria-label is ignored on a <span>; label the link so screen readers hear the count
      badge
        .closest("a")
        ?.setAttribute(
          "aria-label",
          `My Papers, ${n} ${n === 1 ? "paper" : "papers"}`,
        );
    }
  };
  update();
  store.addEventListener("input", update);
  return () => store.removeEventListener("input", update);
}
