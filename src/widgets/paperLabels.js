// Unlike John's other widgets, smart-labels has an `exports` map whose "import" condition is
// its ES build (dist/smartLabels.es.js), and it doesn't export that path itself: import it bare.
import smartLabels from "smart-labels";
import {
  chooseLabels,
  estimateWidth,
  labelBudget,
  labelFilter,
  pixelMapper,
  textBox,
} from "../lib/paperLabels.js";

const SVG = "http://www.w3.org/2000/svg";

/** Area of a Voronoi cell (a closed polygon) in px²; 0 without one. */
function cellArea(cell) {
  if (!cell) return 0;
  let area = 0;
  for (let i = 0, n = cell.length; i < n; i++) {
    const [x0, y0] = cell[i];
    const [x1, y1] = cell[(i + 1) % n];
    area += x0 * y1 - x1 * y0;
  }
  return Math.abs(area) / 2;
}

/**
 * The boxes of the map's legends in canvas pixels (the overlay's frame), from Vega's scenegraph:
 * item bounds are in their group's frame, so group offsets add up on the way down.
 */
export function legendBoxes(view) {
  const boxes = [];
  const walk = (mark, ox, oy) => {
    for (const item of mark?.items ?? []) {
      if (mark.role === "legend" && item.bounds) {
        const b = item.bounds;
        boxes.push([ox + b.x1, oy + b.y1, ox + b.x2, oy + b.y2]);
      } else if (item.items)
        for (const child of item.items)
          walk(child, ox + (item.x ?? 0), oy + (item.y ?? 0));
    }
  };
  try {
    walk(view.scenegraph().root, 0, 0);
  } catch {
    // No scenegraph yet: no legend to avoid
  }
  return boxes;
}

/**
 * Short paper labels (#99) on a BrushableScatterPlot, drawn by smart-labels (Voronoi cells decide
 * which papers have room, `threshold` px²) into an SVG laid over the Vega canvas. The overlay
 * never takes the pointer (`pointer-events: none`), so the brush, clicks, the nearest-point
 * tooltip and the neighbours card work as before; smart-labels' own hover label is off (the
 * tooltip, #89, already shows the label first), so the pointer costs nothing here.
 *
 * Positions come from the view's scales and origin, like pointAt. Labels are drawn only for papers
 * in color (`labelFilter`), next to their point on the side with the most room, and then kept in
 * priority order (`chooseLabels`): the pinned paper, `emphasis` ids (top matches, the query's
 * nearest paper), then by room, never over `obstacles(toPixel)` (topic labels, the query marker,
 * the legend) or each other, at most `labelBudget` of the space-based ones.
 *
 * Returns a controller: `update({enabled, emphasis})`, `schedule()` (debounced redraw), `render()`,
 * `clear()`, `shown()` (the ids drawn) and `svg`.
 */
export function attachPaperLabels(
  target,
  {
    view,
    data,
    x = "x",
    y = "y",
    id = "id",
    label = "shortLabel",
    enabled = true,
    emphasis = [],
    moving = () => false,
    brush = () => null,
    levelCut = () => null,
    pinned = () => null,
    focusIds = () => null,
    obstacles = () => [],
    font = "sans-serif",
    fontSize = 10,
    fill = "#241e1a",
    halo = "#fcf9f3",
    threshold = 1200,
    delay = 120,
  },
) {
  const state = { enabled, emphasis: [...emphasis] };
  // Every drawn point takes room in the Voronoi diagram, labelled or not
  const rows = data.filter(
    (d) => Number.isFinite(d[x]) && Number.isFinite(d[y]),
  );
  const svg = document.createElementNS(SVG, "svg");
  svg.classList.add("paper-labels");
  svg.setAttribute("aria-hidden", "true");
  Object.assign(svg.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    overflow: "visible",
    pointerEvents: "none",
  });
  const fontSpec = `400 ${fontSize}px ${font}`;
  let shown = new Set();
  let stats = null;
  let timer = null;
  let retries = 0;

  const clear = () => {
    shown = new Set();
    svg.replaceChildren();
  };

  /** Lays the overlay over the Vega surface; false while the map isn't on the page yet. */
  const place = () => {
    const surface = target.querySelector(".marks");
    if (!surface || !target.isConnected) return false;
    const parent = surface.parentElement;
    if (getComputedStyle(parent).position === "static")
      parent.style.position = "relative";
    if (svg.parentElement !== parent) parent.append(svg);
    svg.style.left = `${surface.offsetLeft}px`;
    svg.style.top = `${surface.offsetTop}px`;
    const [ox, oy] = view.origin();
    svg.setAttribute("width", String(view.width() + 2 * ox));
    svg.setAttribute("height", String(view.height() + 2 * oy));
    return true;
  };

  const render = () => {
    timer = null;
    if (!state.enabled || moving()) return clear();
    if (!place()) {
      // Framework shows the map after the cell returns: try again for about a second
      if (retries++ < 60)
        (globalThis.requestAnimationFrame ?? ((f) => setTimeout(f, 16)))(
          render,
        );
      return;
    }
    retries = 0;
    const allowed = labelFilter({
      brush: brush(),
      levelCut: levelCut(),
      focusIds: focusIds(),
      x,
      y,
      id,
    });
    const focus = pinned();
    const always = new Map(
      [focus, ...state.emphasis]
        .filter((key) => key != null)
        .map((key, i) => [key, i]),
    );
    const toPixel = pixelMapper({
      sx: view.scale("x"),
      sy: view.scale("y"),
      origin: view.origin(),
    });
    // The Voronoi diagram has only the papers in color: dimmed ones recede (DESIGN.md), so their
    // space counts as room, and a brushed or filtered few get labels where they now stand out.
    // smart-labels clips the cells to its points' extent: the canvas corners (never labelled)
    // keep the cells of points near the edge as big as their room on screen.
    const [ox, oy] = view.origin();
    const w = view.width() + 2 * ox;
    const h = view.height() + 2 * oy;
    const items = [
      ...rows.filter(allowed).map((d) => {
        const [px, py] = toPixel([d[x], d[y]]);
        return { d, px, py, ok: Boolean(d[label]) };
      }),
      ...[
        [0, 0],
        [w, 0],
        [0, h],
        [w, h],
      ].map(([px, py]) => ({ d: {}, px, py, ok: false })),
    ];
    if (!items.some((o) => o.ok)) return clear();
    const result = smartLabels(items, {
      target: svg,
      x: (o) => o.px,
      y: (o) => o.py,
      r: () => 4,
      padding: 2,
      label: (o) => o.d[label] ?? "",
      font: () => fontSpec,
      fill,
      stroke: halo,
      strokeWidth: 3,
      hover: false,
      useOcclusion: false,
      labelsInCentroids: false,
      backgroundFill: "none",
      showLabel: (o, cell) =>
        o.ok && (always.has(o.d[id]) || cellArea(cell) > threshold),
    });
    // Rounded joins on the halo, like the topic labels
    svg.querySelector("g.labels")?.setAttribute("stroke-linejoin", "round");
    const texts = svg.querySelectorAll("g.labels > text");
    const candidates = [];
    result.cells.forEach(({ d: o, cell, show }, i) => {
      const text = texts[i];
      if (!show || !text) return;
      const key = o.d[id];
      const dy = text.getAttribute("dy");
      const width =
        text.getComputedTextLength?.() || estimateWidth(o.d[label], fontSize);
      candidates.push({
        key,
        text,
        always: always.has(key),
        rank: always.has(key) ? always.get(key) : -cellArea(cell),
        box: textBox({
          x: o.px + Number(text.getAttribute("x") ?? 0),
          y: o.py + Number(text.getAttribute("y") ?? 0),
          width,
          height: fontSize * 1.2,
          anchor: text.getAttribute("text-anchor") ?? "middle",
          baseline: dy === "0.71em" ? "top" : dy ? "middle" : "bottom",
          margin: 1,
        }),
      });
    });
    const blocked = obstacles(toPixel);
    stats = { candidates: candidates.length, obstacles: blocked.length };
    shown = chooseLabels(candidates, {
      obstacles: blocked,
      // The Vega canvas (plot plus its padding): the overlay doesn't clip, the page would
      bounds: [0, 0, w, h],
      max: labelBudget(view.width(), view.height()),
    });
    for (const c of candidates)
      if (!shown.has(c.key)) c.text.setAttribute("display", "none");
  };

  const schedule = () => {
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(render, delay);
  };

  return {
    svg,
    render,
    schedule,
    clear,
    shown: () => [...shown],
    // For checking the density in a browser: labels with room, obstacles avoided
    stats: () => stats,
    update({
      enabled: on = state.enabled,
      emphasis: ids = state.emphasis,
    } = {}) {
      const same =
        on === state.enabled &&
        ids.length === state.emphasis.length &&
        ids.every((key, i) => key === state.emphasis[i]);
      if (same) return;
      Object.assign(state, { enabled: on, emphasis: [...ids] });
      if (!on) {
        if (timer != null) clearTimeout(timer);
        clear();
      } else schedule();
    },
  };
}
