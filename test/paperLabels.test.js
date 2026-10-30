import { describe, expect, it } from "vitest";
import {
  PAPER_LABELS_KEY,
  chooseLabels,
  createPaperLabelSettings,
  emphasisIds,
  labelBudget,
  labelFilter,
  pixelMapper,
  textBox,
} from "../src/lib/paperLabels.js";

const memoryStorage = (initial = {}) => {
  const items = { ...initial };
  return {
    getItem: (k) => items[k] ?? null,
    setItem: (k, v) => (items[k] = String(v)),
    items,
  };
};

describe("createPaperLabelSettings", () => {
  it("defaults to on at desktop widths and off on phones", () => {
    expect(createPaperLabelSettings({ storage: memoryStorage() }).value).toBe(
      true,
    );
    expect(
      createPaperLabelSettings({ storage: memoryStorage(), phone: true }).value,
    ).toBe(false);
  });

  it("remembers the choice per device and emits input", () => {
    const storage = memoryStorage();
    const store = createPaperLabelSettings({ storage, phone: true });
    let events = 0;
    store.addEventListener("input", () => events++);
    store.set(true);
    expect(store.value).toBe(true);
    expect(events).toBe(1);
    expect(storage.items[PAPER_LABELS_KEY]).toBe("true");
    // A stored choice wins over the width default
    expect(createPaperLabelSettings({ storage, phone: true }).value).toBe(true);
    store.set(false);
    expect(createPaperLabelSettings({ storage }).value).toBe(false);
  });

  it("ignores unreadable or invalid storage and survives a failing write", () => {
    expect(
      createPaperLabelSettings({
        storage: memoryStorage({ [PAPER_LABELS_KEY]: "{" }),
      }).value,
    ).toBe(true);
    expect(
      createPaperLabelSettings({
        storage: memoryStorage({ [PAPER_LABELS_KEY]: '"yes"' }),
      }).value,
    ).toBe(true);
    const store = createPaperLabelSettings({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
      },
    });
    store.set(false);
    expect(store.value).toBe(false);
  });
});

describe("pixelMapper", () => {
  it("adds the view's origin to the scaled position, like pointAt", () => {
    const toPixel = pixelMapper({
      sx: (v) => v * 10,
      sy: (v) => 100 - v * 10,
      origin: [5, 20],
    });
    expect(toPixel([1, 2])).toEqual([15, 100]);
  });
});

describe("textBox", () => {
  it("places the box by anchor and baseline, with a margin", () => {
    const base = { x: 100, y: 50, width: 40, height: 10 };
    expect(textBox(base)).toEqual([80, 45, 120, 55]);
    expect(textBox({ ...base, anchor: "start", baseline: "top" })).toEqual([
      100, 50, 140, 60,
    ]);
    expect(
      textBox({ ...base, anchor: "end", baseline: "bottom", margin: 2 }),
    ).toEqual([58, 38, 102, 52]);
  });
});

describe("chooseLabels", () => {
  const box = (x, y, w = 20, h = 10) => [x, y, x + w, y + h];

  it("keeps labels in rank order, dropping ones that overlap a kept label", () => {
    const kept = chooseLabels([
      { key: "b", box: box(10, 0), rank: 2 },
      { key: "a", box: box(0, 0), rank: 1 },
      { key: "c", box: box(100, 0), rank: 3 },
    ]);
    expect([...kept.keys()]).toEqual(["a", "c"]);
  });

  it("never draws over an obstacle (topic labels, query marker, legend)", () => {
    const kept = chooseLabels(
      [
        { key: "a", box: box(0, 0), rank: 1, always: true },
        { key: "b", box: box(50, 0), rank: 2 },
      ],
      { obstacles: [box(5, 5)] },
    );
    expect([...kept.keys()]).toEqual(["b"]);
  });

  it("puts `always` labels first and outside the budget", () => {
    const kept = chooseLabels(
      [
        { key: "space", box: box(0, 0), rank: 0 },
        { key: "pinned", box: box(5, 0), rank: 9, always: true },
        { key: "other", box: box(100, 0), rank: 1 },
        { key: "third", box: box(200, 0), rank: 2 },
      ],
      { max: 1 },
    );
    expect([...kept.keys()]).toEqual(["pinned", "other"]);
  });

  it("drops labels that leave the plot", () => {
    const kept = chooseLabels(
      [
        { key: "in", box: box(10, 10), rank: 1 },
        { key: "out", box: box(95, 10), rank: 2 },
      ],
      { bounds: [0, 0, 100, 100] },
    );
    expect([...kept.keys()]).toEqual(["in"]);
  });

  it("always places a forced label (the pinned paper): the first free nudge, else its own box", () => {
    const blocked = { obstacles: [box(0, 0, 30, 30)] };
    const nudged = chooseLabels(
      [
        {
          key: "pinned",
          box: box(5, 5),
          rank: 0,
          force: true,
          alternatives: [box(10, 10), box(50, 50)],
        },
      ],
      blocked,
    );
    expect([...nudged]).toEqual([["pinned", 2]]);
    const stuck = chooseLabels(
      [{ key: "pinned", box: box(5, 5), rank: 0, force: true }],
      blocked,
    );
    expect([...stuck]).toEqual([["pinned", 0]]);
  });
});

describe("labelFilter", () => {
  const rows = [
    { id: "a", x: 0, y: 0, score: 0.9 },
    { id: "b", x: 5, y: 5, score: 0.2 },
    { id: "c", x: 9, y: 9, score: 0.5 },
  ];
  const ids = (filter) => rows.filter(filter).map((d) => d.id);

  it("keeps every paper by default and none when off", () => {
    expect(ids(labelFilter())).toEqual(["a", "b", "c"]);
    expect(ids(labelFilter({ enabled: false }))).toEqual([]);
  });

  it("keeps only papers drawn in color: brush, relevance cut, pinned neighbours", () => {
    expect(ids(labelFilter({ brush: { x: [4, 10], y: [4, 10] } }))).toEqual([
      "b",
      "c",
    ]);
    expect(ids(labelFilter({ levelCut: 0.4 }))).toEqual(["a", "c"]);
    expect(ids(labelFilter({ focusIds: ["c", "b"], levelCut: 0.4 }))).toEqual([
      "c",
    ]);
  });
});

describe("emphasisIds", () => {
  const rows = [
    { id: "a", score: 0.5 },
    { id: "b", score: 0.9 },
    { id: "c", score: 0.7 },
    { id: "d", score: 0.1 },
  ];

  it("the nearest paper to each query marker, then the strongest matches best first", () => {
    expect(
      emphasisIds(rows, {
        strongCut: 0.5,
        top: 2,
        markers: [{ nearest: [{ id: "d" }, { id: "a" }] }],
      }),
    ).toEqual(["d", "b", "c"]);
  });

  it("nothing without a search", () => {
    expect(emphasisIds(rows)).toEqual([]);
  });
});

describe("labelBudget", () => {
  it("scales with the plot's area", () => {
    expect(labelBudget(800, 600)).toBe(34);
    expect(labelBudget(360, 300)).toBe(7);
  });
});
