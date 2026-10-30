import { describe, expect, it } from "vitest";
import { createFollowedStore, resolveFollowed } from "../src/lib/followed.js";
import {
  createMyPapers,
  createRulesStore,
  effectiveMyPapers,
  matches,
  normalizeRule,
  ruleReason,
} from "../src/lib/rules.js";
import { shareUrl } from "../src/lib/share.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    data,
  };
}

const KEY = "papersNavigator:conf:rules";
const T1 = new Date("2026-10-01T00:00:00Z");
const T2 = new Date("2026-10-02T00:00:00Z");

const PAPERS = [
  {
    id: "p1",
    shortId: "s1",
    authors: [
      { name: "Ana Pérez", affiliation: "Northeastern University" },
      { name: "Bo Li", affiliation: "MIT" },
    ],
  },
  {
    id: "p2",
    shortId: "s2",
    authors: [{ name: "Bo Li", affiliation: "MIT" }],
  },
  {
    id: "p3",
    shortId: "s3",
    authors: [{ name: "Cy Doe", affiliation: "Northeastern University" }],
  },
  { id: "p4", shortId: "s4", authors: [] },
];

const friend = { type: "author", value: "Bo Li" };
const neu = { type: "affiliation", value: "Northeastern University" };

describe("normalizeRule", () => {
  it("gives each rule a stable id from type and normalized value", () => {
    const a = normalizeRule({ type: "author", value: "  Ana  PÉREZ " }, T1);
    const b = normalizeRule({ type: "author", value: "ana perez" }, T1);
    expect(a.id).toBe(b.id);
    expect(a).toMatchObject({
      type: "author",
      value: "Ana  PÉREZ",
      addedOn: T1.toISOString(),
    });
  });

  it("keeps a topic threshold and rejects unknown types or empty values", () => {
    expect(
      normalizeRule({ type: "topic", value: "llm", threshold: 0.4 }, T1),
    ).toMatchObject({ type: "topic", value: "llm", threshold: 0.4 });
    expect(normalizeRule({ type: "keyword", value: "x" })).toBeNull();
    expect(normalizeRule({ type: "author", value: "  " })).toBeNull();
  });
});

describe("matches", () => {
  it("matches an author by name, ignoring case, accents and spacing", () => {
    const rule = normalizeRule({ type: "author", value: "ana  perez" });
    expect(matches(rule, PAPERS[0])).toBe(true);
    expect(matches(rule, PAPERS[1])).toBe(false);
  });

  it("matches an affiliation by the whole institution name", () => {
    expect(matches(normalizeRule(neu), PAPERS[2])).toBe(true);
    expect(matches(normalizeRule(neu), PAPERS[1])).toBe(false);
    const partial = normalizeRule({ type: "affiliation", value: "University" });
    expect(matches(partial, PAPERS[0])).toBe(false);
  });

  it("matches a topic only from precomputed scores at or above the threshold", () => {
    const rule = normalizeRule({ type: "topic", value: "llm", threshold: 0.5 });
    expect(matches(rule, PAPERS[0])).toBe(false);
    const scores = new Map([
      ["p1", 0.5],
      ["p2", 0.49],
    ]);
    expect(matches(rule, PAPERS[0], { scores })).toBe(true);
    expect(matches(rule, PAPERS[1], { scores })).toBe(false);
    expect(matches(rule, PAPERS[0], { scores: { p1: 0.7 } })).toBe(true);
  });
});

describe("ruleReason", () => {
  it("uses the reason markers from DESIGN.md", () => {
    expect(ruleReason(friend)).toBe("👥 Friend: Bo Li");
    expect(ruleReason(neu)).toBe("🏫 Northeastern University");
    expect(ruleReason({ type: "topic", value: "llm" })).toBe("🔍 llm");
  });
});

describe("effectiveMyPapers", () => {
  const rules = [normalizeRule(friend, T2), normalizeRule(neu, T2)];

  it("is manual adds ∪ rule matches − exceptions, with every reason", () => {
    const followed = [
      { id: "p4", reason: "🔍 maps", addedOn: T1.toISOString() },
      { id: "p2", reason: "By hand", addedOn: T1.toISOString() },
    ];
    const list = effectiveMyPapers(
      { followed, rules, exceptions: ["p3"], seen: ["p1", "p2", "p3"] },
      PAPERS,
    );
    expect(list.map((d) => d.id)).toEqual(["p4", "p2", "p1"]);
    const p2 = list.find((d) => d.id === "p2");
    expect(p2).toMatchObject({
      manual: true,
      reasons: ["By hand", "👥 Friend: Bo Li"],
      reason: "By hand · 👥 Friend: Bo Li",
      addedOn: T1.toISOString(),
      new: false,
    });
    const p1 = list.find((d) => d.id === "p1");
    expect(p1).toMatchObject({
      manual: false,
      ruleIds: [rules[0].id, rules[1].id],
      reasons: ["👥 Friend: Bo Li", "🏫 Northeastern University"],
      addedOn: T2.toISOString(),
    });
  });

  it("a manual entry wins over an exception (pages adding via the followed store keep working)", () => {
    const followed = [{ id: "p3", reason: "x", addedOn: T1.toISOString() }];
    const list = effectiveMyPapers(
      { followed, rules, exceptions: ["p3"], seen: [] },
      PAPERS,
    );
    expect(list.find((d) => d.id === "p3")).toMatchObject({
      reasons: ["x"],
      manual: true,
    });
  });

  it("flags rule-only papers that were not seen as new", () => {
    const followed = [{ id: "p2", reason: "x", addedOn: T1.toISOString() }];
    const list = effectiveMyPapers(
      { followed, rules, exceptions: [], seen: ["p1"] },
      PAPERS,
    );
    const isNew = Object.fromEntries(list.map((d) => [d.id, d.new]));
    expect(isNew).toEqual({ p2: false, p1: false, p3: true });
  });

  it("keeps manual entries missing from the program so resolveFollowed reports them", () => {
    const followed = [{ id: "gone", reason: "x", addedOn: T1.toISOString() }];
    const list = effectiveMyPapers(
      { followed, rules: [], exceptions: [], seen: [] },
      PAPERS,
    );
    expect(resolveFollowed(list, PAPERS).missing.map((d) => d.id)).toEqual([
      "gone",
    ]);
  });
});

describe("createRulesStore", () => {
  it("persists rules, exceptions and seen ids per conference", () => {
    const storage = memoryStorage();
    const store = createRulesStore("conf", storage);
    store.add(friend, T1);
    store.except(["p1"]);
    store.markSeen(["p2"]);
    const again = createRulesStore("conf", storage);
    expect(again.value.rules.map((r) => r.value)).toEqual(["Bo Li"]);
    expect(again.value.exceptions).toEqual(["p1"]);
    expect(again.value.seen).toEqual(["p2"]);
    expect(createRulesStore("other", storage).value.rules).toEqual([]);
  });

  it("adding the same rule twice keeps one, updating its threshold", () => {
    const store = createRulesStore("conf", memoryStorage());
    store.add({ type: "topic", value: "llm", threshold: 0.3 }, T1);
    store.add({ type: "topic", value: "LLM", threshold: 0.6 }, T2);
    expect(store.value.rules).toHaveLength(1);
    expect(store.value.rules[0]).toMatchObject({
      threshold: 0.6,
      addedOn: T1.toISOString(),
    });
  });

  it("removes rules and exceptions, and emits input on every change", () => {
    const store = createRulesStore("conf", memoryStorage());
    let fired = 0;
    store.addEventListener("input", () => fired++);
    const rule = store.add(friend, T1);
    store.except(["p1", "p2"]);
    store.unexcept(["p1"]);
    store.remove([rule.id]);
    expect(store.value.rules).toEqual([]);
    expect(store.value.exceptions).toEqual(["p2"]);
    expect(store.has(rule.id)).toBe(false);
    expect(fired).toBe(4);
  });

  it("ignores invalid rules and loads corrupt storage as empty", () => {
    const store = createRulesStore(
      "conf",
      memoryStorage({ [KEY]: "{not json" }),
    );
    expect(store.value).toEqual({ rules: [], exceptions: [], seen: [] });
    expect(store.add({ type: "nope", value: "x" })).toBeNull();
    expect(store.value.rules).toEqual([]);
  });

  it("does not overwrite another tab's changes and syncs on storage events", () => {
    const storage = memoryStorage();
    const target = new EventTarget();
    const tabA = createRulesStore("conf", storage, target);
    const tabB = createRulesStore("conf", storage, new EventTarget());
    tabB.add(friend, T1);
    tabA.add(neu, T1);
    expect(createRulesStore("conf", storage).value.rules).toHaveLength(2);

    let fired = 0;
    tabA.addEventListener("input", () => fired++);
    tabB.except(["p9"]);
    target.dispatchEvent(Object.assign(new Event("storage"), { key: KEY }));
    expect(tabA.value.exceptions).toEqual(["p9"]);
    expect(fired).toBe(1);
  });
});

describe("createMyPapers", () => {
  function setup(options = {}) {
    const storage = memoryStorage();
    const followed = createFollowedStore("conf", storage, null);
    const rules = createRulesStore("conf", storage, null);
    const myPapers = createMyPapers({
      followed,
      rules,
      papers: PAPERS,
      ...options,
    });
    return { storage, followed, rules, myPapers };
  }

  it("exposes the effective list as .value and emits input when either store changes", () => {
    const { followed, myPapers } = setup();
    let fired = 0;
    myPapers.addEventListener("input", () => fired++);
    followed.add([{ id: "p4" }], "by hand", T1);
    myPapers.watch(friend, T1);
    expect(myPapers.value.map((d) => d.id)).toEqual(["p4", "p1", "p2"]);
    expect(fired).toBeGreaterThanOrEqual(2);
  });

  it("watching a rule does not flag its current matches as new", () => {
    const { myPapers } = setup();
    myPapers.watch(friend, T1);
    expect(myPapers.value.every((d) => !d.new)).toBe(true);
  });

  it("flags papers that start matching after a data update until seen", () => {
    const { followed, rules, myPapers } = setup();
    myPapers.watch(friend, T1);
    const updated = [
      ...PAPERS,
      { id: "p5", authors: [{ name: "Bo Li", affiliation: "MIT" }] },
    ];
    const reloaded = createMyPapers({ followed, rules, papers: updated });
    expect(reloaded.value.filter((d) => d.new).map((d) => d.id)).toEqual([
      "p5",
    ]);
    reloaded.markSeen();
    expect(reloaded.value.some((d) => d.new)).toBe(false);
  });

  it("removing a rule-matched paper by hand keeps it out; adding it back clears that", () => {
    const { followed, rules, myPapers } = setup();
    myPapers.watch(friend, T1);
    followed.add([{ id: "p2" }], "by hand", T1);
    myPapers.remove(["p2", "p4"]);
    expect(myPapers.value.map((d) => d.id)).toEqual(["p1"]);
    expect(followed.value).toEqual([]);
    // only papers a rule matched become exceptions
    expect(rules.value.exceptions).toEqual(["p2"]);
    myPapers.add([{ id: "p2" }], "again", T2);
    expect(rules.value.exceptions).toEqual([]);
    expect(myPapers.has("p2")).toBe(true);
  });

  it("unwatching drops the rule's papers, or keeps them as manual adds when asked", () => {
    const { followed, myPapers } = setup();
    const rule = myPapers.watch(neu, T1);
    myPapers.unwatch([rule.id]);
    expect(myPapers.value).toEqual([]);

    const again = myPapers.watch(neu, T1);
    myPapers.unwatch([again.id], { keepPapers: true }, T2);
    expect(followed.value.map((d) => [d.id, d.reason])).toEqual([
      ["p1", "🏫 Northeastern University"],
      ["p3", "🏫 Northeastern University"],
    ]);
  });

  it("keeping papers of two rules at once keeps both reasons", () => {
    const { followed, myPapers } = setup();
    const a = myPapers.watch(friend, T1);
    const b = myPapers.watch(neu, T1);
    myPapers.unwatch([a.id, b.id], { keepPapers: true }, T2);
    expect(followed.value.find((d) => d.id === "p1").reason).toBe(
      "👥 Friend: Bo Li · 🏫 Northeastern University",
    );
  });

  it("evaluates topic rules with scores supplied by the page", () => {
    const scores = new Map([["p3", 0.8]]);
    const { myPapers } = setup({
      scoresFor: (rule) => (rule.value === "llm" ? scores : null),
    });
    myPapers.watch({ type: "topic", value: "llm", threshold: 0.5 }, T1);
    expect(myPapers.value.map((d) => [d.id, d.reason])).toEqual([
      ["p3", "🔍 llm"],
    ]);
  });

  it("keeps existing consumers working: resolveFollowed and shareUrl accept .value", () => {
    const { myPapers } = setup();
    myPapers.watch(friend, T1);
    const { items } = resolveFollowed(myPapers.value, PAPERS);
    expect(items.map((d) => [d.id, d.reason])).toEqual([
      ["p1", "👥 Friend: Bo Li"],
      ["p2", "👥 Friend: Bo Li"],
    ]);
    expect(shareUrl(myPapers.value, PAPERS, "https://x.test/my-papers")).toBe(
      "https://x.test/my-papers#follow=s1.s2",
    );
  });
});

describe("createMyPapers remove → undo", () => {
  function setup() {
    const storage = memoryStorage();
    const followed = createFollowedStore("conf", storage, null);
    const rules = createRulesStore("conf", storage, null);
    const myPapers = createMyPapers({ followed, rules, papers: PAPERS });
    return { followed, rules, myPapers };
  }

  it("restores a hand-added paper with its original reason and date", () => {
    const { followed, myPapers } = setup();
    followed.add([{ id: "p4" }], "by hand", T1);
    const before = structuredClone(followed.value);
    const undo = myPapers.remove(["p4"]);
    expect(myPapers.has("p4")).toBe(false);
    undo();
    expect(followed.value).toEqual(before);
  });

  it("restores a rule-matched paper by dropping the exception it created", () => {
    const { rules, myPapers } = setup();
    myPapers.watch(friend, T1);
    const undo = myPapers.remove(["p1"]);
    expect(myPapers.has("p1")).toBe(false);
    expect(rules.value.exceptions).toContain("p1");
    undo();
    expect(myPapers.has("p1")).toBe(true);
    expect(rules.value.exceptions).not.toContain("p1");
  });
});

describe("resolveFollowed keeps My Papers fields", () => {
  it("passes reasons, ruleIds, manual and new through to the items", () => {
    const { items } = resolveFollowed(
      [
        {
          id: "p1",
          reason: "a · b",
          reasons: ["a", "b"],
          addedOn: "x",
          ruleIds: ["r"],
          manual: false,
          new: true,
        },
      ],
      [{ id: "p1", title: "T" }],
    );
    expect(items[0]).toMatchObject({
      title: "T",
      reasons: ["a", "b"],
      ruleIds: ["r"],
      manual: false,
      new: true,
    });
  });
});

describe("reason filter", () => {
  const items = [
    { id: "1", manual: true, ruleIds: [] },
    { id: "2", manual: false, ruleIds: ["affiliation:neu"] },
    { id: "3", manual: true, ruleIds: ["affiliation:neu", "author:ann"] },
  ];
  const rules = [
    {
      id: "affiliation:neu",
      type: "affiliation",
      value: "Northeastern University",
    },
    { id: "author:ann", type: "author", value: "Ann" },
  ];
  it("offers All, Added by hand and one option per rule, with counts", async () => {
    const { reasonOptions } = await import("../src/lib/rules.js");
    expect(reasonOptions(items, rules)).toEqual([
      { key: "all", label: "All reasons (3)" },
      { key: "manual", label: "★ Added by hand (2)" },
      { key: "affiliation:neu", label: "🏫 Northeastern University (2)" },
      { key: "author:ann", label: "👥 Friend: Ann (1)" },
    ]);
  });
  it("filters items by the chosen reason", async () => {
    const { filterByReason } = await import("../src/lib/rules.js");
    expect(filterByReason(items, "all").map((d) => d.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(filterByReason(items, "manual").map((d) => d.id)).toEqual([
      "1",
      "3",
    ]);
    expect(filterByReason(items, "author:ann").map((d) => d.id)).toEqual(["3"]);
  });
});
