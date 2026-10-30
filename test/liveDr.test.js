import * as druid from "@saehrimnir/druidjs";
import { describe, expect, it } from "vitest";
import {
  DR_METHODS,
  defaultParams,
  runDruid,
  toProjection,
} from "../src/lib/liveDr.js";

// 12 points in 4-d: three well-separated groups
const rows = Array.from({ length: 12 }, (_, i) => {
  const g = Math.floor(i / 4);
  return [g * 10 + (i % 4) * 0.1, g * -5, (i % 2) * 0.2, g];
});
const data = new Float32Array(rows.flat());

describe("DR_METHODS", () => {
  it("names only methods Druid exports", () => {
    for (const m of DR_METHODS) expect(typeof druid[m.id]).toBe("function");
  });

  it("gives default parameters by name", () => {
    expect(defaultParams("UMAP")).toEqual({ n_neighbors: 15, min_dist: 0.1 });
    expect(defaultParams("PCA")).toEqual({});
  });
});

describe("runDruid", () => {
  it("projects with PCA to n × 2 flat coordinates", () => {
    const coords = runDruid(druid, {
      method: "PCA",
      params: {},
      seed: 42,
      iterations: null,
      data,
      dims: 4,
    });
    expect(coords).toHaveLength(24);
    // the first component separates the groups
    const xs = [0, 4, 8].map((i) => coords[2 * i]);
    expect(Math.abs(xs[0] - xs[1])).toBeGreaterThan(1);
  });

  it("reports progress and is deterministic for a seed", () => {
    const job = {
      method: "UMAP",
      params: { n_neighbors: 3, min_dist: 0.1 },
      seed: 7,
      iterations: 50,
      data,
      dims: 4,
    };
    const steps = [];
    const a = runDruid(druid, job, (step, total) => steps.push([step, total]));
    const b = runDruid(druid, job);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(steps.at(-1)).toEqual([50, 50]);
  });

  it("is self-contained, so its source can run in a worker", () => {
    const rebuilt = new Function(`return ${runDruid.toString()}`)();
    const coords = rebuilt(druid, {
      method: "PCA",
      params: {},
      seed: 1,
      iterations: null,
      data,
      dims: 4,
    });
    expect(coords).toHaveLength(24);
  });
});

describe("toProjection", () => {
  it("maps row i to papers[i].id", () => {
    expect(
      toProjection([{ id: "a" }, { id: "b" }], new Float64Array([1, 2, 3, 4])),
    ).toEqual({ a: [1, 2], b: [3, 4] });
  });
});
