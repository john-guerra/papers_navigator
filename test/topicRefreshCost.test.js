import { describe, expect, it, vi } from "vitest";
import { createFollowedStore } from "../src/lib/followed.js";
import {
  createMyPapers,
  createRulesStore,
  normalizeRule,
} from "../src/lib/rules.js";
import { createVectorCache } from "../src/lib/myResearch.js";
import {
  refreshTopicRules,
  startTopicRefresh,
} from "../src/lib/researchTopics.js";

function memoryStorage() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => delete data[k],
  };
}

const T1 = new Date("2026-10-01T00:00:00Z");
const DIMS = 2;
const PAPERS = [{ id: "p1" }, { id: "p2" }, { id: "p3" }, { id: "p4" }];
const MATRIX = new Float32Array([0.9, 0.436, 0.6, 0.8, 0.3, 0.954, -0.2, 0.98]);

function setup() {
  const storage = memoryStorage();
  const followed = createFollowedStore("conf", storage, null);
  const rules = createRulesStore("conf", storage, null);
  const myPapers = createMyPapers({ followed, rules, papers: PAPERS });
  return { rules, myPapers, storage };
}
const run = (rules, embed, extra = {}) =>
  refreshTopicRules({
    rules,
    embed,
    matrix: MATRIX,
    papers: PAPERS,
    dims: DIMS,
    now: T1,
    ...extra,
  });

describe("research topics are only re-evaluated when the program or the rule changes", () => {
  it("records the program a rule was evaluated against and skips it next time", async () => {
    const { rules, myPapers } = setup();
    myPapers.watch({ type: "topic", value: "llm", threshold: 0.5 }, T1);
    const embed = vi.fn(async () => [1, 0]);
    await run(rules, embed, { program: "prog-1" });
    expect(rules.value.rules[0].program).toBe("prog-1");
    await run(rules, embed, { program: "prog-1" });
    expect(embed).toHaveBeenCalledTimes(1);
    // A new program (re-scrape): evaluated again, even if its matches stay the same
    await run(rules, embed, { program: "prog-2" });
    expect(embed).toHaveBeenCalledTimes(2);
    expect(rules.value.rules[0].program).toBe("prog-2");
  });

  it("keeps the program through storage and drops it when a re-save changes the threshold", () => {
    const { rules, storage } = setup();
    rules.add(
      {
        type: "topic",
        value: "llm",
        threshold: 0.5,
        matches: { p1: 0.9 },
        evaluatedOn: T1.toISOString(),
        program: "prog-1",
      },
      T1,
    );
    expect(createRulesStore("conf", storage, null).value.rules[0].program).toBe(
      "prog-1",
    );
    rules.add({ type: "topic", value: "llm", threshold: 0.7 }, T1);
    expect(rules.value.rules[0].program).toBeUndefined();
    expect(
      normalizeRule({ type: "topic", value: "x", program: "z".repeat(200) })
        .program,
    ).toBeUndefined();
  });

  it("reuses cached abstract vectors instead of re-embedding a My research topic", async () => {
    const { rules, myPapers } = setup();
    myPapers.watch(
      { type: "topic", value: "Mine", research: ["A", "B"], threshold: 0.89 },
      T1,
    );
    const vectorCache = createVectorCache("conf", memoryStorage());
    const embed = vi.fn(async (t) => (t === "A" ? [1, 0] : [-0.2, 0.98]));
    await run(rules, embed, { program: "prog-1", vectorCache });
    expect(embed).toHaveBeenCalledTimes(2);
    await run(rules, embed, { program: "prog-2", vectorCache });
    expect(embed).toHaveBeenCalledTimes(2);
    expect(Object.keys(rules.value.rules[0].matches)).toEqual(["p1", "p4"]);
  });
});

describe("startTopicRefresh cost", () => {
  it("doesn't load the model when every topic is current for this program", async () => {
    const { rules, myPapers } = setup();
    myPapers.watch({ type: "topic", value: "llm", threshold: 0.5 }, T1);
    const tasks = [];
    const options = {
      rules,
      papers: PAPERS,
      dims: DIMS,
      nav: {},
      loadEmbedder: vi.fn(async () => async () => [1, 0]),
      loadMatrix: vi.fn(async () => MATRIX),
      schedule: (task) => tasks.push(task),
      vectorCache: createVectorCache("conf", memoryStorage()),
    };
    const flush = async () => {
      while (tasks.length) await tasks.shift()();
    };
    startTopicRefresh(options).stop();
    await flush();
    expect(options.loadEmbedder).toHaveBeenCalledTimes(1);
    expect(rules.value.rules[0].program).toBeTruthy();

    // Next visit
    options.loadEmbedder.mockClear();
    const status = startTopicRefresh(options);
    await flush();
    expect(status.value).toBe("done");
    expect(options.loadEmbedder).not.toHaveBeenCalled();
    status.stop();
  });
});
