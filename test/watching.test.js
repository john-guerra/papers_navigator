// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderWatching } from "../src/components/watching.js";

const rules = [
  { id: "author:ann", type: "author", value: "Ann" },
  {
    id: "affiliation:neu",
    type: "affiliation",
    value: "Northeastern University",
  },
];
const setup = (overrides = {}) => {
  const handlers = { onRemove: vi.fn(), onAdd: vi.fn() };
  const el = renderWatching(
    {
      rules,
      countFor: (id) => (id === "author:ann" ? 3 : 22),
      names: { author: ["Ann", "Bo"], affiliation: ["MIT"] },
    },
    { ...handlers, ...overrides },
  );
  document.body.append(el);
  return { el, ...handlers };
};

describe("renderWatching", () => {
  it("lists each rule with the number of papers it keeps", () => {
    const { el } = setup();
    const text = el.textContent.replace(/\s+/g, " ");
    expect(text).toContain("👥 Friend: Ann");
    expect(text).toContain("3 papers");
    expect(text).toContain("🏫 Northeastern University");
    expect(text).toContain("22 papers");
  });

  it("asks inline whether to keep or remove the rule's papers when you stop watching", () => {
    const { el, onRemove } = setup();
    el.querySelector('[data-rule="author:ann"] .stop-watching').click();
    const choices = [
      ...el.querySelectorAll('[data-rule="author:ann"] button'),
    ].map((b) => b.textContent.trim());
    expect(choices).toEqual([
      "Keep its 3 papers",
      "Remove its 3 papers too",
      "Cancel",
    ]);
    el.querySelector('[data-rule="author:ann"] .remove-papers').click();
    expect(onRemove).toHaveBeenCalledWith("author:ann", { keepPapers: false });
  });

  it("cancel puts the Stop watching button back", () => {
    const { el, onRemove } = setup();
    el.querySelector('[data-rule="author:ann"] .stop-watching').click();
    el.querySelector('[data-rule="author:ann"] .cancel').click();
    expect(
      el.querySelector('[data-rule="author:ann"] .stop-watching'),
    ).not.toBeNull();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("adds a friend or an institution from the form, with names from the program", () => {
    const { el, onAdd } = setup();
    const form = el.querySelector("form");
    form.querySelector("select").value = "affiliation";
    form.querySelector("select").dispatchEvent(new Event("change"));
    expect(
      [...el.querySelectorAll("datalist option")].map((o) => o.value),
    ).toEqual(["MIT"]);
    form.querySelector("input").value = " MIT ";
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    expect(onAdd).toHaveBeenCalledWith({ type: "affiliation", value: "MIT" });
  });

  it("explains what watching does when there are no rules", () => {
    const el = renderWatching(
      { rules: [], countFor: () => 0, names: { author: [], affiliation: [] } },
      { onRemove() {}, onAdd() {} },
    );
    expect(el.textContent.replace(/\s+/g, " ")).toContain("always keep their papers in My Papers");
  });
});
