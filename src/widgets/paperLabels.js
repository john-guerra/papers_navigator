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

/** Centroid of a Voronoi cell (a closed polygon). */
function centroid(cell) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = cell.length; i < n; i++) {
    const [x0, y0] = cell[i];
    const [x1, y1] = cell[(i + 1) % n];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  return a ? [cx / (3 * a), cy / (3 * a)] : cell[0];
}

/**
 * Nudged places for a label of `width` px around its point (px, py): above, below, right and
 * left, farther each round. {lx, ly, anchor, dy, box}: where the text is anchored and how.
 */
export function nudgedPlacements(
  px,
  py,
  width,
  fontSize,
  steps = [12, 26, 40],
) {
  const height = fontSize * 1.2;
  const sides = [
    [0, -1, "middle", "bottom", null],
    [0, 1, "middle", "top", "0.71em"],
    [1, 0, "start", "middle", "0.35em"],
    [-1, 0, "end", "middle", "0.35em"],
  ];
  return steps.flatMap((step) =>
    sides.map(([sx, sy, anchor, baseline, dy]) => {
      const lx = px + sx * step;
      const ly = py + sy * step;
      return {
        lx,
        ly,
        anchor,
        dy,
        box: textBox({
          x: lx,
          y: ly,
          width,
          height,
          anchor,
          baseline,
          margin: 1,
        }),
      };
    }),
  );
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
 * in color (`labelFilter`), toward the center of their Voronoi cell (at most `reach` px away) with a
 * thin leader line to the point when apart, then kept in priority order (`chooseLabels`): the
 * pinned paper (always, nudged if it must be), `emphasis` ids (top matches, the query's nearest
 * paper), then by room, never over `obstacles(toPixel)` (topic labels, the query marker, the
 * legend) or each other, at most `labelBudget` minus `reserved()` (other text on the map, e.g.
 * neighbour percentages) of the space-based ones. Leader lines are masked out of the obstacles.
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
    reserved = () => 0,
    font = "sans-serif",
    fontSize = 10,
    fill = "#605954",
    halo = "#fcf9f3",
    leader = "#605954",
    threshold = 1200,
    reach = 30,
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
  let maskCount = 0;

  /**
   * Lays the overlay over the Vega surface, sized from the surface's own box (Vega's padding
   * isn't symmetric); [width, height] in px, or null while the map isn't on the page yet.
   */
  const place = () => {
    const surface = target.querySelector(".marks");
    if (!surface || !target.isConnected) return null;
    const parent = surface.parentElement;
    if (getComputedStyle(parent).position === "static")
      parent.style.position = "relative";
    if (svg.parentElement !== parent) parent.append(svg);
    svg.style.left = `${surface.offsetLeft}px`;
    svg.style.top = `${surface.offsetTop}px`;
    // jsdom has no layout: the plot plus its origin on both sides
    const [ox, oy] = view.origin();
    const w = surface.clientWidth || view.width() + 2 * ox;
    const h = surface.clientHeight || view.height() + 2 * oy;
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    return [w, h];
  };

  const render = () => {
    timer = null;
    // Always from scratch: smart-labels reuses existing <text> nodes and keeps their old
    // x/y/dy, which shifted labels by their previous orientation
    clear();
    if (!state.enabled || moving()) return;
    const size = place();
    if (!size) {
      // Framework shows the map after the cell returns: try again for about a second
      if (retries++ < 60)
        (globalThis.requestAnimationFrame ?? ((f) => setTimeout(f, 16)))(
          render,
        );
      return;
    }
    retries = 0;
    const [w, h] = size;
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
    if (!items.some((o) => o.ok)) return;
    // Labels toward their Voronoi cell's center (where the room is), joined to their point by
    // smart-labels' anchor line: the leader line
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
      labelsInCentroids: true,
      anchorsStroke: leader,
      backgroundFill: "none",
      showLabel: (o, cell) =>
        o.ok && (always.has(o.d[id]) || cellArea(cell) > threshold),
    });
    // Rounded joins on the halo, like the topic labels
    svg.querySelector("g.labels")?.setAttribute("stroke-linejoin", "round");
    const anchorGroup = svg.querySelector("g#anchors");
    anchorGroup?.setAttribute("stroke-width", "0.75");
    anchorGroup?.setAttribute("stroke-opacity", "0.7");
    const texts = svg.querySelectorAll("g.labels > text");
    const lines = svg.querySelectorAll("g#anchors > path.anchor");
    const candidates = [];
    result.cells.forEach(({ d: o, cell, show }, i) => {
      const text = texts[i];
      if (!show || !text || !cell) return;
      const key = o.d[id];
      // A big cell's center can be far away: keep the label within `reach` px of its point
      const [cx, cy] = centroid(cell);
      const far = Math.hypot(cx - o.px, cy - o.py);
      const k = far > reach ? reach / far : 1;
      const lx = o.px + (cx - o.px) * k;
      const ly = o.py + (cy - o.py) * k;
      const width =
        text.getComputedTextLength?.() || estimateWidth(o.d[label], fontSize);
      const dy = text.getAttribute("dy");
      const primary = {
        lx,
        ly,
        box: textBox({
          x: lx + Number(text.getAttribute("x") ?? 0),
          y: ly + Number(text.getAttribute("y") ?? 0),
          width,
          height: fontSize * 1.2,
          anchor: text.getAttribute("text-anchor") ?? "middle",
          baseline: dy === "0.71em" ? "top" : dy ? "middle" : "bottom",
          margin: 1,
        }),
      };
      // The pinned paper always gets its label: nudged around its point if it must be
      const nudges =
        key === focus ? nudgedPlacements(o.px, o.py, width, fontSize) : [];
      candidates.push({
        key,
        text,
        line: lines[i],
        point: [o.px, o.py],
        placements: [primary, ...nudges],
        always: always.has(key),
        force: key === focus,
        rank: always.has(key) ? always.get(key) : -cellArea(cell),
        box: primary.box,
        alternatives: nudges.map((n) => n.box),
      });
    });
    const blocked = obstacles(toPixel);
    stats = { candidates: candidates.length, obstacles: blocked.length };
    const kept = chooseLabels(candidates, {
      obstacles: blocked,
      // The Vega canvas: the overlay doesn't clip, the page would
      bounds: [0, 0, w, h],
      max: Math.max(0, labelBudget(view.width(), view.height()) - reserved()),
    });
    shown = new Set(kept.keys());
    for (const c of candidates) {
      if (!kept.has(c.key)) {
        c.text.setAttribute("display", "none");
        c.line?.setAttribute("display", "none");
        continue;
      }
      const spot = c.placements[kept.get(c.key)];
      if (spot.anchor) {
        // A nudge: anchor the text itself at the nudged point
        c.text.setAttribute("text-anchor", spot.anchor);
        c.text.removeAttribute("x");
        c.text.removeAttribute("y");
        if (spot.dy) c.text.setAttribute("dy", spot.dy);
        else c.text.removeAttribute("dy");
      }
      c.text.setAttribute("transform", `translate(${spot.lx}, ${spot.ly})`);
      // The leader line, only when the label sits apart from its point; it stops short of the dot
      if (!c.line) continue;
      const [px, py] = c.point;
      const apart = Math.hypot(spot.lx - px, spot.ly - py);
      if (apart < 10) c.line.setAttribute("display", "none");
      else {
        const t = 3 / apart;
        c.line.setAttribute(
          "d",
          `M${spot.lx},${spot.ly}L${px + (spot.lx - px) * t},${py + (spot.ly - py) * t}`,
        );
      }
    }
    // Leader lines pass under the topic labels, the query marker and the legend: the overlay sits
    // above the canvas, so a mask keeps them out of those boxes
    if (anchorGroup && blocked.length) {
      const maskId = `paper-labels-mask-${(maskCount += 1)}`;
      const defs = document.createElementNS(SVG, "defs");
      const mask = document.createElementNS(SVG, "mask");
      mask.setAttribute("id", maskId);
      mask.setAttribute("maskUnits", "userSpaceOnUse");
      const rect = (box, color) => {
        const r = document.createElementNS(SVG, "rect");
        r.setAttribute("x", String(box[0]));
        r.setAttribute("y", String(box[1]));
        r.setAttribute("width", String(box[2] - box[0]));
        r.setAttribute("height", String(box[3] - box[1]));
        r.setAttribute("fill", color);
        return r;
      };
      mask.append(
        rect([-w, -h, 3 * w, 3 * h], "white"),
        ...blocked.map((box) => rect(box, "black")),
      );
      defs.append(mask);
      svg.prepend(defs);
      anchorGroup.setAttribute("mask", `url(#${maskId})`);
    }
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
