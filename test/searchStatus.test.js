import { describe, expect, it, vi } from "vitest";
import {
  keywordMatches,
  modelState,
  normalizeText,
  queryTerms,
  readyAnnouncement,
  searchMode,
  searchStatusLine,
  watchModel,
} from "../src/lib/searchStatus.js";

const paper = (id, title, extra = {}) => ({
  id,
  title,
  abstract: "",
  keywords: [],
  ...extra,
});

describe("normalizeText / queryTerms", () => {
  it("ignores case and accents", () => {
    expect(normalizeText("Visualización de GRAFOS")).toBe(
      "visualizacion de grafos",
    );
  });

  it("splits a query into distinct terms without stop words", () => {
    expect(queryTerms("LLM agents for the Scientific visualization")).toEqual([
      "llm",
      "agents",
      "scientific",
      "visualization",
    ]);
    expect(queryTerms("  3D  3d VR ")).toEqual(["3d", "vr"]);
    expect(queryTerms("the of")).toEqual([]);
  });
});

describe("keywordMatches", () => {
  const papers = [
    paper("a", "Graph layouts", {
      abstract: "Dimensionality reduction for graphs",
    }),
    paper("b", "Dimensionality Reduction in practice"),
    paper("c", "Colormaps", { keywords: ["Dimensionality reduction"] }),
    paper("d", "Reducing clutter"),
    paper("e", "Dimensionality of data"),
  ];

  it("keeps papers with every term (word prefixes), title matches first, else input order", () => {
    expect(
      keywordMatches(papers, "dimensionality reduction").map((p) => p.id),
    ).toEqual(["b", "a", "c"]);
  });

  it("matches word prefixes only, accent- and case-insensitively", () => {
    const ps = [
      paper("x", "Réduction de dimensión"),
      paper("y", "Introduction"),
    ];
    expect(keywordMatches(ps, "REDUC").map((p) => p.id)).toEqual(["x"]);
    expect(keywordMatches(ps, "dimension").map((p) => p.id)).toEqual(["x"]);
  });

  it("falls back to the papers matching the most terms when none match all", () => {
    expect(
      keywordMatches(papers, "dimensionality zebra").map((p) => p.id),
    ).toEqual(["b", "e", "a", "c"]);
  });

  it("returns nothing when no term matches, and everything for a query without terms", () => {
    expect(keywordMatches(papers, "zebra")).toEqual([]);
    expect(keywordMatches(papers, "the")).toEqual(papers);
  });

  it("treats regex characters literally", () => {
    expect(
      keywordMatches([paper("p", "C++ (and more)")], "c++ ("),
    ).toHaveLength(1);
  });
});

describe("modelState", () => {
  it("reads the model status", () => {
    expect(modelState("loading")).toBe("loading");
    expect(modelState("ready")).toBe("ready");
    expect(modelState("error: failed to fetch")).toBe("error");
  });
});

describe("searchMode", () => {
  it("ranks by meaning once the model is ready", () => {
    expect(searchMode({ modelStatus: "ready", query: "dr" })).toBe("semantic");
    expect(searchMode({ modelStatus: "ready", research: true })).toBe(
      "semantic",
    );
    expect(searchMode({ modelStatus: "ready", query: "  " })).toBe("none");
  });

  it("uses keyword matches for a search until then (loading or failed)", () => {
    expect(searchMode({ modelStatus: "loading", query: "dr" })).toBe("keyword");
    expect(searchMode({ modelStatus: "error: offline", query: "dr" })).toBe(
      "keyword",
    );
    expect(searchMode({ modelStatus: "loading", query: "" })).toBe("none");
  });

  it("leaves My research unranked until the model is ready", () => {
    expect(
      searchMode({ modelStatus: "loading", research: true, query: "" }),
    ).toBe("none");
  });
});

describe("searchStatusLine", () => {
  it("says the program is shown while the model loads", () => {
    expect(searchStatusLine({ modelStatus: "loading", mode: "none" })).toBe(
      "⏳ Loading the language model… showing the full program; results will be ranked by meaning when it's ready",
    );
    expect(searchStatusLine({ modelStatus: "loading", mode: "keyword" })).toBe(
      "⏳ Loading the language model… showing keyword matches until the model is ready",
    );
  });

  it("explains a failed load, offline or not", () => {
    expect(
      searchStatusLine({
        modelStatus: "error: x",
        mode: "none",
        offline: true,
      }),
    ).toBe(
      "Search by meaning is unavailable offline — showing the full program",
    );
    expect(
      searchStatusLine({
        modelStatus: "error: x",
        mode: "keyword",
        offline: true,
      }),
    ).toBe(
      "Search by meaning is unavailable offline — showing keyword matches",
    );
    expect(
      searchStatusLine({
        modelStatus: "error: x",
        mode: "none",
        offline: false,
      }),
    ).toBe(
      "Search by meaning is unavailable (the language model failed to load) — showing the full program",
    );
  });

  it("is silent once the model is ready", () => {
    expect(
      searchStatusLine({ modelStatus: "ready", mode: "semantic" }),
    ).toBeNull();
    expect(searchStatusLine({ modelStatus: "ready", mode: "none" })).toBeNull();
  });
});

describe("readyAnnouncement", () => {
  it("announces the switch to meaning when the model arrives during a ranking", () => {
    expect(readyAnnouncement("loading", "ready", "semantic")).toBe(
      "Ranked by meaning",
    );
    expect(readyAnnouncement("error: offline", "ready", "semantic")).toBe(
      "Ranked by meaning",
    );
  });

  it("stays quiet otherwise (first render, no ranking, a search typed later)", () => {
    expect(readyAnnouncement(null, "ready", "semantic")).toBeNull();
    expect(readyAnnouncement("loading", "ready", "none")).toBeNull();
    expect(readyAnnouncement("ready", "ready", "semantic")).toBeNull();
    expect(readyAnnouncement("loading", "loading", "keyword")).toBeNull();
  });
});

describe("watchModel", () => {
  const fakeWindow = () => {
    const target = new EventTarget();
    return target;
  };

  it("starts after `start`, then reports loading → ready", async () => {
    let release;
    const start = new Promise((r) => (release = r));
    const load = vi.fn(() => Promise.resolve("model"));
    const notify = vi.fn();
    watchModel({ load, notify, start, win: fakeWindow() });
    expect(notify).toHaveBeenLastCalledWith("loading");
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();
    release();
    await vi.waitFor(() => expect(notify).toHaveBeenLastCalledWith("ready"));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reports an error and retries when the browser comes back online", async () => {
    const win = fakeWindow();
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce("model");
    const notify = vi.fn();
    watchModel({ load, notify, win, retryMs: 600_000 });
    await vi.waitFor(() =>
      expect(notify).toHaveBeenLastCalledWith("error: Failed to fetch"),
    );
    win.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(notify).toHaveBeenLastCalledWith("ready"));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("retries on a timer, and stops (no more loads) once disposed", async () => {
    vi.useFakeTimers();
    try {
      const load = vi.fn().mockRejectedValue(new Error("offline"));
      const notify = vi.fn();
      const stop = watchModel({
        load,
        notify,
        win: fakeWindow(),
        retryMs: 1000,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(load).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(load).toHaveBeenCalledTimes(2);
      stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
