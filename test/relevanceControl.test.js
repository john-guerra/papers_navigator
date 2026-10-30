// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { relevanceControl } from "../src/widgets/relevanceControl.js";

describe("relevanceControl Weak", () => {
  it("shows Strong, Good, Weak and All", () => {
    const el = relevanceControl({ strong: 1, good: 2, weak: 5, all: 9 });
    expect(
      [...el.querySelectorAll("button")].map((b) => b.dataset.level),
    ).toEqual(["strong", "good", "weak", "all"]);
    expect(el.textContent).toContain("Weak");
  });
});
