import { describe, expect, it } from "vitest";
import {
  alignProjection,
  createAligner,
  procrustes,
} from "../src/lib/procrustes.js";

const reference = {
  a: [0, 0],
  b: [4, 1],
  c: [1, 3],
  d: [-2, 5],
  e: [3, -4],
};

// A similarity transform of the reference: rotate by θ (optionally reflect), scale, translate
const transform = (coords, { theta, reflect = false, scale, dx, dy }) =>
  Object.fromEntries(
    Object.entries(coords).map(([id, [x, y]]) => {
      const yy = reflect ? -y : y;
      return [
        id,
        [
          scale * (Math.cos(theta) * x - Math.sin(theta) * yy) + dx,
          scale * (Math.sin(theta) * x + Math.cos(theta) * yy) + dy,
        ],
      ];
    }),
  );

const expectClose = (actual, expected) => {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  for (const id of Object.keys(expected)) {
    expect(actual[id][0]).toBeCloseTo(expected[id][0], 9);
    expect(actual[id][1]).toBeCloseTo(expected[id][1], 9);
  }
};

describe("procrustes", () => {
  it("recovers rotation, uniform scale and translation", () => {
    const moved = transform(reference, { theta: 1.1, scale: 3, dx: 7, dy: -2 });
    const ids = Object.keys(reference);
    const fit = procrustes(
      ids.map((id) => moved[id]),
      ids.map((id) => reference[id]),
    );
    expect(fit.reflect).toBe(false);
    expect(fit.scale).toBeCloseTo(1 / 3, 9);
    for (const id of ids) {
      const [x, y] = fit.apply(moved[id]);
      expect(x).toBeCloseTo(reference[id][0], 9);
      expect(y).toBeCloseTo(reference[id][1], 9);
    }
  });

  it("detects a reflection", () => {
    const mirrored = transform(reference, {
      theta: -0.4,
      reflect: true,
      scale: 0.5,
      dx: 1,
      dy: 1,
    });
    const ids = Object.keys(reference);
    const fit = procrustes(
      ids.map((id) => mirrored[id]),
      ids.map((id) => reference[id]),
    );
    expect(fit.reflect).toBe(true);
  });

  it("is the identity for degenerate input (all points equal)", () => {
    const fit = procrustes(
      [
        [1, 1],
        [1, 1],
      ],
      [
        [3, 4],
        [3, 4],
      ],
    );
    expect(fit.apply([1, 1])).toEqual([3, 4]);
  });
});

describe("alignProjection", () => {
  it("aligns a rotated, reflected, scaled and translated copy back exactly", () => {
    const moved = transform(reference, {
      theta: 2.3,
      reflect: true,
      scale: 12,
      dx: -40,
      dy: 9,
    });
    expectClose(alignProjection(moved, reference), reference);
  });

  it("fits on shared ids and moves every paper of the projection", () => {
    const moved = transform(
      { ...reference, extra: [10, 10] },
      { theta: 0.7, scale: 2, dx: 3, dy: 3 },
    );
    const { e, ...partialReference } = reference;
    const aligned = alignProjection(moved, partialReference);
    expect(aligned.extra[0]).toBeCloseTo(10, 9);
    expect(aligned.extra[1]).toBeCloseTo(10, 9);
    expect(aligned.e[0]).toBeCloseTo(e[0], 9);
  });

  it("returns the projection unchanged with fewer than 2 shared papers", () => {
    const coords = { a: [5, 5], z: [1, 2] };
    expect(alignProjection(coords, { a: [0, 0] })).toBe(coords);
  });
});

describe("createAligner", () => {
  it("caches the aligned coordinates, so switching back and forth is stable", () => {
    const aligner = createAligner();
    const moved = transform(reference, { theta: 1, scale: 2, dx: 0, dy: 0 });
    const first = aligner.align(moved, reference);
    expect(aligner.align(moved, reference)).toBe(first);
    // The reference itself is never moved
    expect(aligner.align(reference, reference)).toBe(reference);
  });
});
