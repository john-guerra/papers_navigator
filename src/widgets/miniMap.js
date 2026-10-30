import { clusterLabels } from "../lib/clusters.js";
import {
  domainIncluding,
  interpolateDomain,
  miniMapMotion,
  miniMapSummary,
  neighbourhoodDomain,
} from "../lib/miniMap.js";
import { ease } from "./scatterTransition.js";

/** A DESIGN.md token from the page's CSS (light or dark, read at render time), or `fallback`. */
function token(name, fallback) {
  const value =
    typeof document === "undefined"
      ? ""
      : getComputedStyle(document.documentElement)
          .getPropertyValue(`--${name}`)
          .trim();
  return value || fallback;
}

/** How near (px) the pointer must be to a point to hover or click it (the dots are small). */
const HIT_RADIUS = 16;

/**
 * The mini-map's Vega-Lite spec (#101): every paper on the map, clipped to the zoom; the related
 * papers (`relatedIds`) drawn in ink, the rest `viz-dim`; the paper (`focusId`) in the accent
 * with an ink ring; topic labels inside the zoom. Params drive it without a redraw:
 * `xd` / `yd` (the zoom, data units), `hoverId` (a line from the paper to it and a ring) and
 * `pulse` (0 → 1: a ring growing and fading around the highlighted paper).
 */
export function miniMapSpec(
  rows,
  { focusId, relatedIds = [], labels = [], domain, width, height },
) {
  const related = new Set(relatedIds);
  const focus = rows.find((d) => d.id === focusId);
  // Related papers above the rest, the paper on its own layer
  const values = rows
    .filter((d) => d.id !== focusId)
    .map((d) => ({
      id: d.id,
      x: d.x,
      y: d.y,
      title: d.title,
      r: related.has(d.id) ? 1 : 0,
    }))
    .sort((a, b) => a.r - b.r);
  const scale = (signal) => ({
    domain: [{ expr: `${signal}[0]` }, { expr: `${signal}[1]` }],
    zero: false,
    nice: false,
  });
  const position = {
    x: { field: "x", type: "quantitative", axis: null, scale: scale("xd") },
    y: { field: "y", type: "quantitative", axis: null, scale: scale("yd") },
  };
  const ink = token("color-on-surface", "#241e1a");
  const background = token("color-background", "#fcf9f3");
  const hovered = { filter: "hoverId != null && datum.id === hoverId" };
  const insideZoom =
    "datum.x >= xd[0] && datum.x <= xd[1] && datum.y >= yd[0] && datum.y <= yd[1]";
  const label = (mark) => ({
    data: { values: labels.map((l) => ({ text: l.text, x: l.x, y: l.y })) },
    transform: [{ filter: insideZoom }],
    mark: {
      type: "text",
      clip: true,
      interactive: false,
      fontSize: 10,
      fontWeight: 600,
      font: token("font-sans", "sans-serif"),
      ...mark,
    },
    encoding: { ...position, text: { field: "text" } },
  });
  const focusRow = focus ? [{ id: focus.id, x: focus.x, y: focus.y }] : [];
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    width,
    height,
    autosize: { type: "none" },
    padding: 0,
    data: { values },
    params: [
      { name: "xd", value: domain.x },
      { name: "yd", value: domain.y },
      { name: "hoverId", value: null },
      { name: "pulse", value: 1 },
    ],
    layer: [
      {
        mark: { type: "point", filled: true, clip: true, interactive: false },
        encoding: {
          ...position,
          color: {
            condition: {
              test: "datum.r === 1",
              value: token("color-viz-neutral", "#605954"),
            },
            value: token("color-viz-dim", "#e1ddd8"),
          },
          size: { condition: { test: "datum.r === 1", value: 40 }, value: 18 },
          opacity: { value: 1 },
        },
      },
      ...(labels.length
        ? [
            label({
              fill: background,
              stroke: background,
              strokeWidth: 3,
              strokeJoin: "round",
              strokeOpacity: 0.9,
            }),
            label({ fill: ink }),
          ]
        : []),
      // The line from the paper to the highlighted one
      ...(focus
        ? [
            {
              transform: [
                hovered,
                { calculate: String(focus.x), as: "fx" },
                { calculate: String(focus.y), as: "fy" },
              ],
              mark: {
                type: "rule",
                clip: true,
                interactive: false,
                color: ink,
                strokeWidth: 1.5,
              },
              encoding: {
                ...position,
                x2: { field: "fx" },
                y2: { field: "fy" },
              },
            },
          ]
        : []),
      // The highlighted paper: a steady ink ring, and the pulse growing and fading around it
      {
        transform: [hovered],
        mark: {
          type: "point",
          filled: false,
          clip: true,
          interactive: false,
          color: ink,
          size: 110,
          strokeWidth: 2,
        },
        encoding: position,
      },
      {
        transform: [hovered, { filter: "pulse < 1" }],
        mark: {
          type: "point",
          filled: false,
          clip: true,
          interactive: false,
          color: token("color-primary", "#903129"),
          size: { expr: "110 + 500 * pulse" },
          strokeWidth: 2,
          opacity: { expr: "1 - pulse" },
        },
        encoding: position,
      },
      // The paper: accent dot in an ink ring (like the neighbour pin on the main map)
      {
        data: { values: focusRow },
        mark: {
          type: "point",
          filled: true,
          clip: true,
          interactive: false,
          color: token("color-primary", "#903129"),
          size: 70,
        },
        encoding: position,
      },
      {
        data: { values: focusRow },
        mark: {
          type: "point",
          filled: false,
          clip: true,
          interactive: false,
          color: ink,
          size: 190,
          strokeWidth: 2.5,
        },
        encoding: position,
      },
    ],
    config: { background: "transparent", view: { stroke: null }, aria: false },
  };
}

const nextFrame = (callback) =>
  globalThis.requestAnimationFrame
    ? requestAnimationFrame(callback)
    : setTimeout(() => callback(performance.now()), 16);
const cancelFrame = (handle) =>
  globalThis.cancelAnimationFrame
    ? cancelAnimationFrame(handle)
    : clearTimeout(handle);

/** The mini-map's size: about 300×200 in the details panel, the panel's full width on phones. */
export function miniMapSize(available, { phone = false } = {}) {
  const width = Math.max(
    200,
    Math.round(phone ? available : Math.min(available, 320)),
  );
  return { width, height: Math.round(width / 1.5) };
}

/**
 * The paper details mini-map (#101). `rows`: every paper on the map ({id, x, y, title, cluster,
 * clusterLabel}, positioned as the main map draws them); `focusId`: the paper; `relatedIds`: its
 * related papers (drawn darker). Returns null when the paper isn't on the map.
 *
 * `el.highlight(id | null)`: a line from the paper to `id`, a pulse on it and, if it is outside
 * the zoom, a short pan/zoom to include it (instant, without the pulse, when `animation()`
 * says map animation is off); null goes back. A click (or tap) near a point calls
 * `onOpen(id)`. `el.ready` resolves once drawn; `el.dispose()` stops it.
 */
export function createMiniMap({
  rows,
  focusId,
  title = "",
  relatedIds = [],
  onOpen = () => {},
  animation = () => ({ enabled: false }),
  phone = () => globalThis.matchMedia?.("(max-width: 639.98px)").matches,
  renderer = "canvas",
}) {
  const placed = rows.filter(
    (d) => Number.isFinite(d.x) && Number.isFinite(d.y),
  );
  const positions = new Map(placed.map((d) => [d.id, [d.x, d.y]]));
  const center = positions.get(focusId);
  if (!center) return null;
  const labels = clusterLabels(placed);
  const ASPECT = 1.5;
  const base = neighbourhoodDomain(positions, focusId, {
    k: 15,
    aspect: ASPECT,
  });

  const el = document.createElement("figure");
  el.className = "mini-map";
  const plot = document.createElement("div");
  plot.className = "mini-map-plot";
  // One image with a summary for assistive tech (Vega labels its own container generically)
  plot.setAttribute("aria-hidden", "true");
  el.setAttribute("role", "img");
  el.setAttribute(
    "aria-label",
    miniMapSummary({ title, relatedIds, positions, domain: base }),
  );
  el.append(plot);

  const state = {
    hover: null,
    domain: base,
    view: null,
    frame: null,
    disposed: false,
  };
  let size = null;
  let resolveReady;
  el.ready = new Promise((resolve) => (resolveReady = resolve));
  // The Vega view on screen (a theme change replaces it)
  Object.defineProperty(el, "view", { get: () => state.view });

  // Nearest point to the pointer (pixels), within HIT_RADIUS: the dots are small
  const nearest = (event) => {
    const { view } = state;
    if (!view) return null;
    const rect = plot.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const sx = view.scale("x");
    const sy = view.scale("y");
    let best = null;
    let bestD = HIT_RADIUS ** 2;
    for (const d of placed) {
      const x = sx(d.x);
      const y = sy(d.y);
      // Only points drawn in the frame (the rest are clipped)
      if (x < 0 || x > size.width || y < 0 || y > size.height) continue;
      const dx = x - px;
      const dy = y - py;
      const dist = dx * dx + dy * dy;
      if (dist <= bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  };
  plot.addEventListener("pointermove", (event) => {
    const d = nearest(event);
    plot.style.cursor = d && d.id !== focusId ? "pointer" : "";
    plot.title = d?.title ?? "";
  });
  plot.addEventListener("click", (event) => {
    const d = nearest(event);
    if (d && d.id !== focusId) onOpen(d.id);
  });

  async function draw() {
    const available = el.clientWidth || plot.clientWidth || 320;
    size = miniMapSize(available, { phone: phone() });
    const [vega, { compile }] = await Promise.all([
      import("vega"),
      import("vega-lite"),
    ]);
    if (state.disposed) return;
    // A tween in progress drove the old view: stop it and draw where it was going
    stopMotion();
    const spec = miniMapSpec(placed, {
      focusId,
      relatedIds,
      labels,
      domain: state.domain,
      ...size,
    });
    state.view?.finalize();
    const view = new vega.View(vega.parse(compile(spec).spec), {
      renderer,
      container: plot,
      hover: false,
    });
    state.view = view;
    if (state.hover != null) view.signal("hoverId", state.hover);
    await view.runAsync();
    resolveReady(view);
  }

  // A map that can't draw (no canvas) leaves the details as they were, without it
  const safeDraw = () =>
    draw().catch(() => {
      el.hidden = true;
      el.nextElementSibling?.classList.contains("mini-map-note") &&
        (el.nextElementSibling.hidden = true);
    });

  const target = () =>
    state.hover != null
      ? domainIncluding(base, center, positions.get(state.hover))
      : base;
  const stopMotion = () => {
    if (state.frame == null) return;
    cancelFrame(state.frame);
    state.frame = null;
    state.domain = target();
  };

  // One frame loop for the zoom tween and the pulse
  function animate({ from, to, tween, pulse }) {
    cancelFrame(state.frame);
    const { view } = state;
    const start = performance.now();
    const step = () => {
      if (view !== state.view) return; // rebuilt or finalized meanwhile
      const t = performance.now() - start;
      const p = tween ? Math.min(1, t / tween) : 1;
      state.domain = p < 1 ? interpolateDomain(from, to, ease(p)) : to;
      view.signal("xd", state.domain.x).signal("yd", state.domain.y);
      const q = pulse ? Math.min(1, t / pulse) : 1;
      view.signal("pulse", q);
      view.runAsync();
      state.frame = p < 1 || q < 1 ? nextFrame(step) : null;
    };
    step();
  }

  el.highlight = (id) => {
    const next = id != null && positions.has(id) && id !== focusId ? id : null;
    if (next === state.hover) return;
    state.hover = next;
    const { view } = state;
    if (!view) return; // drawn with it once ready
    view.signal("hoverId", next);
    const motion = miniMapMotion(animation());
    animate({
      from: state.domain,
      to: target(),
      tween: motion.tween,
      pulse: next ? motion.pulse : 0,
    });
  };

  // Colors come from the tokens: redraw when Appearance or the OS theme changes
  const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
  const redraw = () => {
    if (state.view) safeDraw();
  };
  addEventListener("themechange", redraw);
  media?.addEventListener?.("change", redraw);

  el.dispose = () => {
    state.disposed = true;
    stopMotion();
    removeEventListener("themechange", redraw);
    media?.removeEventListener?.("change", redraw);
    state.view?.finalize();
  };

  // Drawn once on the page (its width depends on the panel's)
  nextFrame(() => !state.disposed && safeDraw());
  return el;
}
