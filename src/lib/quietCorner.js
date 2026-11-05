// The similarity legend sits in the map's background, under the points (#168), so it goes to the
// plot corner where it covers the least: papers, topic labels and the search area.

const CORNERS = ["top-right", "top-left", "bottom-right", "bottom-left"];

/**
 * The plot corner (`width` × `height` px) where a `box` = [w, h] legend, `inset` px from the
 * edges, covers the least: each of `points` ([x, y] in plot pixels) counts 1, each of
 * `obstacles` ([x0, y0, x1, y1]: topic labels, search areas) it overlaps counts
 * `obstacleWeight`. Ties keep the first in top-right, top-left, bottom-right, bottom-left
 * (DESIGN.md's default corner first). With a `current` corner it only moves when another is
 * quieter by at least `margin` (#168 review: no jumping on a one-dot difference).
 * Returns {corner, left, top}: the box's top-left in plot pixels.
 */
export function quietCorner(
  points,
  {
    width,
    height,
    box,
    inset = 8,
    obstacles = [],
    obstacleWeight = 3,
    current = null,
    margin = 2,
  },
) {
  const [w, h] = box;
  const spots = CORNERS.map((corner) => {
    const left = corner.endsWith("right") ? width - w - inset : inset;
    const top = corner.startsWith("bottom") ? height - h - inset : inset;
    let count = 0;
    for (const [x, y] of points)
      if (x >= left && x <= left + w && y >= top && y <= top + h) count++;
    for (const [x0, y0, x1, y1] of obstacles)
      if (x0 < left + w && left < x1 && y0 < top + h && top < y1)
        count += obstacleWeight;
    return { corner, left, top, count };
  });
  let best = spots[0];
  for (const s of spots) if (s.count < best.count) best = s;
  const now = spots.find((s) => s.corner === current);
  const pick = now && best.count > now.count - margin ? now : best;
  return { corner: pick.corner, left: pick.left, top: pick.top };
}
