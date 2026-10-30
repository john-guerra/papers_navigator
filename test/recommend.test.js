import { describe, expect, it, vi } from "vitest";
import {
  createDismissedStore,
  recommendPapers,
  recommendReason,
} from "../src/lib/recommend.js";

const DIMS = 2;
const unit = (deg) => [
  Math.cos((deg * Math.PI) / 180),
  Math.sin((deg * Math.PI) / 180),
];
// Two interests far apart (0° and 90°); "mid" sits between them (45°)
const rows = {
  ml: unit(0),
  hci: unit(90),
  ml2: unit(10),
  hci2: unit(85),
  mid: unit(45),
  far: unit(200),
};
const papers = Object.keys(rows).map((id) => ({ id, title: `Paper ${id}` }));
const matrix = new Float32Array(Object.values(rows).flat());

describe("recommendPapers", () => {
  it("ranks papers outside My Papers by their max similarity to any paper in it", () => {
    const recs = recommendPapers(["ml", "hci"], matrix, papers, { dims: DIMS });
    // max: the near neighbors of each interest come first; the mean would put "mid" first
    expect(recs.map((p) => p.id)).toEqual(["hci2", "ml2", "mid", "far"]);
    expect(recs[0].score).toBeCloseTo(Math.cos((5 * Math.PI) / 180));
  });
  it("says why: the most similar paper in My Papers", () => {
    const recs = recommendPapers(["ml", "hci"], matrix, papers, { dims: DIMS });
    expect(recs.find((p) => p.id === "ml2").because.id).toBe("ml");
    expect(recs.find((p) => p.id === "hci2").because.title).toBe("Paper hci");
  });
  it("leaves out dismissed papers and ids no longer in the program", () => {
    const recs = recommendPapers(["ml", "gone"], matrix, papers, {
      dims: DIMS,
      exclude: new Set(["ml2"]),
    });
    expect(recs.map((p) => p.id)).not.toContain("ml2");
    expect(recs.map((p) => p.id)).not.toContain("ml");
    expect(recs[0].because.id).toBe("ml");
  });
  it("leaves out papers that are already over; papers without a time stay", () => {
    const timed = papers.map((p) =>
      p.id === "hci2"
        ? { ...p, sessionEnd: "2026-11-10T15:00:00Z" } // over
        : p.id === "ml2"
          ? { ...p, end: "2026-11-10T17:00:00Z" } // still on
          : p,
    );
    const now = new Date("2026-11-10T16:00:00Z");
    const ids = recommendPapers(["ml", "hci"], matrix, timed, {
      dims: DIMS,
      now,
    }).map((p) => p.id);
    expect(ids).toEqual(["ml2", "mid", "far"]);
  });
  it("returns [] when My Papers is empty", () => {
    expect(recommendPapers([], matrix, papers, { dims: DIMS })).toEqual([]);
  });
});

describe("recommendReason", () => {
  it("is ✨ Like <title>, shortened for long titles", () => {
    expect(recommendReason({ title: "Short" })).toBe("✨ Like Short");
    const long = recommendReason({ title: "x".repeat(100) });
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("…")).toBe(true);
  });
});

const memoryStorage = () => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    data,
  };
};

describe("createDismissedStore", () => {
  it("persists dismissed ids per conference and emits input", () => {
    const storage = memoryStorage();
    const store = createDismissedStore("conf", storage, null);
    const seen = vi.fn();
    store.addEventListener("input", seen);
    const undo = store.dismiss("a");
    store.dismiss("b");
    store.dismiss("a");
    expect(store.value).toEqual(["a", "b"]);
    expect(
      JSON.parse(storage.data.get("papersNavigator:conf:dismissed")),
    ).toEqual(["a", "b"]);
    expect(seen).toHaveBeenCalledTimes(2);
    undo();
    expect(store.value).toEqual(["b"]);
    expect(createDismissedStore("conf", storage, null).value).toEqual(["b"]);
    expect(createDismissedStore("other", storage, null).value).toEqual([]);
  });
  it("survives a corrupt or missing storage", () => {
    const storage = memoryStorage();
    storage.setItem("papersNavigator:conf:dismissed", "{oops");
    expect(createDismissedStore("conf", storage, null).value).toEqual([]);
    const store = createDismissedStore("conf", undefined, null);
    store.dismiss("a");
    expect(store.value).toEqual(["a"]);
  });
  it("adopts another tab's dismissals", () => {
    const storage = memoryStorage();
    const events = new EventTarget();
    const store = createDismissedStore("conf", storage, events);
    storage.setItem("papersNavigator:conf:dismissed", '["z"]');
    const event = new Event("storage");
    event.key = "papersNavigator:conf:dismissed";
    events.dispatchEvent(event);
    expect(store.value).toEqual(["z"]);
  });
});
