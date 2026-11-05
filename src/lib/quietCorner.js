// The similarity legend sits in the map's background, under the points (#168), so it goes to the
// plot corner where it covers the fewest of them.

const CORNERS = ["top-right", "top-left", "bottom-right", "bottom-left"];

/**
 * The plot corner (`width` × `height` px) where a `box` = [w, h] legend, `inset` px from the
 * edges, covers the fewest `points` ([x, y] in plot pixels). Ties keep the first in
 * top-right, top-left, bottom-right, bottom-left (DESIGN.md's default corner first).
 * Returns {corner, left, top}: the box's top-left in plot pixels.
 */
export function quietCorner(points, { width, height, box, inset = 8 }) {
  const [w, h] = box;
  let best = null;
  for (const corner of CORNERS) {
    const left = corner.endsWith("right") ? width - w - inset : inset;
    const top = corner.startsWith("bottom") ? height - h - inset : inset;
    let count = 0;
    for (const [x, y] of points)
      if (x >= left && x <= left + w && y >= top && y <= top + h) count++;
    if (!best || count < best.count) best = { corner, left, top, count };
  }
  return { corner: best.corner, left: best.left, top: best.top };
}
