// The npm "main" is a UMD bundle; import the ES build explicitly.
import vegaSelected from "vega-selected/dist/vegaSelected.es.js";
import { attachNearestTooltip } from "./nearestTooltip.js";
import { attachNeighbours } from "./mapNeighbours.js";
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

/**
 * A DESIGN.md token from the page's CSS custom properties (src/style.css), or `fallback`
 * outside a styled page (tests, reuse elsewhere). Read when the spec is built, so the map
 * picks up the light or dark value in effect at render time.
 */
function token(name, fallback) {
  const value =
    typeof document === "undefined"
      ? ""
      : getComputedStyle(document.documentElement)
          .getPropertyValue(`--${name}`)
          .trim();
  return value || fallback;
}

/** DESIGN.md sequential similarity ramp, weakest to strongest match. */
export function similarityRange() {
  return [
    token("color-viz-similarity-1", "#d5958c"),
    token("color-viz-similarity-2", "#b14f45"),
    token("color-viz-similarity-3", "#75201a"),
  ];
}

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
 * Labels that fit without overlapping, in priority order (pass the largest topics first):
 * each label's box is estimated from its text length at `fontSize` and placed with the same
 * linear mapping as the map (domain → [padding, size - padding]); a label overlapping one
 * already kept is dropped. `{text, x, y}` in data units.
 */
export function cullLabels(
  labels,
  { width, height, xDomain, yDomain, fontSize = 11, padding = 10, gap = 2 },
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
    const w = label.text.length * fontSize * 0.55 + 2 * gap;
    const h = fontSize * 1.2 + 2 * gap;
    const cx = sx(label.x);
    const cy = height - sy(label.y);
    const box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
    const overlaps = boxes.some(
      (b) => box[0] < b[2] && b[0] < box[2] && box[1] < b[3] && b[1] < box[3],
    );
    if (overlaps) continue;
    boxes.push(box);
    kept.push(label);
  }
  return kept;
}

const extent = (values) => [Math.min(...values), Math.max(...values)];

/** An explicit scale domain: the extent of `field` in `data` (none without finite values). */
function fixedDomain(data, field) {
  const values = data.map((d) => d[field]).filter(Number.isFinite);
  return values.length ? { domain: extent(values) } : {};
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
 *   only at its ends, with `legendLabels` ([low, high], e.g. ["less similar", "more similar"]);
 * - categorical color highlights at most 3 `categories` (pass them from the whole program so
 *   filtering never repaints survivors; default: top 3 of `data`), everything else is Other;
 * - points outside the brush are dimmed;
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
    categories,
    ringIds = null,
    labels = null,
    labelSize = 11,
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
          range: colorRange ?? similarityRange(),
          // DESIGN.md: the ramp's light end starts at the Good cut
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
    ],
  };
  // The relevance level, updated by pages with view.signal("levelCut", …) (no redraw)
  const levelCut = { name: "levelCut", value: null };
  // nice: false + padding in pixels, so cullLabels can mirror the scales exactly
  const scale = { zero: false, nice: false, padding: 10 };
  // Explicit domains (#112): the points' extent, or the tween's eased one. Every layer shares
  // the x/y scales, so data-driven domains would union all of them, and the neighbour layers'
  // dataset is usually empty (Vega then warns "Infinite extent" on each render). The other
  // layers (rings, topic labels, overlay cells) all sit inside the points' extent anyway.
  const xScale = { ...scale, ...(tween?.xScale ?? fixedDomain(data, x)) };
  const yScale = { ...scale, ...(tween?.yScale ?? fixedDomain(data, y)) };
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
              legend: legendFor({
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
          field: sizeCopy ? "__size" : size,
          type: "quantitative",
          scale: {
            range: sizeRange,
            // Fixed while leaving points are still in the data (#82)
            ...(transition &&
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
  const labelRows = [
    ...(shown ?? []).map((l) => ({
      text: l.text,
      [x]: l.x,
      [y]: l.y,
      ...(transition && { __old: 0, __s: transition.stageStart(l.cluster) }),
    })),
    ...(transition && shown?.length ? transition.fromLabels : []).map((l) => ({
      text: l.text,
      [x]: l.x,
      [y]: l.y,
      __old: 1,
      __s: 0,
    })),
  ];
  const text = (mark) => ({
    data: { values: labelRows },
    ...(tween && { transform: tween.labelTransform }),
    mark: {
      type: "text",
      fontSize: labelSize,
      fontWeight: 600,
      font: token("font-sans", "sans-serif"),
      ...mark,
    },
    encoding: {
      ...position,
      text: { field: "text" },
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
  const layers = [
    ...(shade ? [shade] : []),
    points,
    ...(nn ? nn.below : []),
    ...(rings ? [rings] : []),
    ...textLayers,
    ...(nn ? nn.above : []),
  ];

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    width,
    height,
    title,
    data: { values },
    ...(nn && { datasets: { [NEIGHBOURS_DATA]: [] } }),
    ...(tween && { transform: tween.transform }),
    ...(layers.length > 1
      ? {
          params: [
            ...(rings ? [{ name: "mine", value: ringIds }] : []),
            ...(nn ? [{ name: "nnIds", value: [] }] : []),
            levelCut,
            ...(tween?.params ?? []),
          ],
          layer: layers,
        }
      : {
          ...points,
          params: [...points.params, levelCut, ...(tween?.params ?? [])],
        }),
    // Transparent so the page's paper shows through (Vega defaults to white)
    // and the title/legend take the page's ink and sans font (both themes).
    config: {
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
  const fade = (opacity) =>
    tween
      ? {
          expr: `${opacity} * clamp((tm - ${0.85 * transition.total}) / ${0.15 * transition.total}, 0, 1)`,
        }
      : opacity;
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
 * The color legend: a ramp labelled only at its two ends with `legendLabels` (its numbers mean
 * little to readers; the tooltip has the exact score), or the 3 + Other categories.
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
    return legendLabels && ends.every(Number.isFinite) && ends[0] < ends[1]
      ? {
          type: "gradient",
          direction: "horizontal",
          gradientLength: 120,
          values: ends,
          labelExpr: `datum.index === 0 ? ${JSON.stringify(legendLabels[0])} : ${JSON.stringify(legendLabels[1])}`,
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
  { x = "x", y = "y", width, height, labelSize = 11 },
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
    renderer = "canvas",
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
    const surface = chart.querySelector("canvas, svg");
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

  attachNearestTooltip(target, {
    view: chart.view,
    pointAt: target.pointAt,
    entries: tooltip,
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
    });

  Object.defineProperty(target, "value", {
    get: () => value,
    set: (v) => {
      value = v;
    },
  });
  return target;
}
