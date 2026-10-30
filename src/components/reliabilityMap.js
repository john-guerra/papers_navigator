import {
  overlayDomain,
  reliabilityDomain,
  reliabilityGrid,
} from "../lib/reliability.js";
import { reliabilityRange } from "../widgets/brushableScatterPlot.js";

const extent = (values) => [Math.min(...values), Math.max(...values)];

// Overlay grids by scores object (dropped with it), then by drawn coordinates, size and set
const grids = new WeakMap();
/** How many overlay grids were built (tests check redraws reuse them). */
export const gridBuilds = { count: 0 };

/**
 * Map options for reliability (#84), spread into BrushableScatterPlot's options:
 * - "Color by: Reliability" (`colorBy === "reliability"`): the reliability ramp, darkest at the
 *   least reliable papers, over the projection's [5th percentile, max];
 * - the distortion overlay (`reliability.overlay`): a kernel-smoothed grid of the scores of
 *   every paper on this projection (`everyPaper`, positioned), clipped to the shown papers'
 *   extent so the map's scales don't move.
 * `scores` = {id: score} for the map's projection, or null (not measured yet: no options).
 * The grid is memoized per scores object (projection, k, metric), `cacheKey` (e.g. projection
 * and alignment, which fix the drawn coordinates), size and shown set, so redraws that change
 * none of them (colors, search, theme, My Papers) reuse it.
 */
export function reliabilityMapOptions({
  reliability,
  scores,
  colorBy,
  shown,
  everyPaper,
  width,
  height,
  cacheKey = null,
}) {
  if (!reliability || !scores) return {};
  const domain = reliabilityDomain(Object.values(scores));
  const options = {};
  if (colorBy === "reliability")
    Object.assign(options, {
      colorType: "quantitative",
      colorTitle: reliability.label,
      colorRange: reliabilityRange().reverse(),
      scoreDomain: domain,
      legendLabels: ["less reliable", "more reliable"],
    });
  if (reliability.overlay && shown.length && typeof width === "number") {
    const key = JSON.stringify([
      cacheKey,
      width,
      height,
      shown.map((p) => p.id).join("\u0000"),
    ]);
    let byKey = grids.get(scores);
    if (!byKey) grids.set(scores, (byKey = new Map()));
    if (!byKey.has(key)) {
      if (byKey.size >= 20) byKey.delete(byKey.keys().next().value);
      const points = everyPaper
        .filter((p) => scores[p.id] != null)
        .map((p) => ({ x: p.x, y: p.y, value: scores[p.id] }));
      gridBuilds.count++;
      byKey.set(
        key,
        reliabilityGrid(points, {
          // the scales keep 10px padding on each side
          width: width - 20,
          height: height - 20,
          xDomain: extent(shown.map((p) => p.x)),
          yDomain: extent(shown.map((p) => p.y)),
          domain: overlayDomain(Object.values(scores)),
        }).filter((c) => c.distortion > 0), // nothing to draw where reliability is typical
      );
    }
    options.overlay = byKey.get(key);
  }
  return options;
}
