// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { addToFollowed } from "../src/components/addToFollowed.js";
import { createFollowedStore } from "../src/lib/followed.js";

const memory = () => {
  const d = {};
  return { getItem: (k) => d[k] ?? null, setItem: (k, v) => (d[k] = v) };
};

describe("addToFollowed", () => {
  it("adds and removes the selection with its reason", () => {
    const store = createFollowedStore("c", memory());
    const el = addToFollowed(store, [{ id: "a" }, { id: "b" }], {
      label: "Search",
      reason: "🔍 llm",
    });
    const [add, remove] = el.querySelectorAll("button");
    expect(add.textContent).toContain("2");
    add.click();
    expect(store.value.map((d) => [d.id, d.reason])).toEqual([
      ["a", "🔍 llm"],
      ["b", "🔍 llm"],
    ]);
    remove.click();
    expect(store.value).toEqual([]);
  });

  it("disables the buttons for an empty selection", () => {
    const store = createFollowedStore("c", memory());
    const el = addToFollowed(store, [], { label: "Search", reason: "r" });
    expect([...el.querySelectorAll("button")].every((b) => b.disabled)).toBe(true);
  });
});
