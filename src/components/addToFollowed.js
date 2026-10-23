import { html } from "htl";

/** "Add N to My Papers" / "Remove N" buttons for a selection, recording why it was added. */
export function addToFollowed(store, papers, { label, reason }) {
  const n = papers.length;
  const add = html`<button class="btn-add" disabled=${n === 0}>➕ Follow ${n}</button>`;
  const remove = html`<button class="btn-remove" disabled=${n === 0}>➖ Unfollow ${n}</button>`;
  add.addEventListener("click", () => store.add(papers, typeof reason === "function" ? reason() : reason));
  remove.addEventListener("click", () => store.remove(papers.map((p) => p.id)));
  return html`<div class="add-to-followed"><span>${label}</span> ${add} ${remove}</div>`;
}
