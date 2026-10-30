import { html } from "htl";
import { NEIGHBOUR_COUNTS } from "../lib/neighbours.js";

/**
 * Options → Advanced (#102): "Nearest neighbours on hover" and how many (10 / 15), bound to a
 * neighbour settings store (lib/neighbours.js). Same controls as Options → Animation.
 */
export function neighboursControl(store) {
  const input = html`<input type="checkbox" data-setting="neighbours" />`;
  input.onchange = () => store.set({ enabled: input.checked });
  const buttons = NEIGHBOUR_COUNTS.map((k) => {
    const button = Object.assign(document.createElement("button"), {
      type: "button",
      textContent: String(k),
    });
    button.dataset.value = String(k);
    button.onclick = () => store.set({ k });
    return button;
  });
  const sync = () => {
    input.checked = store.value.enabled;
    for (const b of buttons)
      b.setAttribute(
        "aria-pressed",
        String(+b.dataset.value === store.value.k),
      );
  };
  sync();
  store.addEventListener("input", sync);
  const el = html`<div class="animation-control neighbours-control">
    <label class="animation-toggle">${input} Nearest neighbours on hover</label>
    <div class="animation-choice">
      <span class="animation-label" id="neighbours-k">Neighbours</span>
      <div
        class="relevance-control"
        role="group"
        aria-labelledby="neighbours-k"
      >
        ${buttons}
      </div>
    </div>
    <p class="muted neighbours-help">
      Lines join a paper to its most similar papers; dashed ones are far on the
      map. Click a point to pin them.
    </p>
  </div>`;
  /** Stops following the store (pages call it on invalidation). */
  el.dispose = () => store.removeEventListener("input", sync);
  return el;
}

/**
 * The pinned paper's neighbours (#102), under the map: each with its similarity and its rank by
 * distance on the map, its title opening the details (`href`/`onOpen`, like the list); ✕ unpins
 * (`onClose`). `show(state)` takes the map's `neighbours` state; hidden while nothing is pinned.
 */
export function neighboursPanel({ paperOf, href, onOpen, onClose }) {
  const el = html`<section
    class="neighbours-panel"
    aria-label="Nearest neighbours"
    aria-live="polite"
    hidden
  ></section>`;
  const link = (p) => {
    const a = html`<a class="neighbours-title" href=${href(p)}>${p.title}</a>`;
    a.onclick = (event) => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey)
        return;
      event.preventDefault();
      onOpen(p);
    };
    return a;
  };
  el.show = ({ pinned, reach, neighbours = [] } = {}) => {
    const focus = pinned != null ? paperOf(pinned) : null;
    el.hidden = !focus;
    if (!focus) return el.replaceChildren();
    const close = html`<button
      type="button"
      class="btn-text neighbours-close"
      aria-label="Unpin nearest neighbours"
    >
      ✕
    </button>`;
    close.onclick = onClose;
    const near = neighbours.filter((d) => !d.missing).length;
    el.replaceChildren(
      html`<div class="neighbours-header">
        <h3>Nearest neighbours of ${link(focus)}</h3>
        ${close}
      </div>`,
      html`<p class="neighbours-summary">
        ${near} of ${neighbours.length} close on the map (within its ${reach}
        nearest); dashed lines: farther away
      </p>`,
      html`<ol class="neighbours-list">
        ${neighbours.map((d) => {
          const p = paperOf(d.id);
          return html`<li class=${d.missing ? "missing" : ""}>
            ${p ? link(p) : d.id}
            <span class="neighbours-meta"
              >${Math.round(d.similarity * 100)}% similar · map
              #${d.mapRank}${d.missing ? " (far)" : ""}</span
            >
          </li>`;
        })}
      </ol>`,
    );
    return el;
  };
  return el;
}
