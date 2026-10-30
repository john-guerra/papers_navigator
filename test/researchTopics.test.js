import { describe, expect, it, vi } from "vitest";
import { createFollowedStore } from "../src/lib/followed.js";
import {
  createMyPapers,
  createRulesStore,
  normalizeRule,
} from "../src/lib/rules.js";
import { MAX_ABSTRACT_LENGTH, MAX_ABSTRACTS } from "../src/lib/myResearch.js";
import { encodeShareHash } from "../src/lib/share.js";
import {
  canDownloadModel,
  refreshTopicRules,
  researchRule,
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

describe("My research as a research topic (#27)", () => {
  const ABSTRACTS = ["We study uncertainty.", "We study color."];

  it("researchRule keeps the name as the rule's value and the abstracts on the rule", () => {
    const rule = researchRule(
      " My research ",
      ABSTRACTS,
      "good",
      { good: 0.5, strong: 0.7 },
      [
        { id: "p1", score: 0.9 },
        { id: "p2", score: 0.4 },
      ],
      T1,
    );
    expect(rule).toEqual({
      type: "topic",
      value: "My research",
      research: ABSTRACTS,
      level: "good",
      threshold: 0.5,
      matches: { p1: 0.9 },
      evaluatedOn: T1.toISOString(),
    });
  });

  it("has its own id, so it never collides with a search for the same words", () => {
    const research = normalizeRule({
      type: "topic",
      value: "My research",
      research: ABSTRACTS,
    });
    const search = normalizeRule({ type: "topic", value: "my research" });
    expect(research.id).toBe("research:my research");
    expect(search.id).toBe("topic:my research");
    expect(research.research).toEqual(ABSTRACTS);
    expect(search.research).toBeUndefined();
  });

  it("validates the abstracts (imports are untrusted)", () => {
    const rule = normalizeRule({
      type: "topic",
      value: "Mine",
      research: [
        " ok ",
        42,
        "",
        "x".repeat(MAX_ABSTRACT_LENGTH + 10),
        ...Array(20).fill("y"),
      ],
    });
    expect(rule.research[0]).toBe("ok");
    expect(rule.research[1]).toHaveLength(MAX_ABSTRACT_LENGTH);
    expect(rule.research).toHaveLength(MAX_ABSTRACTS);
    // No usable abstract: a plain research topic
    expect(
      normalizeRule({ type: "topic", value: "Mine", research: [1, ""] }).id,
    ).toBe("topic:mine");
  });

  it("round-trips through the store; re-saving replaces the abstracts", () => {
    const { rules, storage } = setup();
    const rule = { type: "topic", value: "Mine", threshold: 0.5 };
    rules.add({ ...rule, research: ["old"] }, T1);
    rules.add({ ...rule, research: ABSTRACTS }, T2);
    const again = createRulesStore("conf", storage, null);
    expect(again.value.rules).toHaveLength(1);
    expect(again.value.rules[0]).toMatchObject({
      id: "research:mine",
      research: ABSTRACTS,
    });
  });

  it("is re-evaluated from its abstracts (best abstract per paper), never from its name", async () => {
    const { rules, myPapers } = setup();
    myPapers.watch(
      { type: "topic", value: "Mine", research: ["A", "B"], threshold: 0.89 },
      T1,
    );
    const embed = vi.fn(async (text) => (text === "A" ? [1, 0] : [-0.2, 0.98]));
    await refreshTopicRules({
      rules,
      embed,
      matrix: MATRIX,
      papers: PAPERS,
      dims: DIMS,
      now: T2,
    });
    expect(embed.mock.calls.map((c) => c[0])).toEqual(["A", "B"]);
    // p1 via A (0.9); p4 via B (≈1)
    expect(Object.keys(rules.value.rules[0].matches)).toEqual(["p1", "p4"]);
  });

  it("stays out of share links (the abstracts stay on this device)", () => {
    const mine = { type: "topic", value: "Mine", research: ABSTRACTS };
    const hash = encodeShareHash(
      ["a1"],
      [
        { ...mine, level: "good", threshold: 0.5 },
        { type: "topic", value: "llm", level: "good", threshold: 0.3 },
      ],
    );
    expect(hash).toBe("#follow=a1&watch=t:g0.3:llm");
    expect(encodeShareHash([], [mine])).toBe("");
  });
});
