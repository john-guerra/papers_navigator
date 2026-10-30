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

export function scatterSpec(
  data,
  {
    x = "x",
    y = "y",
    id = "id",
    color = null,
    colorTitle = color,
    colorType = "nominal",
    // Quantitative (similarity) uses DESIGN.md's ramp unless a scheme is passed.
    // Categorical colors (viz-cat-1..3 + viz-cat-other) are left to issue #10.
    colorScheme = colorType === "quantitative" ? null : "tableau20",
    size = null,
    sizeRange = [10, 200],
    tooltip = [id],
    width = "container",
    height = 500,
    title,
  } = {},
) {
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    width,
    height,
    title,
    data: { values: data },
    mark: {
      type: "point",
      filled: true,
      opacity: 0.6,
      color: token("color-viz-neutral", "#605954"),
    },
    params: [
      { name: "drag", select: { type: "interval", encodings: ["x", "y"] } },
      { name: "click", select: { type: "point", fields: [id], on: "click" } },
    ],
    encoding: {
      x: { field: x, type: "quantitative", axis: null, scale: { zero: false } },
      y: { field: y, type: "quantitative", axis: null, scale: { zero: false } },
      ...(color && {
        color: {
          field: color,
          type: colorType,
          title: colorTitle,
          scale: colorScheme
            ? { scheme: colorScheme }
            : { range: similarityRange() },
          legend: { orient: "bottom", columns: colorType === "quantitative" ? undefined : 4 },
        },
      }),
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
 * Brushable scatterplot reactive widget, ported from @john-guerra/brushable-scatterplot.
 * `.value = {brushed, clicked}`: brushed points (all when no brush) and clicked points.
 * Clicking an already clicked point opens its `url`.
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
  let previousClicked = [];

  chart.addEventListener("input", (event) => {
    event.stopPropagation();
    const { drag, click } = chart.value;
    let brushed = brushFilter(data, drag, { x, y });
    let clicked = value.clicked;
    if (click?.[id]) {
      clicked = data.filter((d) => click[id].includes(d[id]));
      const ids = clicked.map((d) => d[id]);
      const again = clicked.find((d) => previousClicked.includes(d[id]));
      if (again?.url) window.open(again.url, "_blank");
      previousClicked = ids;
      brushed = data;
    } else if (!click) {
      clicked = [];
      previousClicked = [];
    }
    value = { brushed, clicked };
    target.dispatchEvent(new Event("input", { bubbles: true }));
  });

  Object.defineProperty(target, "value", {
    get: () => value,
    set: (v) => {
      value = v;
    },
  });
  return target;
}
