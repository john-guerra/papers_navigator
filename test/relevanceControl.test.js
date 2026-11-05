// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { relevanceControl } from "../src/widgets/relevanceControl.js";

const counts = { strong: 1, good: 2, weak: 5, all: 9 };
const levelButtons = (el) => [...el.querySelectorAll("button[data-level]")];

afterEach(() => document.body.replaceChildren());

describe("relevanceControl Weak", () => {
  it("shows Strong, Good, Weak and All", () => {
    const el = relevanceControl(counts);
    expect(levelButtons(el).map((b) => b.dataset.level)).toEqual([
      "strong",
      "good",
      "weak",
      "all",
    ]);
    expect(el.textContent).toContain("Weak");
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
    expect(text).toContain("Weak: loosely related");
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
