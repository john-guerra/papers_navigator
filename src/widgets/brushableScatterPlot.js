// The npm "main" is a UMD bundle; import the ES build explicitly.
import vegaSelected from "vega-selected/dist/vegaSelected.es.js";

/** Points inside a Vega-Lite interval brush ({[xField]: [lo, hi], [yField]: [lo, hi]}). */
export function brushFilter(data, drag, { x = "x", y = "y" } = {}) {
  if (!drag || !drag[x] || !drag[y]) return data;
  const [x0, x1] = drag[x];
  const [y0, y1] = drag[y];
  return data.filter((d) => d[x] >= x0 && d[x] <= x1 && d[y] >= y0 && d[y] <= y1);
}

export function scatterSpec(
  data,
  {
    x = "x",
    y = "y",
    id = "id",
    color = null,
    colorScheme = "tableau20",
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
    mark: { type: "point", filled: true, opacity: 0.6 },
    params: [
      { name: "drag", select: { type: "interval", encodings: ["x", "y"] } },
      { name: "click", select: { type: "point", fields: [id], on: "click" } },
    ],
    encoding: {
      x: { field: x, type: "quantitative", axis: null, scale: { zero: false } },
      y: { field: y, type: "quantitative", axis: null, scale: { zero: false } },
      ...(color && {
        color: { field: color, type: "nominal", scale: { scheme: colorScheme } },
      }),
      ...(size && {
        size: { field: size, type: "quantitative", scale: { range: sizeRange }, legend: null },
      }),
      tooltip: tooltip.map((field) => ({ field })),
    },
    config: { view: { stroke: null } },
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
