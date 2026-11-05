// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { relevanceCuts, relevanceCounts } from "../src/lib/search.js";
import { relevanceControl } from "../src/widgets/relevanceControl.js";

describe("relevanceCuts", () => {
  // #186: fixed cuts, so a level (and its color, #184) means the same % in every search
  it("uses fixed cuts: Strong 0.45, Good 0.30, Loose 0.20, whatever the best match", () => {
    for (const best of [0.7, 0.5]) {
      const scores = [best, 0.46, 0.45, 0.4, 0.35, 0.31, 0.2, 0.1];
      expect(relevanceCuts(scores)).toMatchObject({ good: 0.3, strong: 0.45 });
      expect(relevanceCuts(scores).weak).toBeCloseTo(0.2);
    }
  });
  it("falls back to the 10th best score when few papers clear 0.30 (short queries)", () => {
    const scores = [
      0.29, 0.28, 0.27, 0.26, 0.25, 0.24, 0.23, 0.22, 0.21, 0.2, 0.1, 0.05,
    ];
    const { good, strong } = relevanceCuts(scores);
    expect(good).toBe(0.2);
    // Strong stays 0.45: nothing matches strongly, and the control says so (0)
    expect(strong).toBe(0.45);
  });
  it("handles no scores", () => {
    expect(relevanceCuts([])).toEqual({ good: 0, strong: 0, weak: 0 });
  });
});

describe("relevanceCounts", () => {
  it("counts papers at each level", () => {
    const papers = [0.7, 0.5, 0.45, 0.31, 0.2].map((score) => ({ score }));
    expect(relevanceCounts(papers, { good: 0.3, strong: 0.5 })).toMatchObject({
      strong: 2,
      good: 4,
      all: 5,
    });
  });
});

describe("relevanceControl", () => {
  it("is a reactive widget whose value is the chosen level, with counts on each segment", () => {
    const el = relevanceControl(
      { strong: 2, good: 4, weak: 5, all: 5 },
      { value: "good" },
    );
    document.body.append(el);
    expect(el.value).toBe("good");
    const labels = [...el.querySelectorAll("button[data-level]")].map((b) =>
      b.textContent.replace(/\s+/g, " ").trim(),
    );
    expect(labels).toEqual(["Strong 2", "Good 4", "Weak 5", "All 5"]);
    expect(el.querySelector('[aria-pressed="true"]').textContent).toContain(
      "Good",
    );
    let fired = 0;
    el.addEventListener("input", () => fired++);
    el.querySelector("button[data-level]").click();
    expect(el.value).toBe("strong");
    expect(fired).toBe(1);
    el.value = "all";
    el.dispatchEvent(new Event("input"));
    expect(el.querySelector('[aria-pressed="true"]').textContent).toContain(
      "All",
    );
    el.remove();
  });
});

describe("relevanceCuts edge cases", () => {
  it("keeps papers tied at the cut, handles few papers and equal scores", () => {
    // Strong is fixed at 0.45 (#186), whatever Good falls back to
    expect(relevanceCuts([0.3, 0.3, 0.3, 0.3, 0.3, 0.1])).toMatchObject({
      good: 0.3,
      strong: 0.45,
    });
    expect(relevanceCuts([0.2, 0.1, 0.05])).toMatchObject({
      good: 0.05,
      strong: 0.45,
    });
    expect(relevanceCuts([0.2, 0.2, 0.2])).toMatchObject({
      good: 0.2,
      strong: 0.45,
    });
    // A fallback Good above 0.45 can't happen (it only applies when < 5 papers reach 0.30),
    // but Strong never drops below Good
    const cuts = relevanceCuts([0.9, 0.8, 0.7, 0.6, 0.29]);
    expect(cuts.strong).toBeGreaterThanOrEqual(cuts.good);
    expect(
      relevanceCounts(
        [0.3, 0.3, 0.1].map((score) => ({ score })),
        { good: 0.3, strong: 0.3 },
      ),
    ).toMatchObject({ strong: 2, good: 2, all: 3 });
  });
});

describe("relevanceControl keeps focus", () => {
  it("updates the pressed state in place, so the clicked button keeps focus", () => {
    const el = relevanceControl(
      { strong: 1, good: 2, all: 3 },
      { value: "good" },
    );
    document.body.append(el);
    const strong = el.querySelector("button[data-level]");
    strong.focus();
    strong.click();
    expect(document.activeElement).toBe(strong);
    expect(strong.getAttribute("aria-pressed")).toBe("true");
    el.remove();
  });
});
