// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { relevanceControl } from "../src/widgets/relevanceControl.js";

const counts = { strong: 1, good: 2, weak: 5, all: 9 };
const levelButtons = (el) => [...el.querySelectorAll("button[data-level]")];

afterEach(() => document.body.replaceChildren());

describe("relevanceControl Loose (#183)", () => {
  it("shows Strong, Good, Loose and All, keeping the weak key", () => {
    const el = relevanceControl(counts);
    expect(levelButtons(el).map((b) => b.dataset.level)).toEqual([
      "strong",
      "good",
      "weak",
      "all",
    ]);
    expect(el.textContent).toContain("Loose");
    expect(el.textContent).not.toContain("Weak");
  });
});

describe("relevanceControl cuts in the toggletip (#183)", () => {
  const open = (el) => {
    document.body.append(el);
    el.querySelector(".toggletip-button").click();
    return el.querySelector('[role="status"]').textContent.replace(/\s+/g, " ");
  };

  it("shows each level's cut, rounded like the % next to papers", () => {
    const cuts = { strong: 0.4651, good: 0.3, weak: 0.2 };
    const text = open(relevanceControl(counts, { cuts: () => cuts }));
    expect(text).toContain("Strong ≥ 47%: the closest matches");
    expect(text).toContain("Good ≥ 30%: clearly related");
    expect(text).toContain("Loose ≥ 20%: loosely related");
    expect(text).toContain("All: every paper, closest first");
  });

  it("reads the cuts when it opens, not when it is built", () => {
    let cuts = { strong: 0.45, good: 0.3, weak: 0.2 };
    const el = relevanceControl(counts, { cuts: () => cuts });
    cuts = { strong: 0.71, good: 0.62, weak: 0.48 };
    const text = open(el);
    expect(text).toContain("Strong ≥ 71%");
    expect(text).toContain("Good ≥ 62%");
    expect(text).toContain("Loose ≥ 48%");
  });
});

describe("relevanceControl short label on phones (#183)", () => {
  it("has a short visible “Match” that screen readers skip", () => {
    const el = relevanceControl(counts);
    const short = el.querySelector(".relevance-label-short");
    expect(short.textContent.trim()).toBe("Match");
    expect(short.getAttribute("aria-hidden")).toBe("true");
    expect(el.getAttribute("aria-labelledby")).toBe(
      el.querySelector(".relevance-label").id,
    );
  });
});

describe("relevanceControl label (#176)", () => {
  it("shows “Match to your search:” and names the group with it, once", () => {
    const el = relevanceControl(counts);
    const label = el.querySelector(".relevance-label");
    expect(label.textContent.trim()).toBe("Match to your search:");
    const group = el.matches('[role="group"]')
      ? el
      : el.querySelector('[role="group"]');
    expect(group.getAttribute("aria-labelledby")).toBe(label.id);
    expect(group.hasAttribute("aria-label")).toBe(false);
    // The level buttons live inside the labelled group
    expect(levelButtons(group)).toHaveLength(4);
  });

  it("says “your research” while My research ranks", () => {
    const el = relevanceControl(counts, { subject: "research" });
    expect(el.querySelector(".relevance-label").textContent.trim()).toBe(
      "Match to your research:",
    );
    const weak = el.querySelector('[data-level="weak"]');
    expect(weak.title).toBe("Loosely related to your research");
  });

  it("gives each level a title hint", () => {
    const el = relevanceControl(counts);
    expect(
      Object.fromEntries(
        levelButtons(el).map((b) => [b.dataset.level, b.title]),
      ),
    ).toEqual({
      strong: "The closest matches to your search",
      good: "Clearly related to your search",
      weak: "Loosely related to your search",
      all: "Every paper, closest first",
    });
  });

  it("explains the levels in a toggletip after the label", () => {
    const el = relevanceControl(counts);
    document.body.append(el);
    const info = el.querySelector(".toggletip-button");
    expect(
      info.compareDocumentPosition(el.querySelector(".relevance-label")) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    expect(info.getAttribute("aria-label")).toBe("About the match levels");
    info.click();
    const text = el
      .querySelector('[role="status"]')
      .textContent.replace(/\s+/g, " ");
    expect(text).toContain(
      "How closely each paper's title and abstract match your search by meaning, not how good the paper is.",
    );
    expect(text).toContain("Strong: the closest matches");
    expect(text).toContain("Good: clearly related");
    expect(text).toContain("Loose: loosely related");
    expect(text).toContain("All: every paper, closest first");
    expect(text).not.toMatch(/\d/);
  });

  it("opening the toggletip doesn't change the level or emit input", () => {
    const el = relevanceControl(counts, { value: "weak" });
    document.body.append(el);
    let fired = 0;
    el.addEventListener("input", () => fired++);
    el.querySelector(".toggletip-button").click();
    expect(fired).toBe(0);
    expect(el.value).toBe("weak");
  });
});
