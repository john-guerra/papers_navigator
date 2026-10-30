import { html } from "htl";
import { paperWhen } from "../widgets/papersList.js";

const STEP = 10;

/**
 * Recommended papers (#26): the top `shown` recommendations, each with its room/time and
 * similarity, "why" (the most similar paper in My Papers, opening its details), "Add to My
 * Papers" and "Dismiss". `state.status`: "empty" (My Papers is empty), "loading", "error"
 * (the embeddings didn't load) or "ready" with `state.recs`.
 */
export function renderRecommended(
  state,
  { tz, shown = STEP, onAdd, onDismiss, onOpen, onShowMore },
) {
  const note = (text) => html`<p class="muted">${text}</p>`;
  const body = (() => {
    if (state.status === "empty")
      return note(
        "Add papers to My Papers and papers similar to them show up here.",
      );
    if (state.status === "loading") return note("Finding papers like yours…");
    if (state.status === "error")
      return note(
        "Recommendations are unavailable: the paper embeddings couldn't load (offline before they were saved on this device?).",
      );
    const { recs } = state;
    if (!recs.length)
      return note("No more papers to recommend: you've seen them all.");
    const more =
      recs.length > shown
        ? html`<button class="btn-text recommended-more">
            Show more (${Math.min(STEP, recs.length - shown)})
          </button>`
        : "";
    if (more) more.onclick = () => onShowMore(shown + STEP);
    return html`<ol class="recommended-papers">
        ${recs.slice(0, shown).map((p) => renderRow(p))}
      </ol>
      ${more}`;
  })();

  function renderRow(p) {
    const open = html`<button class="btn-text recommended-open">
      ${p.title}
    </button>`;
    open.onclick = () => onOpen(p);
    // A real link to its details URL (inline, wraps with the text); a plain click opens the
    // panel in place, a modified click opens a new tab
    const why = html`<a
      href=${`?paper=${encodeURIComponent(p.because.shortId ?? p.because.id)}`}
      >${p.because.title}</a
    >`;
    why.onclick = (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button)
        return;
      event.preventDefault();
      onOpen(p.because);
    };
    const add = html`<button class="follow-toggle" aria-pressed="false">
      <span class="ring" aria-hidden="true"></span>Add to My Papers
    </button>`;
    add.onclick = () => onAdd(p);
    const dismiss = html`<button
      class="btn-text recommended-dismiss"
      aria-label=${`Dismiss: ${p.title}`}
    >
      Dismiss
    </button>`;
    dismiss.onclick = () => onDismiss(p);
    const meta = [
      p.room && `📍 ${p.room}`,
      paperWhen(p, tz),
      `${Math.round(p.score * 100)}% similar`,
    ]
      .filter(Boolean)
      .join(" · ");
    return html`<li class="recommended-paper" data-paper-id=${p.id}>
      ${open}
      <span class="recommended-meta">${meta}</span>
      <span class="recommended-why">✨ Like ${why}</span>
      <span class="paper-actions">${add}${dismiss}</span>
    </li>`;
  }

  return html`<section class="recommended-section">${body}</section>`;
}
