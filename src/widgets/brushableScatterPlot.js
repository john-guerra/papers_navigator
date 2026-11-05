// The npm "main" is a UMD bundle; import the ES build explicitly.
import vegaSelected from "vega-selected/dist/vegaSelected.es.js";
import { attachNearestTooltip } from "./nearestTooltip.js";
import { attachNeighbours } from "./mapNeighbours.js";
import {
  attachPaperLabels,
  legendBoxes,
  surfaceOffset,
} from "./paperLabels.js";
import { diameterOf, similarityLegend } from "./similarityLegend.js";
import {
  similarityColorScale,
  similarityRange,
  token,
} from "../lib/similarityScheme.js";
import { estimateWidth, textBox } from "../lib/paperLabels.js";
import { matchArea, nameSpot } from "../lib/placeQuery.js";
import { bleedBox } from "../lib/bleedBox.js";
import { quietCorner } from "../lib/quietCorner.js";
import {
  domainAt,
  easeExpr,
  planTransition,
  positionAt,
} from "./scatterTransition.js";

/** Points inside a Vega-Lite interval brush ({[xField]: [lo, hi], [yField]: [lo, hi]}). */
export function brushFilter(data, drag, { x = "x", y = "y" } = {}) {
  if (!drag || !drag[x] || !drag[y]) return data;
  const [x0, x1] = drag[x];
  const [y0, y1] = drag[y];
  return data.filter(
    (d) => d[x] >= x0 && d[x] <= x1 && d[y] >= y0 && d[y] <= y1,
  );
}

// DESIGN.md tokens and the similarity ramp live in lib/similarityScheme.js (#166)
export { similarityRange };

/** DESIGN.md reliability ramp (#84), most to least reliable: it darkens where the map misleads. */
export function reliabilityRange() {
  return [
    token("color-viz-reliability-1", "#a3b0dc"),
    token("color-viz-reliability-2", "#5f74bf"),
    token("color-viz-reliability-3", "#28377a"),
  ];
}

/** The `n` most common values of `field` (ties alphabetical) — the categories that get a hue. */
export function topCategories(data, field, n = 3) {
  const counts = new Map();
  for (const d of data)
    if (d[field] != null) counts.set(d[field], (counts.get(d[field]) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, n)
    .map(([value]) => value);
}

/**
 * A topic label's lines: split after each ", " (topics are "a, b, c" keyword lists), then
 * words wrapped to about `max` characters per line. A single long word keeps its own line.
 */
export function wrapLabel(text, max = 18) {
  const parts = String(text ?? "").split(", ");
  const lines = [];
  parts.forEach((part, i) => {
    const words = `${part}${i < parts.length - 1 ? "," : ""}`.split(" ");
    let line = "";
    for (const word of words) {
      if (line && line.length + 1 + word.length > max) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
  });
  return lines;
}

/** Topic label line height in px (DESIGN.md: 1.1). */
export const topicLineHeight = (fontSize) => Math.round(fontSize * 1.1);

/**
 * The box [x0, y0, x1, y1] of a topic label centered on (cx, cy) px: its wrapped lines
 * (wrapLabel) at `fontSize`, about 0.55em per character, `gap` px clear around it.
 */
export function topicLabelBox(cx, cy, text, fontSize, gap = 2) {
  const lines = wrapLabel(text);
  const w = Math.max(...lines.map((l) => l.length)) * fontSize * 0.55 + 2 * gap;
  const h =
    fontSize * 1.2 + topicLineHeight(fontSize) * (lines.length - 1) + 2 * gap;
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}

// The shift that moves the span [lo, hi] inside [min, max]; centered when it can't fit
const shiftInto = (lo, hi, min, max) =>
  hi - lo > max - min
    ? (min + max) / 2 - (lo + hi) / 2
    : lo < min
      ? min - lo
      : hi > max
        ? max - hi
        : 0;

/**
 * A topic label anchored at (cx, cy) px, kept inside a `width` × `height` plot (#125): the pixel
 * shift {dx, dy} that keeps its wrapped box (topicLabelBox, no gap) `margin` px inside every edge
 * (centered on an axis it can't fit), and the shifted box.
 */
export function fitTopicLabel(
  cx,
  cy,
  text,
  fontSize,
  { width, height, margin = 4 },
) {
  const [x0, y0, x1, y1] = topicLabelBox(cx, cy, text, fontSize, 0);
  const dx = shiftInto(x0, x1, margin, width - margin);
  const dy = shiftInto(y0, y1, margin, height - margin);
  return { dx, dy, box: [x0 + dx, y0 + dy, x1 + dx, y1 + dy] };
}

/**
 * Labels that fit without overlapping, in priority order (pass the largest topics first):
 * each label's box (topicLabelBox: wrapped lines at `fontSize`) is placed with the same
 * linear mapping as the map (domain → [padding, size - padding]) and shifted inside the plot
 * (fitTopicLabel); a label overlapping one already kept is dropped. `{text, x, y}` in data
 * units; each kept label comes back with its pixel shift `dx`, `dy`.
 */
export function cullLabels(
  labels,
  { width, height, xDomain, yDomain, fontSize = 15, padding = 10, gap = 2 },
) {
  const scale =
    ([d0, d1], size) =>
    (v) =>
      padding + ((v - d0) / (d1 - d0 || 1)) * (size - 2 * padding);
  const sx = scale(xDomain, width);
  const sy = scale(yDomain, height);
  const kept = [];
  const boxes = [];
  for (const label of labels) {
    const cx = sx(label.x);
    const cy = height - sy(label.y);
    const { dx, dy } = fitTopicLabel(cx, cy, label.text, fontSize, {
      width,
      height,
    });
    const box = topicLabelBox(cx + dx, cy + dy, label.text, fontSize, gap);
    const overlaps = boxes.some(
      (b) => box[0] < b[2] && b[0] < box[2] && box[1] < b[3] && b[1] < box[3],
    );
    if (overlaps) continue;
    boxes.push(box);
    kept.push({ ...label, dx, dy });
  }
  return kept;
}

const extent = (values) => [Math.min(...values), Math.max(...values)];

/**
 * Explicit scale domains: the extent of `x` and `y` over the rows with both coordinates finite
 * (a row with only one is not drawn, so it must not widen the other axis); none without such rows.
 */
function fixedDomains(data, x, y) {
  const rows = data.filter(
    (d) => Number.isFinite(d[x]) && Number.isFinite(d[y]),
  );
  return rows.length
    ? [
        { domain: extent(rows.map((d) => d[x])) },
        { domain: extent(rows.map((d) => d[y])) },
      ]
    : [{}, {}];
}

/** A tooltip entry: a field name, or {field, title, format} for a readable label/number. */
const tooltipField = (entry) =>
  typeof entry === "string" ? { field: entry } : { ...entry };

// Internal value for the "everything else" bucket; a real category may be called "Other"
const OTHER = "\u0000other";
// Distortion overlay (#84): opacity of its least reliable cells
const OVERLAY_OPACITY = 0.35;

function categoryRange() {
  return [
    token("color-viz-cat-1", "#2a78d6"),
    token("color-viz-cat-2", "#eb6834"),
    token("color-viz-cat-3", "#1baf7a"),
    token("color-viz-cat-other", "#c9c3bb"),
  ];
}

/**
 * Vega-Lite spec for the map. DESIGN.md → Data Visualization:
 * - quantitative color (similarity) uses the sequential ramp;
 * - the legend sits in the top-right corner on `surface` (DESIGN.md → Legend); a ramp is labelled
 *   with `legendLabels` spread evenly over it (e.g. ["0%", "30% (Good)", "60%+"], #184);
 * - categorical color highlights at most 3 `categories` (pass them from the whole program so
 *   filtering never repaints survivors; default: top 3 of `data`), everything else is Other;
 * - points outside the brush are dimmed; with `matches`, so are those not in the `matchIds`
 *   param (keyword matches, #125; null = none dimmed), set with `highlightMatches(ids)`;
 * - with `ringIds`, those papers get a ring (In My Papers) on a layer of their own, so it shows
 *   regardless of color; the ids live in the `mine` param, so pages update them with
 *   `view.signal("mine", ids)` without redrawing (which would lose the brush);
 * - with `labels` ({text, x, y}, most important first), text labels (topic clusters) on top:
 *   ink on a halo of the page background, readable on any point color in both themes;
 *   labels that would overlap a more important one are left out (numeric width/height only);
 * - with `transition` (from planTransition, #82), the points are drawn where they were and a
 *   `tm` param (elapsed ms) tweens them: positions, the scale domains, entering points fading in,
 *   leaving ones fading out and topic labels fading out then back in at their new centers, all
 *   computed by Vega from one signal (no data churn per frame).
 */
export function scatterSpec(
  data,
  {
    x = "x",
    y = "y",
    id = "id",
    color = null,
    colorTitle = color,
    colorType = "nominal",
    colorScheme = null,
    similarityScheme = null,
    categories,
    ringIds = null,
    labels = null,
    labelSize = 15,
    scoreDomain = null,
    colorRange = null,
    legendLabels = null,
    overlay = null,
    size = null,
    sizeRange = [12, 80],
    tooltip = [id],
    width = "container",
    height = 500,
    title,
    transition = null,
    neighbours = false,
    query = false,
    focus = false,
    matches = false,
  } = {},
) {
  const categorical = color && colorType !== "quantitative";
  const highlighted =
    categorical && !colorScheme
      ? (categories ?? topCategories(data, color)).slice(0, 3)
      : null;
  // Size echoing the color field gets its own copy: Vega-Lite merges two legends on one field
  // into a symbol legend, and the color ramp's legend must stay a gradient (DESIGN.md → Legend)
  const sizeCopy = size && size === color;
  const decorate = (d) => ({
    ...d,
    ...(sizeCopy && { __size: d[size] }),
    ...(highlighted && {
      __color: highlighted.includes(d[color]) ? d[color] : OTHER,
    }),
    ...(transition && motionFields(transition.motion.get(d[id]))),
  });
  // Copies whenever fields are added (Vega's formulas write on the objects it is given)
  const values =
    highlighted || transition || sizeCopy
      ? [...data, ...(transition?.exits ?? [])].map(decorate)
      : data;
  const tween = transition && tweenParts(transition, { x, y });
  const palette = categoryRange();
  const colorScale = colorScheme
    ? { scheme: colorScheme }
    : highlighted
      ? {
          domain: [...highlighted, OTHER],
          range: [...palette.slice(0, highlighted.length), palette[3]],
        }
      : {
          // #166: a Vega scheme chosen in Options, else the oxblood ramp (or the caller's range)
          ...(colorRange
            ? { range: colorRange }
            : similarityColorScale(similarityScheme)),
          // A fixed domain (#184: lib/similarityScheme.js SIMILARITY_DOMAIN), clamped, so a
          // color means the same score in every search, filter and level
          ...(scoreDomain && { domain: scoreDomain, clamp: true }),
        };

  const visible = {
    and: [
      { param: "drag", empty: true },
      "levelCut == null || datum.score >= levelCut",
      // Nearest neighbours shown (#102): only the paper and its neighbours keep their color
      ...(neighbours
        ? [
            `length(nnIds) == 0 || indexof(nnIds, datum[${JSON.stringify(id)}]) >= 0`,
          ]
        : []),
      // Keyword matches (#125): only they keep their color; null = no keyword search
      ...(matches
        ? [
            `matchIds == null || indexof(matchIds, datum[${JSON.stringify(id)}]) >= 0`,
          ]
        : []),
    ],
  };
  // The relevance level, updated by pages with view.signal("levelCut", …) (no redraw)
  const levelCut = { name: "levelCut", value: null };
  // The keyword matches' ids (#125), updated with highlightMatches (no redraw)
  const matchParams = matches ? [{ name: "matchIds", value: null }] : [];
  // nice: false + padding in pixels, so cullLabels can mirror the scales exactly
  const scale = { zero: false, nice: false, padding: 10 };
  // Explicit domains (#112): the points' extent, or the tween's eased one. Every layer shares
  // the x/y scales, so data-driven domains would union all of them, and the neighbour layers'
  // dataset is usually empty (Vega then warns "Infinite extent" on each render). The other
  // layers (rings, topic labels, overlay cells) all sit inside the points' extent anyway.
  // The query marker (#100) sits inside it too (an average of drawn positions); its halo is clipped.
  const [xFixed, yFixed] = fixedDomains(data, x, y);
  const xScale = { ...scale, ...(tween?.xScale ?? xFixed) };
  const yScale = { ...scale, ...(tween?.yScale ?? yFixed) };
  const position = {
    x: { field: x, type: "quantitative", axis: null, scale: xScale },
    y: { field: y, type: "quantitative", axis: null, scale: yScale },
  };
  const points = {
    // Mid-motion, leaving points can sit outside the new extent: clip them so the chart
    // keeps its size (autosize would grow it)
    mark: {
      type: "point",
      filled: true,
      opacity: 0.75,
      ...(tween && { clip: true }),
    },
    params: [
      { name: "drag", select: { type: "interval", encodings: ["x", "y"] } },
      { name: "click", select: { type: "point", fields: [id], on: "click" } },
    ],
    encoding: {
      ...position,
      // Outside the brush or below the relevance level (levelCut): viz-dim (DESIGN.md)
      color: {
        condition: color
          ? {
              test: visible,
              field: highlighted ? "__color" : color,
              type: highlighted ? "nominal" : colorType,
              title: colorTitle,
              scale: colorScale,
              // Size echoing a labelled ramp: the widget draws one tapered legend for both (#130)
              legend: taperedLegend({
                color,
                colorType,
                colorScheme,
                size,
                legendLabels,
                scoreDomain,
              })
                ? null
                : legendFor({
                    data,
                    color,
                    quantitative: colorType === "quantitative",
                    scoreDomain,
                    legendLabels,
                    highlighted,
                  }),
            }
          : { test: visible, value: token("color-viz-neutral", "#605954") },
        value: token("color-viz-dim", "#e1ddd8"),
      },
      ...(size && {
        size: {
          // Papers below the relevance level are context (viz-dim): the smallest dot, as when
          // the domain started at the level cut (#184 review)
          ...(sizeCopy &&
            scoreDomain && {
              condition: {
                test: "levelCut != null && datum.score < levelCut",
                value: sizeRange[0],
              },
            }),
          field: sizeCopy ? "__size" : size,
          type: "quantitative",
          scale: {
            range: sizeRange,
            // Echoing the ramp, size spans the same fixed domain (#130, #184). Otherwise it is
            // fixed while leaving points are still in the data (#82)
            ...(sizeCopy && scoreDomain
              ? { domain: scoreDomain, clamp: true }
              : transition &&
                data.length && {
                  domain: extent(data.map((d) => d[size])),
                  clamp: true,
                }),
          },
          legend: null,
        },
      }),
      ...(tween && { opacity: tween.opacity("__op") }),
      tooltip: tooltip ? tooltip.map(tooltipField) : null,
    },
  };
  const rings = ringIds && {
    transform: [
      {
        filter: `indexof(mine, datum.${id}) >= 0${tween ? " && !datum.__out" : ""}`,
      },
    ],
    mark: {
      type: "point",
      ...(tween && { clip: true }),
      filled: false,
      size: 110,
      strokeWidth: 1.5,
      color: token("color-viz-followed-ring", "#241e1a"),
    },
    encoding: {
      ...position,
      ...(tween && { opacity: tween.opacity("__o") }),
      tooltip: tooltip ? tooltip.map(tooltipField) : null,
    },
  };

  const shown = visibleLabels(data, labels, { x, y, width, height, labelSize });
  // Each topic label as its wrapped lines (wrapLabel) and their count, which centers the block
  const lineRows = (l) => {
    const lines = wrapLabel(l.text);
    return {
      text: l.text,
      lines,
      n: lines.length,
      // Shifted inside the plot near its edges (fitTopicLabel, #125)
      __dx: l.dx ?? 0,
      __dy: l.dy ?? 0,
    };
  };
  const labelRows = [
    ...(shown ?? []).map((l) => ({
      ...lineRows(l),
      [x]: l.x,
      [y]: l.y,
      ...(transition && { __old: 0, __s: transition.stageStart(l.cluster) }),
    })),
    ...(transition && shown?.length ? transition.fromLabels : []).map((l) => ({
      ...lineRows(l),
      [x]: l.x,
      [y]: l.y,
      __old: 1,
      __s: 0,
    })),
  ];
  const text = (mark) => ({
    data: { values: labelRows },
    ...(tween && { transform: tween.labelTransform }),
    // DESIGN.md: Newsreader medium, centered lines; Vega draws the first line at y and the
    // rest below it, so each label moves up by half its extra lines (and by its shift inside
    // the plot, #125)
    mark: {
      type: "text",
      fontSize: labelSize,
      fontWeight: 500,
      font: token("font-serif", "serif"),
      lineHeight: topicLineHeight(labelSize),
      dx: { expr: "datum.__dx" },
      dy: {
        expr: `datum.__dy - (datum.n - 1) * ${topicLineHeight(labelSize) / 2}`,
      },
      ...mark,
    },
    encoding: {
      ...position,
      text: { field: "lines" },
      ...(tween && { opacity: tween.opacity("__lo") }),
      tooltip: null,
    },
  });
  const background = token("color-background", "#fcf9f3");
  const textLayers = shown?.length
    ? [
        text({
          fill: background,
          stroke: background,
          strokeWidth: 4,
          strokeJoin: "round",
          strokeOpacity: 0.9,
        }),
        text({ fill: token("color-on-surface", "#241e1a") }),
      ]
    : [];
  // Distortion overlay (#84): cells {x, x2, y, y2, distortion} inside the points' extent (so
  // the scales don't change), behind the points, never under the pointer. The cells describe
  // the final layout, so during a tween they stay out and fade in as the motion settles.
  const shade = overlay?.length && {
    data: { values: overlay },
    ...(tween && { transform: tween.overlayTransform }),
    mark: {
      type: "rect",
      interactive: false,
      clip: true,
      fill: token("color-viz-reliability-3", "#28377a"),
    },
    encoding: {
      ...position,
      x2: { field: "x2" },
      y2: { field: "y2" },
      opacity: tween
        ? tween.opacity("__so")
        : {
            field: "distortion",
            type: "quantitative",
            scale: { domain: [0, 1], range: [0, OVERLAY_OPACITY] },
            legend: null,
          },
      tooltip: null,
    },
  };
  const nn = neighbours
    ? neighbourLayers({ xScale, yScale, tween, transition })
    : null;
  const q = query ? queryLayers({ xScale, yScale, tween, transition }) : null;
  const f = focus ? focusLayers({ xScale, yScale, tween, transition }) : null;
  const layers = [
    ...(shade ? [shade] : []),
    // #167: the search area and "★ Your search" sit under the points
    ...(q ? q.under : []),
    points,
    ...(q ? q.over : []),
    // Under the neighbour preview and the query marker, which stay on top (DESIGN.md)
    ...(f ?? []),
    ...(nn ? nn.below : []),
    ...(rings ? [rings] : []),
    ...textLayers,
    ...(nn ? nn.above : []),
    ...(q ? q.top : []),
  ];

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    width,
    height,
    title,
    data: { values },
    ...((nn || q || f) && {
      datasets: {
        ...(nn && { [NEIGHBOURS_DATA]: [] }),
        ...(q && { [QUERY_DATA]: [] }),
        ...(f && { [FOCUS_DATA]: [] }),
      },
    }),
    ...(tween && { transform: tween.transform }),
    ...(layers.length > 1
      ? {
          params: [
            ...(rings ? [{ name: "mine", value: ringIds }] : []),
            ...(nn ? [{ name: "nnIds", value: [] }] : []),
            ...(q ? [{ name: "queryHover", value: -1 }] : []),
            levelCut,
            ...matchParams,
            ...(tween?.params ?? []),
          ],
          layer: layers,
        }
      : {
          ...points,
          params: [
            ...points.params,
            levelCut,
            ...matchParams,
            ...(tween?.params ?? []),
          ],
        }),
    // Transparent so the page's paper shows through (Vega defaults to white)
    // and the title/legend take the page's ink and sans font (both themes).
    config: {
      // SVG marks would otherwise read every point's raw x/y to screen readers (#134); the list
      // and the aria-live lines by the map are the accessible path
      aria: false,
      background: "transparent",
      view: { stroke: null },
      font: token("font-sans", "sans-serif"),
      title: { color: token("color-on-surface", "#241e1a"), fontWeight: 500 },
      // DESIGN.md → Legend: always visible in a corner on `surface`
      legend: {
        orient: "top-right",
        offset: 8,
        padding: 8,
        cornerRadius: parseFloat(token("rounded-md", "6px")) || 6,
        fillColor: token("color-surface", "#fffdfa"),
        strokeColor: token("color-outline", "#d8d3cc"),
        titleColor: token("color-on-surface", "#241e1a"),
        titleFontWeight: 500,
        labelColor: token("color-on-surface-muted", "#605954"),
        labelLimit: 160,
        symbolOpacity: 1,
      },
    },
  };
}

// Named dataset of the neighbour marks (#102), replaced with view.change (no redraw)
const NEIGHBOURS_DATA = "nn";
// Named dataset of the query marker (#100), replaced with view.change (no redraw)
const QUERY_DATA = "query";
// Named dataset of the paper in focus in the list (#136), replaced with view.change (no redraw)
const FOCUS_DATA = "focus";
// How far (px) the search area may reach past the chart's box, into the page's margins (#181):
// Explore's column gap (style.css .explore-layout, 24px), so it stops at the list
const AREA_BLEED = 24;
// Its fade at the layer's border (style.css .query-area --fade): the layer reaches this far
// above and below the chart, so the fade starts outside the plot (#181 review)
const AREA_FADE = 16;

/**
 * Where `el`'s ancestors and the window let a layer in it show, as bleedBox limits (viewport
 * px): each ancestor that clips or scrolls limits it sideways to its padding box and, when it
 * clips vertically too, to its content's height (it scrolls that way); the window sideways.
 */
function clippingBoxes(el) {
  const limits = [
    [0, -Infinity, document.documentElement.clientWidth || Infinity, Infinity],
  ];
  for (
    let a = el.parentElement;
    a && a !== document.body;
    a = a.parentElement
  ) {
    const { overflowX, overflowY } = getComputedStyle(a);
    if (overflowX === "visible" && overflowY === "visible") continue;
    const r = a.getBoundingClientRect();
    const x0 = r.left + a.clientLeft;
    const y0 = r.top + a.clientTop - a.scrollTop;
    limits.push([
      x0,
      overflowY === "visible" ? -Infinity : y0,
      x0 + a.clientWidth,
      overflowY === "visible" ? Infinity : y0 + a.scrollHeight,
    ]);
  }
  return limits;
}
// Opacity of a query marker placed among barely similar papers (heavy filters)
const FAINT_OPACITY = 0.4;

/**
 * Opacity for marks that describe the final layout: as given, or mid-motion (#82) hidden and
 * fading in over the last 15% of the motion.
 */
const settleFade = (tween, transition) => (opacity) =>
  tween
    ? {
        expr: `${opacity} * clamp((tm - ${0.85 * transition.total}) / ${0.15 * transition.total}, 0, 1)`,
      }
    : opacity;

/**
 * Query marker marks (#100, #167), all from the `query` dataset (rows from queryRows: kind
 * "line" or "marker", `m` = marker index), never under the pointer (the widget shows their
 * tooltip itself). The search area is not here: it is one SVG path per marker behind the map
 * (drawQueryArea), so it costs nothing per frame.
 * - `under` the points, quiet: a small primary ★ where the query lands;
 * - `over` the points, only while the pointer is on marker `queryHover`: thin lines from it to
 *   its nearest papers (transient, so they must read);
 * - on `top` of everything, topic labels included: its name ("Your search") in primary on a
 *   background halo, so it is never hidden.
 * Mid-motion they stay hidden and fade in as the motion settles, like the neighbour marks.
 */
function queryLayers({ xScale, yScale, tween, transition }) {
  const fade = settleFade(tween, transition);
  const position = {
    x: { field: "x", type: "quantitative", axis: null, scale: xScale },
    y: { field: "y", type: "quantitative", axis: null, scale: yScale },
  };
  // Marks with `opacity: faded`: full, or FAINT_OPACITY when few similar papers are visible
  // (datum.faint, lib/placeQuery.js); both fade in after a motion
  const faded = (full = 1) => ({
    condition: { test: "datum.faint", value: fade(full * FAINT_OPACITY) },
    value: fade(full),
  });
  const layer = (filter, mark, encoding = {}) => ({
    data: { name: QUERY_DATA },
    transform: [{ filter }],
    mark: { interactive: false, clip: true, ...mark },
    encoding: { tooltip: null, ...position, ...encoding },
  });
  const primary = token("color-primary", "#903129");
  const background = token("color-background", "#fcf9f3");
  const text = (mark, encoding) =>
    layer(
      "datum.kind === 'marker'",
      {
        type: "text",
        font: token("font-sans", "sans-serif"),
        ...mark,
      },
      { opacity: faded(), ...encoding },
    );
  // At (nameX, nameY): the free side of the ★ (lib/placeQuery.js nameSpot, #172 re-review)
  const name = (mark) =>
    text(
      { fontSize: 11, fontWeight: 600, baseline: "middle", ...mark },
      {
        text: { field: "name" },
        x: { ...position.x, field: "nameX" },
        y: { ...position.y, field: "nameY" },
      },
    );
  return {
    under: [
      text(
        { fontSize: 13, baseline: "middle", fill: primary },
        { text: { value: "★" } },
      ),
    ],
    // Above everything, topic labels included, so it is never hidden (#167 review)
    top: [
      name({
        fill: background,
        stroke: background,
        strokeWidth: 3,
        strokeJoin: "round",
      }),
      name({ fill: primary }),
    ],
    over: [
      layer(
        "datum.kind === 'line' && datum.m === queryHover",
        { type: "rule", strokeWidth: 1, color: primary, opacity: fade(0.6) },
        { x2: { field: "x2" }, y2: { field: "y2" } },
      ),
    ],
  };
}

/**
 * Rows for the `query` dataset from queryMarkers (lib/placeQuery.js): per marker, lines to its
 * nearest papers and the marker itself (`name` = its label without the star, drawn apart).
 */
export function queryRows(markers) {
  const lines = [];
  const marks = [];
  markers.forEach((m, i) => {
    for (const n of m.nearest)
      lines.push({ kind: "line", m: i, x: m.x, y: m.y, x2: n.x, y2: n.y });
    marks.push({
      kind: "marker",
      m: i,
      x: m.x,
      y: m.y,
      label: m.label,
      name: m.label.replace(/^★\s*/, ""),
      nameX: m.nameX ?? m.x,
      nameY: m.nameY ?? m.y,
      faint: Boolean(m.faint),
    });
  });
  return [...lines, ...marks];
}

/**
 * The search areas (#167) as one SVG path per marker in `layer` (an <svg> laid behind the map's
 * marks), in plot pixels at the final scales: `areas[i]` = matchArea(...) or null. `toPixel`
 * maps data units to the layer's pixels.
 */
function drawQueryArea(layer, areas, markers, toPixel) {
  layer.replaceChildren();
  areas.forEach((area, i) => {
    if (!area?.polygons.length) return;
    const d = area.polygons
      .flatMap((polygon) =>
        polygon.map(
          (ring) =>
            "M" +
            ring
              .map((p) =>
                toPixel(p)
                  .map((v) => v.toFixed(1))
                  .join(","),
              )
              .join("L") +
            "Z",
        ),
      )
      .join("");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill-rule", "evenodd");
    path.setAttribute("class", "query-area-path");
    if (markers[i]?.faint) path.setAttribute("data-faint", "");
    layer.append(path);
  });
}

/** The map tooltip of a query marker: what it is, that it is approximate, its nearest papers. */
export function queryTooltip(marker, { nearest = 3 } = {}) {
  // One row per paper: the tooltip clamps each value to a few lines
  const keys = ["Nearest", "2nd nearest", "3rd nearest"];
  return {
    [marker.label.replace(/^★\s*/, "")]: marker.text,
    Position: `approximate (from its ${marker.nearest.length} most similar papers)${marker.faint ? " (few similar papers visible)" : ""}`,
    ...Object.fromEntries(
      marker.nearest
        .slice(0, Math.min(nearest, keys.length))
        .map((d, i) => [
          keys[i],
          `${d.title} (${Math.round(d.similarity * 100)}%)`,
        ]),
    ),
  };
}

/**
 * Nearest-neighbour marks (#102), all from the `nn` dataset (rows {kind, fx, fy, nx, ny, label}:
 * the focus paper at fx/fy, the other paper at nx/ny) and never under the pointer:
 * - lines from the paper to each true neighbour, ink; dashed for a **missing** neighbour (far on
 *   the map), so the difference never rests on color alone;
 * - a thick ink ring on the paper, a dotted muted ring on each **false** neighbour (close on the
 *   map, not similar);
 * - each neighbour's similarity as a small label on a background halo.
 * Mid-motion (#82) the rows describe the final layout, so they stay hidden and fade in as the
 * motion settles.
 */
function neighbourLayers({ xScale, yScale, tween, transition }) {
  const fade = settleFade(tween, transition);
  const at = (xf, yf) => ({
    x: { field: xf, type: "quantitative", axis: null, scale: xScale },
    y: { field: yf, type: "quantitative", axis: null, scale: yScale },
  });
  const layer = (kinds, mark, encoding) => ({
    data: { name: NEIGHBOURS_DATA },
    transform: [{ filter: { field: "kind", oneOf: kinds } }],
    mark: { interactive: false, clip: true, ...mark },
    encoding: { tooltip: null, ...encoding },
  });
  const ink = token("color-on-surface", "#241e1a");
  const muted = token("color-on-surface-muted", "#605954");
  const background = token("color-background", "#fcf9f3");
  const label = (mark) =>
    layer(
      ["preserved", "missing"],
      {
        type: "text",
        dy: -9,
        fontSize: 10,
        font: token("font-sans", "sans-serif"),
        opacity: fade(1),
        ...mark,
      },
      { ...at("nx", "ny"), text: { field: "label" } },
    );
  return {
    below: [
      layer(
        ["preserved", "missing"],
        { type: "rule", strokeWidth: 1, color: ink, opacity: fade(0.55) },
        {
          ...at("fx", "fy"),
          x2: { field: "nx" },
          y2: { field: "ny" },
          strokeDash: {
            condition: { test: "datum.kind === 'missing'", value: [4, 3] },
            value: [1, 0],
          },
        },
      ),
      layer(
        ["false"],
        {
          type: "point",
          filled: false,
          size: 170,
          strokeWidth: 1.25,
          strokeDash: [2, 2],
          color: muted,
          opacity: fade(1),
        },
        at("nx", "ny"),
      ),
      layer(
        ["focus"],
        {
          type: "point",
          filled: false,
          size: 220,
          strokeWidth: 2.5,
          color: ink,
          opacity: fade(1),
        },
        at("nx", "ny"),
      ),
    ],
    above: [
      label({
        fill: background,
        stroke: background,
        strokeWidth: 3,
        strokeJoin: "round",
      }),
      label({ fill: muted }),
    ],
  };
}

/**
 * The paper in focus in the list (#136, brushing and linking): a ring in ink around its dot on a
 * background halo, above the points but under the neighbour preview and the query marker, from the `focus` dataset ({x, y}, at most one row).
 * Hidden mid-motion and faded in as it settles, like the neighbour marks.
 */
function focusLayers({ xScale, yScale, tween, transition }) {
  const fade = settleFade(tween, transition);
  const ring = (mark) => ({
    data: { name: FOCUS_DATA },
    mark: {
      type: "point",
      shape: "circle",
      filled: false,
      size: FOCUS_RING_SIZE,
      interactive: false,
      clip: true,
      opacity: fade(1),
      ...mark,
    },
    encoding: {
      x: { field: "x", type: "quantitative", axis: null, scale: xScale },
      y: { field: "y", type: "quantitative", axis: null, scale: yScale },
      tooltip: null,
    },
  });
  return [
    ring({ color: token("color-background", "#fcf9f3"), strokeWidth: 5 }),
    ring({ color: token("color-on-surface", "#241e1a"), strokeWidth: 2 }),
  ];
}

/** Area (px²) of the focus ring: just outside the largest dot (240 px², DESIGN.md → Size). */
export const FOCUS_RING_SIZE = 420;

/**
 * Rows for the `nn` dataset from a classification (lib/neighbours.js classifyNeighbours):
 * `position(id)` is where a paper is drawn.
 */
export function neighbourRows(
  focus,
  { neighbours, falseNeighbours },
  position,
) {
  const [fx, fy] = position(focus);
  const row = (kind, id, label = null) => {
    const [nx, ny] = position(id);
    return { kind, fx, fy, nx, ny, label };
  };
  return [
    row("focus", focus),
    ...neighbours.map((d) =>
      row(
        d.missing ? "missing" : "preserved",
        d.id,
        `${Math.round(d.similarity * 100)}%`,
      ),
    ),
    ...falseNeighbours.map((id) => row("false", id)),
  ];
}

/**
 * Whether the map draws the tapered similarity legend (#130) instead of Vega's gradient: size
 * echoes the quantitative color field and the ramp is labelled (`legendLabels`, spread evenly).
 */
export function taperedLegend({
  color,
  colorType,
  colorScheme,
  size,
  legendLabels,
  scoreDomain,
} = {}) {
  // Needs a real domain (lo < hi): the similarity map's is fixed (#184); other callers pass theirs
  return Boolean(
    color &&
    size === color &&
    colorType === "quantitative" &&
    !colorScheme &&
    legendLabels &&
    scoreDomain?.[1] > scoreDomain?.[0],
  );
}

// The corner the last similarity legend chose (#168 review): a redrawn map (filters, projection)
// keeps it unless another corner is clearly quieter
let lastLegendCorner = null;

/**
 * The tapered legend (#130), built from the view's own color and size scales so the bar is
 * exactly what the dots show. Drawn in the map's background (#168): inserted before the marks,
 * which stack above it, so the points are drawn over it, in the plot corner it covers the least
 * (lib/quietCorner.js): `points()` ([x, y] data rows) and `obstacles(sx, sy)` (topic-label and
 * search-area boxes in plot pixels); it keeps its corner unless another is clearly quieter.
 * `box()` is its rectangle in overlay pixels (for the paper labels), or null.
 */
function attachTaperedLegend(
  target,
  view,
  { title, labels, points = () => [], obstacles = () => [] },
) {
  const color = view.scale("color");
  const size = view.scale("size");
  const [d0, d1] = color?.domain?.() ?? [];
  if (!size || !(d1 > d0)) return { box: () => null };
  const at = (t) => d0 + t * (d1 - d0);
  const el = similarityLegend({
    title,
    labels,
    colorAt: (t) => color(at(t)),
    diameterAt: (t) => diameterOf(size(at(t))),
  });
  Object.assign(el.style, { position: "absolute", pointerEvents: "none" });
  let rect = null;
  const place = () => {
    const surface = target.querySelector(".marks");
    if (!surface || !target.isConnected) return false;
    const parent = surface.parentElement;
    if (getComputedStyle(parent).position === "static")
      parent.style.position = "relative";
    // Positioned too, so it paints after (over) the legend that precedes it
    if (getComputedStyle(surface).position === "static")
      surface.style.position = "relative";
    if (el.nextElementSibling !== surface) parent.insertBefore(el, surface);
    const [ox, oy] = view.origin();
    const sx = view.scale("x");
    const sy = view.scale("y");
    const spot = quietCorner(
      points().map(([px, py]) => [sx(px), sy(py)]),
      {
        width: view.width(),
        height: view.height(),
        box: [el.offsetWidth, el.offsetHeight],
        obstacles: obstacles(sx, sy),
        // Stays put unless another corner is clearly quieter (also across redraws)
        current: el.dataset.corner ?? lastLegendCorner,
      },
    );
    el.dataset.corner = lastLegendCorner = spot.corner;
    const left = ox + spot.left;
    const top = oy + spot.top;
    const [dx, dy] = surfaceOffset(surface);
    el.style.left = `${dx + left}px`;
    el.style.top = `${dy + top}px`;
    rect = [left, top, left + el.offsetWidth, top + el.offsetHeight];
    return true;
  };
  // Placed once the map is on the page (and again if the view resizes)
  let tries = 0;
  const retry = () => place() || (++tries < 120 && nextFrame(retry));
  retry();
  view.addResizeListener?.(place);
  // Its width depends on the self-hosted font: measure again once fonts are in
  document.fonts?.ready.then(place);
  return { el, box: () => rect, place };
}

/**
 * The color legend: a ramp labelled with `legendLabels` spread evenly over it (fixed ticks,
 * #184; the tooltip has the exact score), or the 3 + Other categories.
 */
function legendFor({
  data,
  color,
  quantitative,
  scoreDomain,
  legendLabels,
  highlighted,
}) {
  if (quantitative) {
    const ends =
      scoreDomain ??
      extent(data.map((d) => d[color]).filter((v) => Number.isFinite(v)));
    // The labels spread evenly over the domain (#184: fixed ticks, e.g. 0% · 30% · 60%+)
    const n = legendLabels?.length ?? 0;
    return n > 1 && ends.every(Number.isFinite) && ends[0] < ends[1]
      ? {
          type: "gradient",
          direction: "horizontal",
          gradientLength: 120,
          values: legendLabels.map((_, i) => {
            const t = i / (n - 1);
            return ends[0] * (1 - t) + ends[1] * t;
          }),
          labelExpr: `${JSON.stringify(legendLabels)}[datum.index]`,
        }
      : { type: "gradient", direction: "horizontal", gradientLength: 120 };
  }
  return highlighted
    ? {
        labelExpr: `datum.value === ${JSON.stringify(OTHER)} ? "Other" : datum.label`,
      }
    : {};
}

/** Topic labels that fit (cullLabels) at the scales `data` gets, or `labels` as given. */
export function visibleLabels(
  data,
  labels,
  { x = "x", y = "y", width, height, labelSize = 15 },
) {
  return labels?.length && typeof width === "number" && data.length
    ? cullLabels(labels, {
        width,
        height,
        xDomain: extent(data.map((d) => d[x])),
        yDomain: extent(data.map((d) => d[y])),
        fontSize: labelSize,
      })
    : labels;
}

/** The per-point fields the tween formulas read (see tweenParts). */
const motionFields = (m) =>
  m && {
    __x0: m.x0,
    __y0: m.y0,
    __x1: m.x1,
    __y1: m.y1,
    __s: m.start,
    __in: m.enter,
    __out: m.exit,
  };

/**
 * Vega-Lite pieces of the tween (#82), all driven by the `tm` param (elapsed ms): each point's
 * eased progress within its stage moves it from (__x0, __y0) to (__x1, __y1) and fades it in
 * (entering) or out (leaving, then filtered out at the end); the domains ease from the old
 * extent to the new one; old topic labels fade out in the first quarter of a stage and new ones
 * fade in during the last quarter of their topic's stage.
 */
function tweenParts({ duration: D, total: T, xDomain, yDomain }, { x, y }) {
  const domain = ([from, to], i) => ({
    expr: `${from[i]} + (${to[i] - from[i]}) * ${easeExpr(`clamp(tm / ${T}, 0, 1)`)}`,
  });
  // A whole explicit domain (not domainMin/domainMax, which still compute the data extent)
  const axis = (d) => ({ domain: [domain(d, 0), domain(d, 1)] });
  return {
    params: [{ name: "tm", value: 0 }],
    transform: [
      { calculate: `clamp((tm - datum.__s) / ${D}, 0, 1)`, as: "__p" },
      { calculate: easeExpr("datum.__p"), as: "__e" },
      {
        calculate: "datum.__x0 + (datum.__x1 - datum.__x0) * datum.__e",
        as: x,
      },
      {
        calculate: "datum.__y0 + (datum.__y1 - datum.__y0) * datum.__e",
        as: y,
      },
      {
        calculate: "datum.__out ? 1 - datum.__e : datum.__in ? datum.__e : 1",
        as: "__o",
      },
      { calculate: "0.75 * datum.__o", as: "__op" },
      { filter: `!(datum.__out && tm >= ${T})` },
    ],
    xScale: axis(xDomain),
    yScale: axis(yDomain),
    opacity: (field) => ({
      field,
      type: "quantitative",
      scale: null,
      legend: null,
    }),
    // Distortion overlay (#84): absent until the last quarter of the motion, then fading in
    overlayTransform: [
      { filter: `tm >= ${0.75 * T}` },
      {
        calculate: `datum.distortion * ${OVERLAY_OPACITY} * clamp((tm - ${0.75 * T}) / ${0.25 * T}, 0, 1)`,
        as: "__so",
      },
    ],
    // Labels are in the data only while visible: off-plot text would grow the chart (autosize)
    labelTransform: [
      { filter: `datum.__old ? tm < ${D / 4} : tm >= datum.__s + ${0.75 * D}` },
      {
        calculate: `datum.__old ? clamp(1 - tm / ${D / 4}, 0, 1) : clamp((tm - datum.__s - ${0.75 * D}) / ${D / 4}, 0, 1)`,
        as: "__lo",
      },
    ],
  };
}

/**
 * Widget value from the chart's selections: `brushed` = points in the interval brush (all
 * without one), `clicked` = the clicked points. A click never changes `brushed`, so the page
 * decides what a click does (e.g. scroll to that paper) without a hidden mode.
 */
export function selectionFromChart(
  { drag, click } = {},
  data,
  { x = "x", y = "y", id = "id" } = {},
) {
  const ids = click?.[id];
  return {
    brushed: brushFilter(data, drag, { x, y }),
    clicked: ids ? data.filter((d) => ids.includes(d[id])) : [],
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

/**
 * Brushable scatterplot reactive widget, ported from @john-guerra/brushable-scatterplot.
 * `.value = {brushed, clicked}`: brushed points (all when no brush) and clicked points.
 *
 * Redrawing with a new widget can animate from the old one (#82): pass `from` (the previous
 * widget, or its `snapshot()`) and `animate` ({duration, stageOf}: ms per stage and an optional
 * grouping, e.g. topic, to stage the motion by), and points move from where they were drawn;
 * `brush` ({x: [lo, hi], y: [lo, hi]} in data units, e.g. the previous widget's `brush()`)
 * restores a region selection. `finished` resolves when the motion ends.
 */
export async function BrushableScatterPlot(data, options = {}) {
  const {
    x = "x",
    y = "y",
    id = "id",
    // SVG, not canvas (#134): canvas text gets no font hinting, so the serif topic labels came
    // out heavier and blurrier than the SVG paper labels beside them; 60 fps either way
    renderer = "svg",
    tooltip = [id],
    from = null,
    animate = null,
    brush = null,
  } = options;
  const previous =
    typeof from?.snapshot === "function" ? from.snapshot() : from;
  const transition =
    animate &&
    planTransition(data, previous, {
      x,
      y,
      id,
      duration: animate.duration,
      stageOf: animate.stageOf,
    });
  // The tooltip follows the nearest point (attached below), not only exact hits on a dot
  const chart = await vegaSelected(
    scatterSpec(data, { ...options, transition, tooltip: null }),
    {
      vegaConfig: { renderer, actions: false },
    },
  );
  const target = document.createElement("div");
  target.className = "brushable-scatterplot";
  target.append(chart);
  target.view = chart.view;
  // Visual only (#134): with SVG marks screen readers would walk every point; the list and the
  // aria-live lines by the map are the accessible path (a canvas exposed nothing either)
  chart.querySelector("svg.marks")?.setAttribute("aria-hidden", "true");
  const tapered = taperedLegend(options)
    ? attachTaperedLegend(target, chart.view, {
        title: options.colorTitle ?? options.color,
        labels: options.legendLabels,
        points: () =>
          data
            .filter((d) => Number.isFinite(d[x]) && Number.isFinite(d[y]))
            .map((d) => [d[x], d[y]]),
        // Topic labels (their wrapped boxes) and the search areas also occupy a corner
        obstacles: (sx, sy) => [
          ...(
            visibleLabels(data, options.labels, {
              x,
              y,
              width: options.width,
              height: options.height,
              labelSize: options.labelSize ?? 15,
            }) ?? []
          ).map((l) =>
            topicLabelBox(
              sx(l.x) + (l.dx ?? 0),
              sy(l.y) + (l.dy ?? 0),
              l.text,
              options.labelSize ?? 15,
              3,
            ),
          ),
          ...(target.queryAreaBoxes?.(sx, sy) ?? []),
        ],
      })
    : null;

  // Restore the region selection (pixels from data units at the scales now in effect)
  if (brush?.x && brush?.y) {
    const px = brush.x.map(chart.view.scale("x")).sort((a, b) => a - b);
    const py = brush.y.map(chart.view.scale("y")).sort((a, b) => a - b);
    await chart.view.signal("drag_x_1", px).signal("drag_y_1", py).runAsync();
  }
  let value = selectionFromChart(chart.value, data, { x, y, id });

  // Touch brushing (#85): Vega gives pointerdown the item under the last pointermove, and
  // Vega-Lite's brush only starts on a pointerdown with an item (inScope(event.item)). A mouse
  // always hovers first; a finger doesn't, so the brush ignored touches. Hover first: a
  // pointermove at the touch point, sent (capture phase) before Vega sees the pointerdown.
  target.addEventListener(
    "pointerdown",
    (event) => {
      if (event.pointerType === "mouse") return;
      const { clientX, clientY, pointerId, pointerType } = event;
      const Pointer = globalThis.PointerEvent ?? MouseEvent;
      const hover = new Pointer("pointermove", {
        bubbles: true,
        clientX,
        clientY,
        pointerId,
        pointerType,
      });
      event.target.dispatchEvent(hover);
    },
    { capture: true },
  );

  // vega-selected emits input on any signal change (e.g. levelCut, mine): forward only real
  // selection changes, or pages that set those signals from the map's value would loop.
  // Keyed by the selected ids, not the brush extent: while the scales move (#82), Vega maps the
  // brush to pixels and back every frame, and the rounding noise would look like a new brush.
  const selectionKey = (selection) =>
    JSON.stringify([
      selection.brushed.length === data.length
        ? null
        : selection.brushed.map((d) => d[id]),
      selection.clicked.map((d) => d[id]),
    ]);
  let lastKey = selectionKey(value);
  chart.addEventListener("input", (event) => {
    event.stopPropagation();
    const next = selectionFromChart(chart.value, data, { x, y, id });
    const key = selectionKey(next);
    if (key === lastKey) return;
    lastKey = key;
    value = next;
    target.dispatchEvent(new Event("input", { bubbles: true }));
  });

  /** The region selection in data units, or null. */
  target.brush = () => {
    const drag = chart.value?.drag;
    return drag?.[x] && drag?.[y] ? { x: [...drag[x]], y: [...drag[y]] } : null;
  };

  // The tween: one signal update per frame; Vega recomputes positions and opacities
  let tm = transition ? 0 : Infinity;
  let frame = null;
  let resolveFinished;
  target.finished = new Promise((resolve) => (resolveFinished = resolve));
  const frameTimes = [];
  const settle = () => {
    frame = null;
    resolveFinished(target.animationStats ?? null);
  };
  /** Stops the motion where it is (the next widget animates from there). */
  target.stop = () => {
    if (frame != null) cancelFrame(frame);
    settle();
  };
  /** Jumps to the end of the motion. */
  target.finish = async () => {
    if (!transition || tm >= transition.total) return;
    if (frame != null) cancelFrame(frame);
    tm = transition.total;
    await chart.view.signal("tm", tm).runAsync();
    settle();
  };
  if (transition) {
    let start = null;
    let last = null;
    const tick = (now) => {
      start ??= now;
      if (last != null) frameTimes.push(now - last);
      last = now;
      tm = Math.min(now - start, transition.total);
      chart.view.signal("tm", tm).runAsync();
      if (tm < transition.total) frame = nextFrame(tick);
      else {
        // Frame-to-frame times, for checking the 60 fps target (#82)
        const n = frameTimes.length;
        target.animationStats = n
          ? {
              frames: n,
              meanMs: frameTimes.reduce((a, b) => a + b, 0) / n,
              maxMs: Math.max(...frameTimes),
            }
          : null;
        settle();
      }
    };
    frame = nextFrame(tick);
  } else settle();

  // Where each point is drawn now (mid-motion: between its old and new position)
  const drawnAt = (d) =>
    transition && tm < transition.total
      ? positionAt(transition.motion.get(d[id]), tm, transition.duration)
      : [d[x], d[y]];

  /** What is on screen, for the next widget to animate from (stops the motion). */
  target.snapshot = () => {
    target.stop();
    const domains =
      transition && tm < transition.total
        ? [
            domainAt(transition.xDomain, tm, transition.total),
            domainAt(transition.yDomain, tm, transition.total),
          ]
        : // The data extent (the scales' own domains include the pixel padding)
          [extent(data.map((d) => d[x])), extent(data.map((d) => d[y]))];
    return {
      positions: new Map(data.map((d) => [d[id], drawnAt(d)])),
      rows: new Map(data.map((d) => [d[id], d])),
      xDomain: domains[0],
      yDomain: domains[1],
      labels:
        visibleLabels(data, options.labels, {
          x,
          y,
          width: options.width,
          height: options.height,
          labelSize: options.labelSize,
        }) ?? [],
    };
  };

  /**
   * The point nearest to a screen position (e.g. a tap), or null if none is within `radius`
   * pixels. Lets pages react to taps while the chart itself ignores touches (phones).
   */
  target.pointAt = (clientX, clientY, radius = 24) => {
    const surface = chart.querySelector(".marks");
    if (!surface) return null;
    const rect = surface.getBoundingClientRect();
    const [ox, oy] = chart.view.origin();
    const sx = chart.view.scale("x");
    const sy = chart.view.scale("y");
    let best = null;
    let bestDistance = radius * radius;
    for (const d of data) {
      const [px, py] = drawnAt(d);
      const dx = rect.left + ox + sx(px) - clientX;
      const dy = rect.top + oy + sy(py) - clientY;
      const distance = dx * dx + dy * dy;
      if (distance <= bestDistance) {
        best = d;
        bestDistance = distance;
      }
    }
    return best;
  };

  // Query markers (#100): `el.placeQuery(markers)` (lib/placeQuery.js queryMarkers) draws them
  // with view.change (no redraw); [] hides them. Their marks never take the pointer: the widget
  // finds the marker near the pointer itself, for the tooltip and the lines to its neighbours.
  let markers = [];
  let hoveredMarker = -1;
  let areas = [];
  // One <svg> behind the marks (like the similarity legend, #168) holding a path per search
  // area: drawn once per placement, never per animation frame (#167 review)
  const areaLayer = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  areaLayer.setAttribute("class", "query-area");
  areaLayer.setAttribute("aria-hidden", "true");
  // Mid-motion it describes the final layout: hidden until the motion settles, then fades in
  if (transition) {
    areaLayer.style.opacity = "0";
    target.finished.then(() => (areaLayer.style.opacity = ""));
  }
  let areaTries = 0;
  let boxScroll = null;
  const drawAreas = () => {
    const surface = chart.querySelector(".marks");
    if (!surface) return;
    // Measured once the map is on the page (placeQuery can run before it is attached)
    if (!target.isConnected) {
      if (++areaTries < 120) nextFrame(drawAreas);
      return;
    }
    // An area around matches at the plot's edge reaches past the plot (#181). The layer sits
    // in the widget, under (before) vega-embed's box, which scrolls and so would clip it: it
    // covers that box, AREA_BLEED px more on each side and AREA_FADE px above and below (so
    // its fade starts outside the plot), within the window and any box that clips or scrolls
    // (#181 review: a short window's sticky map column would scroll sideways)
    if (getComputedStyle(target).position === "static")
      target.style.position = "relative";
    // Positioned too, so it paints after (over) the layer
    if (getComputedStyle(chart).position === "static")
      chart.style.position = "relative";
    if (areaLayer.parentElement !== target) target.prepend(areaLayer);
    const box = surface.closest(".vega-embed-wrapper") ?? surface.parentElement;
    if (!boxScroll) {
      // vega-embed's box can scroll a few px sideways: follow it
      boxScroll = () => areas.length && drawAreas();
      box.addEventListener("scroll", boxScroll, { passive: true });
    }
    // Collapsed while measuring, so its own size doesn't count in the boxes it must fit in
    areaLayer.style.height = "0px";
    const t = target.getBoundingClientRect();
    const s = surface.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const bl = b.left + box.clientLeft;
    const bt = b.top + box.clientTop;
    const [left, top, right, bottom] = bleedBox(
      [
        bl,
        bt,
        bl + (box.clientWidth || b.width),
        bt + (box.clientHeight || b.height),
      ],
      { x: AREA_BLEED, y: AREA_FADE, limits: clippingBoxes(target) },
    );
    Object.assign(areaLayer.style, {
      left: `${left - t.left - target.clientLeft}px`,
      top: `${top - t.top - target.clientTop}px`,
      width: `${right - left}px`,
      height: `${bottom - top}px`,
    });
    // The surface's pixels → the layer's
    const bx = left - s.left;
    const by = top - s.top;
    // Data units → the layer's pixels at the final scales (padding 10px, y up)
    const [ox, oy] = chart.view.origin();
    const w = chart.view.width() - 20;
    const h = chart.view.height() - 20;
    const rows = data.filter(
      (d) => Number.isFinite(d[x]) && Number.isFinite(d[y]),
    );
    const [x0, x1] = extent(rows.map((d) => d[x]));
    const [y0, y1] = extent(rows.map((d) => d[y]));
    drawQueryArea(areaLayer, areas, markers, ([px, py]) => [
      ox - bx + 10 + ((px - x0) / (x1 - x0 || 1)) * w,
      oy - by + 10 + h - ((py - y0) / (y1 - y0 || 1)) * h,
    ]);
  };
  chart.view.addResizeListener?.(() => areas.length && drawAreas());
  // Each marker's name goes to the free side of its ★, off the topic labels (#172 re-review):
  // nameX/nameY in data units, nameOffset [dx, dy] in px, at the final scales
  const withNameSpots = (list, { width: w, height: h, xDomain, yDomain }) => {
    const [x0, x1] = xDomain;
    const [y0, y1] = yDomain;
    const kx = w / (x1 - x0 || 1);
    const ky = h / (y1 - y0 || 1);
    const toPlot = ([px, py]) => [10 + (px - x0) * kx, 10 + h - (py - y0) * ky];
    const labelSize = options.labelSize ?? 15;
    const topics = (
      visibleLabels(data, options.labels, {
        x,
        y,
        width: options.width,
        height: options.height,
        labelSize,
      }) ?? []
    ).map((l) => {
      const [px, py] = toPlot([l.x, l.y]);
      return topicLabelBox(
        px + (l.dx ?? 0),
        py + (l.dy ?? 0),
        l.text,
        labelSize,
        2,
      );
    });
    return list.map((m) => {
      const name = m.label.replace(/^★\s*/, "");
      const { dx, dy } = nameSpot(toPlot([m.x, m.y]), {
        width: estimateWidth(name, 11) * (0.62 / 0.55),
        height: 13,
        obstacles: topics,
        // Its marks clip to the plot (padding included): never past it, halo too (#181)
        bounds: [2, 2, w + 18, h + 18],
      });
      return {
        ...m,
        nameX: m.x + dx / kx,
        nameY: m.y - dy / ky,
        nameOffset: [dx, dy],
      };
    });
  };
  /** Each search-area polygon's bounding box in plot pixels (for the legend's corner, #168). */
  target.queryAreaBoxes = (sx, sy) =>
    areas.flatMap((area) =>
      (area?.polygons ?? []).map(([outer]) => {
        const xs = outer.map((p) => sx(p[0]));
        const ys = outer.map((p) => sy(p[1]));
        return [
          Math.min(...xs),
          Math.min(...ys),
          Math.max(...xs),
          Math.max(...ys),
        ];
      }),
    );
  target.queryMarkers = () => markers;
  target.placeQuery = (list = []) => {
    if (!options.query) return Promise.resolve();
    markers = list;
    hoveredMarker = -1;
    // The search area (#167): matchArea on the plot's pixels at the final scales; the ★ moves
    // to the densest point of the blob holding the top match (#167 review)
    const rows = data.filter(
      (d) => Number.isFinite(d[x]) && Number.isFinite(d[y]),
    );
    const grid = {
      width: chart.view.width() - 20,
      height: chart.view.height() - 20,
      xDomain: extent(rows.map((d) => d[x])),
      yDomain: extent(rows.map((d) => d[y])),
    };
    areas = list.map((m) =>
      matchArea(
        m.matches ?? m.nearest.map(({ x, y }) => ({ x, y, weight: 1 })),
        { ...grid, top: m.nearest[0] },
      ),
    );
    // Without an area (one Strong match, or none) it sits on the top match: never in empty
    // space (#172 re-review)
    const placed = list.map((m, i) => {
      const at = areas[i]?.peak ?? m.nearest[0];
      return at ? { ...m, x: at.x, y: at.y } : m;
    });
    markers = withNameSpots(placed, grid);
    drawAreas();
    // The legend's corner counts the search area (#168 review)
    tapered?.place?.();
    return chart.view
      .change(
        QUERY_DATA,
        chart.view
          .changeset()
          .remove(() => true)
          .insert(queryRows(markers)),
      )
      .signal("queryHover", -1)
      .runAsync()
      .then(() => target.paperLabels?.schedule());
  };
  /** The index of the query marker within `radius` px of a screen position, or -1. */
  target.queryAt = (clientX, clientY, radius = 14) => {
    if (!markers.length || (transition && tm < transition.total)) return -1;
    const surface = chart.querySelector(".marks");
    if (!surface) return -1;
    const rect = surface.getBoundingClientRect();
    const [ox, oy] = chart.view.origin();
    const sx = chart.view.scale("x");
    const sy = chart.view.scale("y");
    let best = -1;
    let bestDistance = radius * radius;
    markers.forEach((m, i) => {
      const dx = rect.left + ox + sx(m.x) - clientX;
      const dy = rect.top + oy + sy(m.y) - clientY;
      if (dx * dx + dy * dy <= bestDistance) {
        best = i;
        bestDistance = dx * dx + dy * dy;
      }
    });
    return best;
  };
  // Brushing and linking (#136): `el.focusPaper(id)` rings the paper the list is showing (null
  // clears it); a paper not on the map draws nothing
  let focused = null;
  target.focusPaper = (focusId = null) => {
    if (!options.focus || focusId === focused) return Promise.resolve();
    focused = focusId;
    const d = focusId == null ? null : data.find((row) => row[id] === focusId);
    const rows =
      d && Number.isFinite(d[x]) && Number.isFinite(d[y])
        ? [{ x: d[x], y: d[y] }]
        : [];
    return chart.view
      .change(
        FOCUS_DATA,
        chart.view
          .changeset()
          .remove(() => true)
          .insert(rows),
      )
      .runAsync();
  };

  if (options.query) {
    const hover = (i) => {
      if (i === hoveredMarker) return;
      hoveredMarker = i;
      chart.view.signal("queryHover", i).runAsync();
    };
    target.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch" || event.buttons) return hover(-1);
      hover(target.queryAt(event.clientX, event.clientY));
    });
    target.addEventListener("pointerleave", () => hover(-1));
  }

  attachNearestTooltip(target, {
    view: chart.view,
    pointAt: target.pointAt,
    entries: tooltip,
    // A query marker under the pointer comes first: it sits on top
    markerAt: options.query
      ? (clientX, clientY) => {
          const i = target.queryAt(clientX, clientY);
          return i < 0
            ? null
            : { datum: markers[i], value: queryTooltip(markers[i]) };
        }
      : null,
  });

  // Nearest neighbours on hover / click (#102): `neighbours` = {similar, k, enabled, pinned}
  if (options.neighbours)
    attachNeighbours(target, {
      ...options.neighbours,
      view: chart.view,
      data,
      x,
      y,
      id,
      pointAt: target.pointAt,
      rows: neighbourRows,
      // On a query marker, its own lines show instead of a paper's neighbours (#100)
      ignore: options.query
        ? (event) => target.queryAt(event.clientX, event.clientY) >= 0
        : null,
    });

  // Short paper labels (#99): `paperLabels` = {label, enabled, emphasis}; an overlay drawn when
  // the motion settles and redrawn (debounced) when the brush, relevance cut, pin or query changes
  if (options.paperLabels) {
    const labelSize = options.labelSize ?? 15;
    const topics =
      visibleLabels(data, options.labels, {
        x,
        y,
        width: options.width,
        height: options.height,
        labelSize,
      }) ?? [];
    // A text box centered on (cx, cy), `em` px per character at `size` px, 3 px clear around it
    const box = (cx, cy, text, size, em = 0.6) =>
      textBox({
        x: cx,
        y: cy,
        width: estimateWidth(text, size) * (em / 0.55),
        height: size * 1.2,
        margin: 3,
      });
    const labels = attachPaperLabels(target, {
      ...options.paperLabels,
      view: chart.view,
      data,
      x,
      y,
      id,
      // DESIGN.md: a quieter tier than the topic labels: small sans in muted ink
      font: token("font-sans", "sans-serif"),
      fill: token("color-on-surface-muted", "#605954"),
      halo: token("color-background", "#fcf9f3"),
      leader: token("color-on-surface-muted", "#605954"),
      moving: () => Boolean(transition) && tm < transition.total,
      brush: () => target.brush(),
      levelCut: () => chart.view.signal("levelCut"),
      matchIds: () => (options.matches ? chart.view.signal("matchIds") : null),
      pinned: () => target.neighbours?.pinned ?? null,
      focusIds: () => {
        const n = target.neighbours;
        return n?.pinned != null
          ? [n.pinned, ...n.neighbours.map((d) => d.id)]
          : null;
      },
      // The pinned paper's neighbour percentages take labels out of the budget (blocking their
      // boxes would leave a dense cluster with no labels at all)
      reserved: () =>
        target.neighbours?.pinned != null
          ? target.neighbours.neighbours.length
          : 0,
      // Everything else drawn as text or on top: topic labels (their wrapped lines), the query
      // marker and its label, and the legend
      obstacles: (toPixel) => [
        ...topics.map((l) => {
          const [px, py] = toPixel([l.x, l.y]);
          // Where it is drawn: shifted inside the plot (fitTopicLabel, #125)
          return topicLabelBox(
            px + (l.dx ?? 0),
            py + (l.dy ?? 0),
            l.text,
            labelSize,
            3,
          );
        }),
        ...markers.flatMap((m) => {
          const [px, py] = toPixel([m.x, m.y]);
          // The 13px ★ and its 11px semibold name 13px above it (#167)
          const [dx, dy] = m.nameOffset ?? [0, -13];
          return [
            [px - 7, py - 8, px + 7, py + 8],
            box(px + dx, py + dy, m.label.replace(/^★\s*/, ""), 11, 0.62),
          ];
        }),
        ...legendBoxes(chart.view),
        ...(tapered?.box() ? [tapered.box()] : []),
      ],
    });
    target.paperLabels = labels;
    target.finished.then(labels.schedule);
    target.addEventListener("input", labels.schedule);
    target.addEventListener("neighbours", labels.schedule);
    chart.view.addSignalListener("levelCut", labels.schedule);
  }

  /**
   * Keyword matches (#125, needs `matches`): only papers with these ids keep their color, the
   * rest are viz-dim; null shows every paper. A signal, so the map isn't redrawn.
   */
  target.highlightMatches = (ids = null) => {
    if (!options.matches) return Promise.resolve();
    return chart.view
      .signal("matchIds", ids)
      .runAsync()
      .then(() => target.paperLabels?.schedule());
  };

  Object.defineProperty(target, "value", {
    get: () => value,
    set: (v) => {
      value = v;
    },
  });
  return target;
}
