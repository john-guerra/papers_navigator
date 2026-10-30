/**
 * Orthogonal Procrustes for 2D projections (#82): UMAP, t-SNE and PCA axes are arbitrary
 * (rotation, reflection, scale and offset differ between methods and runs), so before the map
 * animates from one projection to another, the target is aligned to a reference by the
 * similarity transform (uniform scale, rotation or reflection, translation) that best maps it
 * onto the reference in the least-squares sense.
 *
 * With points as complex numbers z (source, centered) and w (target, centered), the best
 * rotation + scale is w ≈ a·z with a = Σ conj(z)·w / Σ|z|², and the best reflection + scale is
 * w ≈ b·conj(z) with b = Σ z·w / Σ|z|²; the one with the larger |a| or |b| has the smaller
 * residual. This is the closed form of the 2×2 SVD solution.
 */
export function procrustes(source, target) {
  const n = Math.min(source.length, target.length);
  let sx = 0;
  let sy = 0;
  let tx = 0;
  let ty = 0;
  for (let i = 0; i < n; i++) {
    sx += source[i][0];
    sy += source[i][1];
    tx += target[i][0];
    ty += target[i][1];
  }
  sx /= n || 1;
  sy /= n || 1;
  tx /= n || 1;
  ty /= n || 1;
  let ar = 0; // Σ conj(z)·w
  let ai = 0;
  let br = 0; // Σ z·w
  let bi = 0;
  let norm = 0; // Σ |z|²
  for (let i = 0; i < n; i++) {
    const zx = source[i][0] - sx;
    const zy = source[i][1] - sy;
    const wx = target[i][0] - tx;
    const wy = target[i][1] - ty;
    ar += zx * wx + zy * wy;
    ai += zx * wy - zy * wx;
    br += zx * wx - zy * wy;
    bi += zx * wy + zy * wx;
    norm += zx * zx + zy * zy;
  }
  const reflect = Math.hypot(br, bi) > Math.hypot(ar, ai);
  // Degenerate source (all points equal): translation only
  const [cr, ci] = norm
    ? reflect
      ? [br / norm, bi / norm]
      : [ar / norm, ai / norm]
    : [1, 0];
  const apply = ([x, y]) => {
    const zx = x - sx;
    const zy = reflect ? sy - y : y - sy;
    return [tx + cr * zx - ci * zy, ty + ci * zx + cr * zy];
  };
  return { reflect, scale: Math.hypot(cr, ci), apply };
}

/**
 * `coords` ({id: [x, y]}) aligned to `reference` ({id: [x, y]}): fitted on the papers both
 * have, applied to all papers of `coords`. Returns `coords` itself when fewer than 2 papers are
 * shared (nothing to fit).
 */
export function alignProjection(coords, reference) {
  const ids = Object.keys(coords).filter((id) => reference[id]);
  if (ids.length < 2) return coords;
  const fit = procrustes(
    ids.map((id) => coords[id]),
    ids.map((id) => reference[id]),
  );
  return Object.fromEntries(
    Object.entries(coords).map(([id, xy]) => [id, fit.apply(xy)]),
  );
}

/**
 * Aligns projections to a reference, remembering each result (per reference and projection
 * object), so switching back and forth always shows the same coordinates. Every projection is
 * aligned to the same reference rather than to whichever was shown last: chained alignments
 * drift, and A → B → A would not come back to where it started.
 */
export function createAligner() {
  const cache = new WeakMap();
  return {
    align(coords, reference) {
      if (!coords || !reference || coords === reference) return coords;
      if (!cache.has(reference)) cache.set(reference, new WeakMap());
      const byCoords = cache.get(reference);
      if (!byCoords.has(coords))
        byCoords.set(coords, alignProjection(coords, reference));
      return byCoords.get(coords);
    },
  };
}
