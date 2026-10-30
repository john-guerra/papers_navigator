import { describe, expect, it } from "vitest";
import {
  domainAt,
  ease,
  planTransition,
  positionAt,
  stagePlan,
} from "../src/widgets/scatterTransition.js";

const snapshot = (rows) => ({
  positions: new Map(rows.map((d) => [d.id, [d.x, d.y]])),
  rows: new Map(rows.map((d) => [d.id, d])),
  xDomain: [
    Math.min(...rows.map((d) => d.x)),
    Math.max(...rows.map((d) => d.x)),
  ],
  yDomain: [
    Math.min(...rows.map((d) => d.y)),
    Math.max(...rows.map((d) => d.y)),
  ],
  labels: [],
});

const before = [
  { id: "a", x: 0, y: 0, cluster: 1 },
  { id: "b", x: 10, y: 0, cluster: 1 },
  { id: "c", x: 0, y: 10, cluster: 2 },
];

describe("ease", () => {
  it("starts at 0, ends at 1 and is symmetric", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5);
    expect(ease(0.25) + ease(0.75)).toBeCloseTo(1);
  });
});

describe("stagePlan", () => {
  it("is a single stage without groups", () => {
    const plan = stagePlan(before, { duration: 700 });
    expect(plan.total).toBe(700);
    expect(plan.startOf(2)).toBe(0);
  });

  it("orders stages largest group first and the null group (noise) last", () => {
    const data = [
      ...before,
      { id: "d", cluster: 2 },
      { id: "e", cluster: 2 },
      { id: "f", cluster: null },
      { id: "g", cluster: null },
      { id: "h", cluster: null },
      { id: "i", cluster: null },
    ];
    const plan = stagePlan(data, { duration: 600, stageOf: (d) => d.cluster });
    expect(plan.stages).toBe(3);
    expect(plan.startOf(2)).toBe(0);
    expect(plan.startOf(1)).toBe(300);
    expect(plan.startOf(null)).toBe(600);
    expect(plan.total).toBe(1200);
  });

  it("caps the whole motion at 3 stages long however many groups", () => {
    const data = Array.from({ length: 40 }, (_, i) => ({ cluster: i }));
    const plan = stagePlan(data, { duration: 700, stageOf: (d) => d.cluster });
    expect(plan.total).toBeCloseTo(2100);
  });
});

describe("planTransition", () => {
  it("is null when nothing moves, enters or leaves", () => {
    expect(planTransition(before, snapshot(before))).toBeNull();
    expect(planTransition(before, null)).toBeNull();
  });

  it("moves shared points, fades entering ones in place and leaving ones out", () => {
    const after = [
      { id: "a", x: 5, y: 5, cluster: 1 },
      { id: "b", x: 10, y: 0, cluster: 1 },
      { id: "d", x: 2, y: 2, cluster: 2 },
    ];
    const plan = planTransition(after, snapshot(before), { duration: 500 });
    expect(plan.total).toBe(500);
    expect(plan.motion.get("a")).toMatchObject({
      x0: 0,
      y0: 0,
      x1: 5,
      y1: 5,
      enter: 0,
      exit: 0,
    });
    expect(plan.motion.get("d")).toMatchObject({
      x0: 2,
      y0: 2,
      x1: 2,
      y1: 2,
      enter: 1,
    });
    expect(plan.exits.map((d) => d.id)).toEqual(["c"]);
    expect(plan.motion.get("c")).toMatchObject({
      x0: 0,
      y0: 10,
      x1: 0,
      y1: 10,
      exit: 1,
    });
    expect(plan.xDomain).toEqual([
      [0, 10],
      [2, 10],
    ]);
  });

  it("stages points by group when asked", () => {
    const after = before.map((d) => ({ ...d, x: d.x + 1 }));
    const plan = planTransition(after, snapshot(before), {
      duration: 400,
      stageOf: (d) => d.cluster,
    });
    expect(plan.motion.get("a").start).toBe(0);
    expect(plan.motion.get("c").start).toBe(200);
    expect(plan.stageStart(2)).toBe(200);
  });
});

describe("positionAt / domainAt", () => {
  it("interpolates from the old to the new position within the point's stage", () => {
    const m = { x0: 0, y0: 0, x1: 10, y1: 20, start: 100 };
    expect(positionAt(m, 0, 400)).toEqual([0, 0]);
    expect(positionAt(m, 300, 400)).toEqual([5, 10]);
    expect(positionAt(m, 900, 400)).toEqual([10, 20]);
  });

  it("eases the domain over the whole motion", () => {
    const d = [
      [0, 10],
      [10, 30],
    ];
    expect(domainAt(d, 0, 1000)).toEqual([0, 10]);
    expect(domainAt(d, 500, 1000)).toEqual([5, 20]);
    expect(domainAt(d, 2000, 1000)).toEqual([10, 30]);
  });
});
