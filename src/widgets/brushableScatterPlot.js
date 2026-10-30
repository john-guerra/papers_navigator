// The npm "main" is a UMD bundle; import the ES build explicitly.
import vegaSelected from "vega-selected/dist/vegaSelected.es.js";

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

// Internal value for the "everything else" bucket; a real category may be called "Other"
const OTHER = "\u0000other";

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
 * - categorical color highlights at most 3 `categories` (pass them from the whole program so
 *   filtering never repaints survivors; default: top 3 of `data`), everything else is Other;
 * - points outside the brush are dimmed;
 * - with `ringIds`, those papers get a ring (In My Papers) on a layer of their own, so it shows
 *   regardless of color; the ids live in the `mine` param, so pages update them with
 *   `view.signal("mine", ids)` without redrawing (which would lose the brush).
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
    scoreDomain = null,
    size = null,
    sizeRange = [12, 80],
    tooltip = [id],
    width = "container",
    height = 500,
    title,
  } = {},
) {
  const categorical = color && colorType !== "quantitative";
  const highlighted =
    categorical && !colorScheme
      ? (categories ?? topCategories(data, color)).slice(0, 3)
      : null;
  const values = highlighted
    ? data.map((d) => ({
        ...d,
        __color: highlighted.includes(d[color]) ? d[color] : OTHER,
      }))
    : data;
  const palette = categoryRange();
  const colorScale = colorScheme
    ? { scheme: colorScheme }
    : highlighted
      ? {
          domain: [...highlighted, OTHER],
          range: [...palette.slice(0, highlighted.length), palette[3]],
        }
      : {
          range: similarityRange(),
          // DESIGN.md: the ramp's light end starts at the Good cut
          ...(scoreDomain && { domain: scoreDomain, clamp: true }),
        };

  const visible = {
    and: [
      { param: "drag", empty: true },
      "levelCut == null || datum.score >= levelCut",
    ],
  };
  // The relevance level, updated by pages with view.signal("levelCut", …) (no redraw)
  const levelCut = { name: "levelCut", value: null };
  const position = {
    x: { field: x, type: "quantitative", axis: null, scale: { zero: false } },
    y: { field: y, type: "quantitative", axis: null, scale: { zero: false } },
  };
  const points = {
    mark: { type: "point", filled: true, opacity: 0.75 },
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
              legend: {
                orient: "bottom",
                columns: colorType === "quantitative" ? undefined : 4,
                ...(highlighted && {
                  labelExpr: `datum.value === ${JSON.stringify(OTHER)} ? "Other" : datum.label`,
                }),
              },
            }
          : { test: visible, value: token("color-viz-neutral", "#605954") },
        value: token("color-viz-dim", "#e1ddd8"),
      },
      ...(size && {
        size: {
          field: size,
          type: "quantitative",
          scale: { range: sizeRange },
          legend: null,
        },
      }),
      tooltip: tooltip.map((field) => ({ field })),
    },
  };
  const rings = ringIds && {
    transform: [{ filter: `indexof(mine, datum.${id}) >= 0` }],
    mark: {
      type: "point",
      filled: false,
      size: 110,
      strokeWidth: 1.5,
      color: token("color-viz-followed-ring", "#241e1a"),
    },
    encoding: { ...position, tooltip: tooltip.map((field) => ({ field })) },
  };

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    width,
    height,
    title,
    data: { values },
    ...(rings
      ? {
          params: [{ name: "mine", value: ringIds }, levelCut],
          layer: [points, rings],
        }
      : { ...points, params: [...points.params, levelCut] }),
    // Transparent so the page's paper shows through (Vega defaults to white)
    // and the title/legend take the page's ink and sans font (both themes).
    config: {
      background: "transparent",
      view: { stroke: null },
      font: token("font-sans", "sans-serif"),
      title: { color: token("color-on-surface", "#241e1a"), fontWeight: 500 },
      legend: {
        titleColor: token("color-on-surface", "#241e1a"),
        labelColor: token("color-on-surface-muted", "#605954"),
      },
    },
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

/**
 * Brushable scatterplot reactive widget, ported from @john-guerra/brushable-scatterplot.
 * `.value = {brushed, clicked}`: brushed points (all when no brush) and clicked points.
 */
export async function BrushableScatterPlot(data, options = {}) {
  const { x = "x", y = "y", id = "id", renderer = "canvas" } = options;
  const chart = await vegaSelected(scatterSpec(data, options), {
    vegaConfig: { renderer, actions: false },
  });
  const target = document.createElement("div");
  target.className = "brushable-scatterplot";
  target.append(chart);
  target.view = chart.view;

  let value = { brushed: data, clicked: [] };

  // vega-selected emits input on any signal change (e.g. levelCut, mine): forward only real
  // selection changes, or pages that set those signals from the map's value would loop
  const selectionKey = () => {
    const { drag, click } = chart.value ?? {};
    return JSON.stringify([drag?.[x], drag?.[y], click?.[id]]);
  };
  let lastKey = selectionKey();
  chart.addEventListener("input", (event) => {
    event.stopPropagation();
    const key = selectionKey();
    if (key === lastKey) return;
    lastKey = key;
    value = selectionFromChart(chart.value, data, { x, y, id });
    target.dispatchEvent(new Event("input", { bubbles: true }));
  });

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
      const dx = rect.left + ox + sx(d[x]) - clientX;
      const dy = rect.top + oy + sy(d[y]) - clientY;
      const distance = dx * dx + dy * dy;
      if (distance <= bestDistance) {
        best = d;
        bestDistance = distance;
      }
    }
    return best;
  };

  Object.defineProperty(target, "value", {
    get: () => value,
    set: (v) => {
      value = v;
    },
  });
  return target;
}
