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

describe("watchButton variants (DESIGN.md → Researcher profile)", () => {
  it("is a text button in facet rows and a secondary button on a profile", () => {
    const rules = createRulesStore("t", memory(), null);
    const hooks = { rules, onWatch: () => {}, onUnwatch: () => {} };
    const row = watchButton({ type: "author", value: "Ann" }, hooks);
    expect(row.classList.contains("btn-text")).toBe(true);
    const profile = watchButton(
      { type: "author", value: "Ann" },
      { ...hooks, variant: "secondary" },
    );
    expect(profile.classList.contains("btn-text")).toBe(false);
    expect(profile.classList.contains("btn-secondary")).toBe(true);
  });
});

describe("watchButton follows rule changes made elsewhere", () => {
  it("updates when the rules store changes (another tab, Undo)", () => {
    const store = new Map();
    const rules = createRulesStore(
      "t",
      {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => store.set(k, v),
      },
      null,
    );
    const button = watchButton(
      { type: "author", value: "Ann" },
      { rules, onWatch: () => {}, onUnwatch: () => {} },
    );
    document.body.append(button);
    rules.add({ type: "author", value: "Ann" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    rules.remove(["author:ann"]);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    button.remove();
  });
});
