// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createRulesStore } from "../src/lib/rules.js";
import { watchButton } from "../src/components/watchButton.js";

const memory = () => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
  };
};

describe("watchButton", () => {
  it("toggles a watch rule and reflects its state", () => {
    const rules = createRulesStore("t", memory(), null);
    const onWatch = vi.fn((rule) => rules.add(rule));
    const onUnwatch = vi.fn((id) => rules.remove([id]));
    const button = watchButton(
      { type: "affiliation", value: "Northeastern University" },
      { rules, onWatch, onUnwatch },
    );
    expect(button.textContent).toContain("Watch");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    button.click();
    expect(onWatch).toHaveBeenCalledWith({
      type: "affiliation",
      value: "Northeastern University",
    });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.textContent).toContain("Watching");
    button.click();
    expect(onUnwatch).toHaveBeenCalledWith(
      "affiliation:northeastern university",
    );
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("does not open or toggle the facet row when clicked", () => {
    const rules = createRulesStore("t", memory(), null);
    const row = document.createElement("div");
    const rowClick = vi.fn();
    row.addEventListener("click", rowClick);
    const button = watchButton(
      { type: "author", value: "Ann" },
      { rules, onWatch: (r) => rules.add(r), onUnwatch: () => {} },
    );
    row.append(button);
    button.click();
    expect(rowClick).not.toHaveBeenCalled();
  });
});
