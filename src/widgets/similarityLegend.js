// The similarity legend (#130): size and color both echo similarity on the map, so one bar shows
// both, growing and darkening from left to right. Its top edge follows the dots' real diameter
// (Vega's size is an area, so the diameter grows as its square root), not a straight line that
// would overstate the small end.

const SVG = "http://www.w3.org/2000/svg";
let legendCount = 0;

/** The diameter (px) of a dot whose area is `area` px² (Vega-Lite's `size`). */
export function diameterOf(area) {
  return area > 0 ? 2 * Math.sqrt(area / Math.PI) : 0;
}

const round = (v) => Math.round(v * 100) / 100;

/**
 * The bar's outline: flat bottom at `height`, top at `height - diameterAt(t)` for t in [0, 1]
 * across `width`, sampled in `steps` segments. An SVG path string.
 */
export function wedgePath({ width, height, diameterAt, steps = 24 }) {
  const top = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return `${round(t * width)},${round(height - diameterAt(t))}`;
  });
  return `M0,${height} L${top.join(" L")} L${width},${height} Z`;
}

/**
 * The legend element: `title`, the bar (`colorAt(t)` and `diameterAt(t)` for t in [0, 1], from
 * the map's own scales) and `labels` = [low, high] under its two ends. Styled by .similarity-legend
 * like Vega's legends (DESIGN.md → Legend); the map places it.
 */
export function similarityLegend({
  title,
  labels,
  colorAt,
  diameterAt,
  width = 120,
  steps = 24,
}) {
  const height = Math.ceil(Math.max(diameterAt(0), diameterAt(1))) + 1;
  const id = `similarity-legend-${++legendCount}`;
  const el = document.createElement("div");
  el.className = "similarity-legend";
  el.setAttribute("role", "img");
  el.setAttribute(
    "aria-label",
    `${title}: smaller, lighter dots are ${labels[0]}; larger, darker dots are ${labels[1]}`,
  );

  const heading = document.createElement("div");
  heading.className = "similarity-legend-title";
  heading.textContent = title;

  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("aria-hidden", "true");
  const gradient = document.createElementNS(SVG, "linearGradient");
  gradient.id = id;
  for (let i = 0; i <= 8; i++) {
    const stop = document.createElementNS(SVG, "stop");
    stop.setAttribute("offset", `${(i / 8) * 100}%`);
    stop.setAttribute("stop-color", colorAt(i / 8));
    gradient.append(stop);
  }
  const defs = document.createElementNS(SVG, "defs");
  defs.append(gradient);
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", wedgePath({ width, height, diameterAt, steps }));
  path.setAttribute("fill", `url(#${id})`);
  svg.append(defs, path);

  const ends = document.createElement("div");
  ends.className = "similarity-legend-labels";
  for (const text of labels) {
    const span = document.createElement("span");
    span.textContent = text;
    ends.append(span);
  }
  el.append(heading, svg, ends);
  return el;
}
