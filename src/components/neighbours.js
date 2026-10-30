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
/** Maps shorter than this start the floating card collapsed (its header only). */
export const SHORT_MAP_HEIGHT = 600;
/** "Show all k" grows the floating card up to this share of the map's height, then it scrolls. */
export const EXPANDED_MAX_SHARE = 0.6;

/**
 * The pinned paper's neighbours (#102): each with its similarity and its rank by distance on the
 * map, its title opening the details (`href`/`onOpen`, like the list); ✕ unpins (`onClose`).
 * `show(state)` takes the map's `neighbours` state; hidden while nothing is pinned.
 *
 * `floating` (a MediaQueryList, e.g. the two-column layout's) makes it the compact card over the
 * sticky map's corner (#114): "10 neighbours of ‘…’" with a collapse toggle, then the top 5 as
 * one-line rows (title clamped with an ellipsis, full title on hover/focus, similarity on the
 * same line) and "Show all k". `fit(mapHeight)` sizes it to the map: expanded it stays under
 * 60% of the map's height, and on maps under 600px it starts collapsed until you open it.
 * Otherwise (stacked layouts) the full list sits under the map. It redraws itself when
 * `floating` changes.
 */
export function neighboursPanel({ paperOf, href, onOpen, onClose, floating }) {
  const el = html`<section
    class="neighbours-panel"
    aria-label="Nearest neighbours"
    aria-live="polite"
    hidden
  ></section>`;
  // collapsed: null until the reader toggles it (then their choice holds across pins)
  const view = {
    state: null,
    expandedFor: null,
    collapsed: null,
    mapHeight: null,
  };
  const link = (p, title) => {
    const a = html`<a class="neighbours-title" href=${href(p)}>${p.title}</a>`;
    if (title) a.title = title;
    a.onclick = (event) => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey)
        return;
      event.preventDefault();
      onOpen(p);
    };
    return a;
  };
  const meta = (d) =>
    `${Math.round(d.similarity * 100)}% similar · map #${d.mapRank}${d.missing ? " (far)" : ""}`;
  const isCollapsed = () =>
    view.collapsed ??
    (view.mapHeight != null && view.mapHeight < SHORT_MAP_HEIGHT);
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
    const near = neighbours.filter((d) => !d.missing).length;
    const summary = `${near} of ${neighbours.length} close on the map (within its ${reach} nearest); dashed lines: farther away`;
    if (!compact) {
      el.replaceChildren(
        html`<div class="neighbours-header">
          <h3>Nearest neighbours of ${link(focus)}</h3>
          <span class="neighbours-buttons">${close}</span>
        </div>`,
        html`<p class="neighbours-summary">${summary}</p>`,
        html`<ol class="neighbours-list">
          ${neighbours.map((d) => {
            const p = paperOf(d.id);
            return html`<li class=${d.missing ? "missing" : ""}>
              ${p ? link(p) : d.id}
              <span class="neighbours-meta">${meta(d)}</span>
            </li>`;
          })}
        </ol>`,
      );
      return;
    }
    const collapsed = isCollapsed();
    const toggle = html`<button
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
    </button>`;
    toggle.onclick = () => {
      view.collapsed = !collapsed;
      render();
      el.querySelector(".neighbours-collapse")?.focus();
    };
    const header = html`<div class="neighbours-header" title=${summary}>
      <h3>${neighbours.length} neighbours of ‘${link(focus, focus.title)}’</h3>
      <span class="neighbours-buttons">${toggle}${close}</span>
    </div>`;
    if (collapsed) return el.replaceChildren(header);
    const expanded = view.expandedFor === pinned;
    const listed = expanded ? neighbours : neighbours.slice(0, FLOATING_LIMIT);
    el.classList.toggle("is-expanded", expanded);
    const more =
      neighbours.length > FLOATING_LIMIT
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
    el.replaceChildren(
      header,
      html`<ol class="neighbours-list">
        ${listed.map((d) => {
          const p = paperOf(d.id);
          return html`<li class=${d.missing ? "missing" : ""}>
            ${p ? link(p, `${p.title} (${meta(d)})`) : d.id}
            <span class="neighbours-meta"
              >${Math.round(d.similarity * 100)}%${d.missing ? " far" : ""}</span
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
  /** Sizes the floating card to the map: its height caps (CSS) and the collapsed default. */
  el.fit = (mapHeight) => {
    view.mapHeight = mapHeight;
    el.style.setProperty("--map-height", `${mapHeight}px`);
    el.style.setProperty(
      "--neighbours-expanded-max",
      `${Math.round(mapHeight * EXPANDED_MAX_SHARE)}px`,
    );
    if (view.state) render();
  };
  floating?.addEventListener?.("change", render);
  /** Stops following `floating`. */
  el.dispose = () => floating?.removeEventListener?.("change", render);
  return el;
}
