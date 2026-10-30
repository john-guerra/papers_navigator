import { classifyNeighbours } from "../lib/neighbours.js";

/**
 * Nearest neighbours on the map (#102), attached to a BrushableScatterPlot built with
 * `neighbours: true` in its spec (the `nn` dataset and `nnIds` param, see neighbourLayers).
 *
 * - Hovering near a point (pointAt's radius, like the tooltip) previews its k true neighbours,
 *   when `enabled`; leaving the map clears the preview.
 * - A click or tap near a point pins it (whatever `enabled` says: it is an explicit request);
 *   a click on empty space unpins. A drag (brushing) is not a click.
 * - `el.pinNeighbours(id)`, `el.unpinNeighbours()`, `el.previewNeighbours(id | null)` (keyboard
 *   focus on a paper row) and `el.neighbourSettings({enabled, k})` drive it from the page.
 * - `el.neighbours` is {focus, pinned, k, neighbours, falseNeighbours}; a `neighbours` event
 *   (not `input`: it never changes the selection) fires when the pin or k changes, with
 *   `detail.action` "pin" on every pin (also re-pinning the same paper).
 *
 * `similar(id, k)` gives the true neighbours ({id, similarity}, most similar first) among the
 * papers on the map; `rows(focus, classification, position)` builds the dataset rows. Positions
 * are the drawn (final) coordinates, so live and aligned projections just work.
 */
export function attachNeighbours(
  el,
  {
    view,
    data,
    x = "x",
    y = "y",
    id = "id",
    pointAt,
    similar,
    rows,
    k = 10,
    enabled = true,
    pinned = null,
  },
) {
  const positions = new Map(data.map((d) => [d[id], [d[x], d[y]]]));
  const position = (key) => positions.get(key);
  const state = {
    k,
    enabled,
    hover: null,
    pinned: positions.has(pinned) ? pinned : null,
  };
  let shown = { focus: null, k: null };
  let current = empty();

  function empty() {
    return { focus: null, neighbours: [], falseNeighbours: [] };
  }

  const classify = (focus) =>
    focus == null
      ? empty()
      : {
          focus,
          ...classifyNeighbours(
            focus,
            similar(focus, state.k),
            positions,
            state.k,
          ),
        };

  /** Draws the current focus (pinned first, else the hover preview); no-op if unchanged. */
  const render = () => {
    const focus = state.pinned ?? (state.enabled ? state.hover : null);
    if (focus === shown.focus && state.k === shown.k) return Promise.resolve();
    shown = { focus, k: state.k };
    current = classify(focus);
    const ids =
      focus == null ? [] : [focus, ...current.neighbours.map((d) => d.id)];
    const values = focus == null ? [] : rows(focus, current, position);
    return view
      .change(
        "nn",
        view
          .changeset()
          .remove(() => true)
          .insert(values),
      )
      .signal("nnIds", ids)
      .runAsync();
  };

  // One render per frame at most while the pointer moves
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    (globalThis.requestAnimationFrame ?? ((f) => setTimeout(f, 16)))(() => {
      pending = false;
      render();
    });
  };

  const emit = (action) =>
    el.dispatchEvent(
      new CustomEvent("neighbours", { detail: { action, ...el.neighbours } }),
    );

  Object.defineProperty(el, "neighbours", {
    get: () => ({
      focus: shown.focus,
      pinned: state.pinned,
      k: state.k,
      // Map rank up to which a neighbour counts as close on the map (lib/neighbours.js)
      reach: current.reach ?? null,
      neighbours: state.pinned != null ? current.neighbours : [],
      falseNeighbours: state.pinned != null ? current.falseNeighbours : [],
    }),
    configurable: true,
  });

  el.pinNeighbours = (key) => {
    if (!positions.has(key)) return;
    state.pinned = key;
    const done = render();
    emit("pin");
    return done;
  };
  el.unpinNeighbours = () => {
    if (state.pinned == null) return Promise.resolve();
    state.pinned = null;
    const done = render();
    emit("unpin");
    return done;
  };
  el.previewNeighbours = (key) => {
    state.hover = positions.has(key) ? key : null;
    return render();
  };
  el.neighbourSettings = ({
    enabled: on = state.enabled,
    k: count = state.k,
  } = {}) => {
    const kChanged = count !== state.k;
    Object.assign(state, { enabled: on, k: count });
    const done = render();
    if (kChanged && state.pinned != null) emit("k");
    return done;
  };

  el.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || event.buttons) return;
    const d = pointAt(event.clientX, event.clientY);
    const next = d ? d[id] : null;
    if (next === state.hover) return;
    state.hover = next;
    if (state.pinned == null) schedule();
  });
  el.addEventListener("pointerleave", () => {
    state.hover = null;
    if (state.pinned == null) schedule();
  });
  // A click near a point pins it, on empty space unpins; a drag (brush) is neither
  let down = null;
  el.addEventListener(
    "pointerdown",
    (event) => (down = [event.clientX, event.clientY]),
  );
  el.addEventListener("click", (event) => {
    if (
      down &&
      Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 4
    )
      return;
    const d = pointAt(event.clientX, event.clientY);
    if (d) el.pinNeighbours(d[id]);
    else el.unpinNeighbours();
  });

  // A pin carried over from the previous map (redraws keep it)
  el.neighboursReady = state.pinned != null ? render() : Promise.resolve();
  return el;
}
