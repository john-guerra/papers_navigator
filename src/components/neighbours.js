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

/** How many neighbours the floating card lists before "Show all k". */
export const FLOATING_LIMIT = 5;

/**
 * The pinned paper's neighbours (#102): each with its similarity and its rank by distance on the
 * map, its title opening the details (`href`/`onOpen`, like the list); ✕ unpins (`onClose`).
 * `show(state)` takes the map's `neighbours` state; hidden while nothing is pinned.
 *
 * `floating` (a MediaQueryList, e.g. the two-column layout's) makes it the compact card over the
 * sticky map's corner (#114): the top 5 with "Show all k", and a collapse toggle that holds
 * across pins. Otherwise (stacked layouts) the full list sits under the map. It redraws itself
 * when `floating` changes.
 */
export function neighboursPanel({ paperOf, href, onOpen, onClose, floating }) {
  const el = html`<section
    class="neighbours-panel"
    aria-label="Nearest neighbours"
    aria-live="polite"
    hidden
  ></section>`;
  const view = { state: null, expandedFor: null, collapsed: false };
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
  const render = () => {
    const { pinned, reach, neighbours = [] } = view.state ?? {};
    const focus = pinned != null ? paperOf(pinned) : null;
    const compact = Boolean(floating?.matches);
    el.classList.toggle("is-floating", compact);
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
    const collapsed = compact && view.collapsed;
    const toggle = compact
      ? html`<button
          type="button"
          class="btn-text neighbours-collapse"
          aria-expanded=${String(!collapsed)}
          aria-label=${
            collapsed
              ? "Show the nearest neighbours"
              : "Collapse the nearest neighbours"
          }
        >
          ${collapsed ? "▸" : "▾"}
        </button>`
      : "";
    if (toggle)
      toggle.onclick = () => {
        view.collapsed = !view.collapsed;
        render();
        el.querySelector(".neighbours-collapse")?.focus();
      };
    const header = html`<div class="neighbours-header">
      <h3>Nearest neighbours of ${link(focus)}</h3>
      <span class="neighbours-buttons">${toggle}${close}</span>
    </div>`;
    if (collapsed) return el.replaceChildren(header);
    const expanded = !compact || view.expandedFor === pinned;
    const listed = expanded ? neighbours : neighbours.slice(0, FLOATING_LIMIT);
    const more =
      compact && neighbours.length > FLOATING_LIMIT
        ? html`<button type="button" class="btn-text neighbours-more">
            ${expanded ? "Show fewer" : `Show all ${neighbours.length}`}
          </button>`
        : "";
    if (more)
      more.onclick = () => {
        view.expandedFor = expanded ? null : pinned;
        render();
        el.querySelector(".neighbours-more")?.focus();
      };
    const near = neighbours.filter((d) => !d.missing).length;
    el.replaceChildren(
      header,
      html`<p class="neighbours-summary">
        ${near} of ${neighbours.length} close on the map (within its ${reach}
        nearest); dashed lines: farther away
      </p>`,
      html`<ol class="neighbours-list">
        ${listed.map((d) => {
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
      more,
    );
  };
  el.show = (state = {}) => {
    // "Show all" holds while the same paper stays pinned (the map redraws often)
    if (
      state.pinned !== view.state?.pinned &&
      view.expandedFor !== state.pinned
    )
      view.expandedFor = null;
    view.state = state;
    render();
    return el;
  };
  floating?.addEventListener?.("change", render);
  /** Stops following `floating`. */
  el.dispose = () => floating?.removeEventListener?.("change", render);
  return el;
}
