// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { relevanceCuts, relevanceCounts } from "../src/lib/search.js";
import { relevanceControl } from "../src/widgets/relevanceControl.js";

describe("relevanceCuts", () => {
  it("uses 0.30 for Good when enough papers clear it, and halfway to the best for Strong", () => {
    const scores = [0.7, 0.5, 0.45, 0.4, 0.35, 0.31, 0.2, 0.1];
    expect(relevanceCuts(scores)).toEqual({ good: 0.3, strong: 0.5 });
  });
  it("falls back to the 10th best score when few papers clear 0.30 (short queries)", () => {
    const scores = [
      0.29, 0.28, 0.27, 0.26, 0.25, 0.24, 0.23, 0.22, 0.21, 0.2, 0.1, 0.05,
    ];
    const { good, strong } = relevanceCuts(scores);
    expect(good).toBe(0.2);
    expect(strong).toBeCloseTo(0.245);
  });
  it("handles no scores", () => {
    expect(relevanceCuts([])).toEqual({ good: 0, strong: 0 });
  });
  it("takes another Good score for longer queries (My research: abstracts score higher)", () => {
    const scores = [0.7, 0.6, 0.55, 0.52, 0.51, 0.5, 0.45, 0.4, 0.35, 0.31];
    expect(relevanceCuts(scores, { good: 0.5 })).toEqual({
      good: 0.5,
      strong: 0.6,
    });
  });
});

describe("relevanceCounts", () => {
  it("counts papers at each level", () => {
    const papers = [0.7, 0.5, 0.45, 0.31, 0.2].map((score) => ({ score }));
    expect(relevanceCounts(papers, { good: 0.3, strong: 0.5 })).toEqual({
      strong: 2,
      good: 4,
      all: 5,
    });
  });
});

describe("relevanceControl", () => {
  it("is a reactive widget whose value is the chosen level, with counts on each segment", () => {
    const el = relevanceControl(
      { strong: 2, good: 4, all: 5 },
      { value: "good" },
    );
    document.body.append(el);
    expect(el.value).toBe("good");
    const labels = [...el.querySelectorAll("button")].map((b) =>
      b.textContent.replace(/\s+/g, " ").trim(),
    );
    expect(labels).toEqual(["Strong 2", "Good 4", "All 5"]);
    expect(el.querySelector('[aria-pressed="true"]').textContent).toContain(
      "Good",
    );
    let fired = 0;
    el.addEventListener("input", () => fired++);
    el.querySelector("button").click();
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
    expect(relevanceCuts([0.3, 0.3, 0.3, 0.3, 0.3, 0.1])).toEqual({
      good: 0.3,
      strong: 0.3,
    });
    expect(relevanceCuts([0.2, 0.1, 0.05])).toEqual({
      good: 0.05,
      strong: 0.125,
    });
    expect(relevanceCuts([0.2, 0.2, 0.2])).toEqual({ good: 0.2, strong: 0.2 });
    expect(
      relevanceCounts(
        [0.3, 0.3, 0.1].map((score) => ({ score })),
        { good: 0.3, strong: 0.3 },
      ),
    ).toEqual({ strong: 2, good: 2, all: 3 });
  });
});

describe("relevanceControl keeps focus", () => {
  it("updates the pressed state in place, so the clicked button keeps focus", () => {
    const el = relevanceControl(
      { strong: 1, good: 2, all: 3 },
      { value: "good" },
    );
    document.body.append(el);
    const strong = el.querySelector("button");
    strong.focus();
    strong.click();
    expect(document.activeElement).toBe(strong);
    expect(strong.getAttribute("aria-pressed")).toBe("true");
    el.remove();
  });
});
