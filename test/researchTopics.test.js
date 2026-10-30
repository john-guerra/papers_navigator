import { describe, expect, it, vi } from "vitest";
import { createFollowedStore } from "../src/lib/followed.js";
import { createMyPapers, createRulesStore } from "../src/lib/rules.js";
import {
  canDownloadModel,
  refreshTopicRules,
  startTopicRefresh,
  thresholdFor,
  topicMatches,
  topicPreview,
  topicRule,
} from "../src/lib/researchTopics.js";

function memoryStorage() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

const T1 = new Date("2026-10-01T00:00:00Z");
const T2 = new Date("2026-10-02T00:00:00Z");
const DIMS = 2;
const PAPERS = [{ id: "p1" }, { id: "p2" }, { id: "p3" }, { id: "p4" }];
// Unit vectors: dot product with [1, 0] is the first coordinate
const MATRIX = new Float32Array([0.9, 0.436, 0.6, 0.8, 0.3, 0.954, -0.2, 0.98]);
const embedFor = (vector) => vi.fn(async () => vector);

function setup(papers = PAPERS) {
  const storage = memoryStorage();
  const followed = createFollowedStore("conf", storage, null);
  const rules = createRulesStore("conf", storage, null);
  const myPapers = createMyPapers({ followed, rules, papers });
  return { followed, rules, myPapers, storage };
}

describe("topicMatches", () => {
  it("keeps papers at or above the threshold with scores rounded to 4 decimals", () => {
    expect(topicMatches([1, 0], MATRIX, PAPERS, 0.5, DIMS)).toEqual({
      p1: 0.9,
      p2: 0.6,
    });
  });
});

describe("thresholdFor", () => {
  it("is the level's cut rounded down, so every paper at the cut still matches", () => {
    expect(thresholdFor({ strong: 0.61237, good: 0.3 }, "strong")).toBe(0.6123);
    expect(thresholdFor({ strong: 0.6, good: 0.30009 }, "good")).toBe(0.3);
  });
});

describe("topicRule", () => {
  it("builds a research topic rule from the scored program at a level", () => {
    const scored = [
      { id: "p1", score: 0.9 },
      { id: "p2", score: 0.6 },
      { id: "p3", score: 0.3 },
    ];
    const rule = topicRule(
      "llm",
      "good",
      { good: 0.5, strong: 0.7 },
      scored,
      T1,
    );
    expect(rule).toEqual({
      type: "topic",
      value: "llm",
      level: "good",
      threshold: 0.5,
      matches: { p1: 0.9, p2: 0.6 },
      evaluatedOn: T1.toISOString(),
    });
  });
});

describe("topicPreview", () => {
  const scored = [
    { id: "p1", title: "A", score: 0.9 },
    { id: "p2", title: "B", score: 0.6 },
    { id: "p3", title: "C", score: 0.4 },
    { id: "p4", title: "D", score: 0.1 },
  ];
  it("counts papers in and out at a threshold, how many are new to My Papers, and the borderline papers", () => {
    const preview = topicPreview(scored, 0.5, { inMyPapers: new Set(["p1"]) });
    expect(preview).toMatchObject({ count: 2, out: 2, joining: 1, already: 1 });
    expect(preview.lastIn.map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(preview.firstOut.map((p) => p.id)).toEqual(["p3", "p4"]);
  });

  it("compares against the matches of an existing rule", () => {
    const preview = topicPreview(scored, 0.5, {
      current: { p1: 0.9, p3: 0.4 },
    });
    expect(preview).toMatchObject({ added: 1, dropped: 1 });
  });
});

describe("rule store keeps cached matches", () => {
  it("normalizes and persists level, matches and evaluatedOn; topic rules match from their cached matches", () => {
    const { rules, myPapers, storage } = setup();
    myPapers.watch(
      topicRule(
        "llm",
        "good",
        { good: 0.5, strong: 0.8 },
        [
          { id: "p2", score: 0.6 },
          { id: "p3", score: 0.1 },
        ],
        T1,
      ),
      T1,
    );
    expect(myPapers.value.map((d) => [d.id, d.reason, d.new])).toEqual([
      ["p2", "🔍 llm", false],
    ]);
    const again = createRulesStore("conf", storage, null);
    expect(again.value.rules[0]).toMatchObject({
      level: "good",
      threshold: 0.5,
      matches: { p2: 0.6 },
      evaluatedOn: T1.toISOString(),
    });
    expect(rules.value.rules).toHaveLength(1);
  });

  it("drops malformed cached matches (imports are untrusted)", async () => {
    const { normalizeRule } = await import("../src/lib/rules.js");
    const rule = normalizeRule({
      type: "topic",
      value: "x",
      threshold: 0.3,
      level: "bogus",
      matches: { ok: 0.5, bad: "1", "": 0.9, nan: NaN },
      evaluatedOn: "never",
    });
    expect(rule.matches).toEqual({ ok: 0.5 });
    expect(rule.level).toBe("good");
    expect(rule.evaluatedOn).toBeUndefined();
  });

  it("re-saving a watched topic at another level replaces its threshold and matches", () => {
    const { myPapers } = setup();
    const scored = [
      { id: "p1", score: 0.9 },
      { id: "p2", score: 0.6 },
    ];
    const cuts = { good: 0.5, strong: 0.8 };
    myPapers.watch(topicRule("llm", "good", cuts, scored, T1), T1);
    myPapers.watch(topicRule("llm", "strong", cuts, scored, T2), T2);
    expect(myPapers.value.map((d) => d.id)).toEqual(["p1"]);
  });
});

describe("refreshTopicRules", () => {
  it("re-evaluates topic rules against the current program; papers that start matching later are new", async () => {
    const { rules, myPapers } = setup();
    myPapers.watch(
      {
        type: "topic",
        value: "llm",
        threshold: 0.5,
        matches: { p1: 0.9 },
        evaluatedOn: T1.toISOString(),
      },
      T1,
    );
    myPapers.watch({ type: "author", value: "Bo" }, T1);
    const embed = embedFor([1, 0]);
    const updated = await refreshTopicRules({
      rules,
      embed,
      matrix: MATRIX,
      papers: PAPERS,
      dims: DIMS,
      now: T2,
    });
    expect(updated).toBe(1);
    expect(embed).toHaveBeenCalledTimes(1);
    expect(rules.value.rules[0]).toMatchObject({
      matches: { p1: 0.9, p2: 0.6 },
      evaluatedOn: T2.toISOString(),
    });
    expect(myPapers.value.map((d) => [d.id, d.new])).toEqual([
      ["p1", false],
      ["p2", true],
    ]);
  });

  it("evaluates rules that arrived without matches (share link, import) without flagging them new", async () => {
    const { rules, myPapers } = setup();
    myPapers.watch({ type: "topic", value: "llm", threshold: 0.5 }, T1);
    expect(myPapers.value).toEqual([]);
    await refreshTopicRules({
      rules,
      embed: embedFor([1, 0]),
      matrix: MATRIX,
      papers: PAPERS,
      dims: DIMS,
      now: T2,
    });
    expect(myPapers.value.map((d) => [d.id, d.new])).toEqual([
      ["p1", false],
      ["p2", false],
    ]);
  });

  it("only touches unevaluated rules when asked, writes nothing when nothing changed, and skips rules changed meanwhile", async () => {
    const { rules, myPapers } = setup();
    myPapers.watch(
      {
        type: "topic",
        value: "a",
        threshold: 0.5,
        matches: { p1: 0.9, p2: 0.6 },
        evaluatedOn: T1.toISOString(),
      },
      T1,
    );
    const input = vi.fn();
    rules.addEventListener("input", input);
    const embed = embedFor([1, 0]);
    expect(
      await refreshTopicRules({
        rules,
        embed,
        matrix: MATRIX,
        papers: PAPERS,
        dims: DIMS,
        onlyUnevaluated: true,
      }),
    ).toBe(0);
    expect(embed).not.toHaveBeenCalled();
    expect(
      await refreshTopicRules({
        rules,
        embed,
        matrix: MATRIX,
        papers: PAPERS,
        dims: DIMS,
      }),
    ).toBe(0);
    expect(input).not.toHaveBeenCalled();

    // The rule is removed while its query is being embedded
    const slow = vi.fn(async () => {
      rules.remove(["topic:a"]);
      return [0, 1];
    });
    expect(
      await refreshTopicRules({
        rules,
        embed: slow,
        matrix: MATRIX,
        papers: PAPERS,
        dims: DIMS,
      }),
    ).toBe(0);
    expect(rules.value.rules).toEqual([]);
  });
});

describe("canDownloadModel", () => {
  it("is false only when the browser asks to save data", () => {
    expect(canDownloadModel({})).toBe(true);
    expect(canDownloadModel({ connection: { saveData: false } })).toBe(true);
    expect(canDownloadModel({ connection: { saveData: true } })).toBe(false);
  });
});

describe("startTopicRefresh", () => {
  const deps = (rules, nav = {}) => {
    const tasks = [];
    return {
      tasks,
      options: {
        rules,
        papers: PAPERS,
        dims: DIMS,
        nav,
        loadEmbedder: vi.fn(async () => async () => [1, 0]),
        loadMatrix: vi.fn(async () => MATRIX),
        schedule: (task) => tasks.push(task),
      },
    };
  };
  const flush = async (tasks) => {
    while (tasks.length) await tasks.shift()();
  };

  it("does nothing without research topics", async () => {
    const { rules } = setup();
    const { tasks, options } = deps(rules);
    startTopicRefresh(options);
    await flush(tasks);
    expect(options.loadEmbedder).not.toHaveBeenCalled();
  });

  it("skips the model download when the browser asks to save data (cached matches only)", async () => {
    const { rules, myPapers } = setup();
    myPapers.watch({ type: "topic", value: "llm", threshold: 0.5 }, T1);
    const { tasks, options } = deps(rules, { connection: { saveData: true } });
    const status = startTopicRefresh(options);
    await flush(tasks);
    expect(status.value).toBe("save-data");
    expect(options.loadEmbedder).not.toHaveBeenCalled();
  });

  it("loads the model after first paint, re-evaluates, and evaluates rules added later", async () => {
    const { rules, myPapers } = setup();
    myPapers.watch({ type: "topic", value: "llm", threshold: 0.5 }, T1);
    const { tasks, options } = deps(rules);
    const status = startTopicRefresh(options);
    // Nothing runs synchronously: the work waits for the scheduler
    expect(options.loadEmbedder).not.toHaveBeenCalled();
    await flush(tasks);
    expect(status.value).toBe("done");
    expect(myPapers.value.map((d) => d.id)).toEqual(["p1", "p2"]);

    myPapers.watch({ type: "topic", value: "other", threshold: 0.85 }, T2);
    await flush(tasks);
    await vi.waitFor(() =>
      expect(rules.value.rules[1].matches).toEqual({ p1: 0.9 }),
    );
    expect(options.loadEmbedder).toHaveBeenCalledTimes(1);
    status.stop();
  });

  it("reports an error without throwing", async () => {
    const { rules, myPapers } = setup();
    myPapers.watch({ type: "topic", value: "llm", threshold: 0.5 }, T1);
    const { tasks, options } = deps(rules);
    options.loadEmbedder = vi.fn(async () => {
      throw new Error("offline");
    });
    const status = startTopicRefresh(options);
    await flush(tasks);
    expect(status.value).toBe("error");
  });
});
