/**
 * A box ([x0, y0, x1, y1], px) grown by `x` px on the left and right and `y` px above and below,
 * then cut to every box in `limits` (same form, ±Infinity where a side has no limit): what the
 * search-area layer may cover around the chart (#181) without leaving a box that clips or
 * scrolls, or the window. Never inside out: where the limits leave nothing, it is empty.
 */
export function bleedBox([x0, y0, x1, y1], { x = 0, y = 0, limits = [] } = {}) {
  let box = [x0 - x, y0 - y, x1 + x, y1 + y];
  for (const [a, b, c, d] of limits)
    box = [
      Math.max(box[0], a),
      Math.max(box[1], b),
      Math.min(box[2], c),
      Math.min(box[3], d),
    ];
  return [box[0], box[1], Math.max(box[0], box[2]), Math.max(box[1], box[3])];
}
