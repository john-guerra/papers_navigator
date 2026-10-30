// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { bindMyPapersBadge } from "../src/components/badge.js";

describe("bindMyPapersBadge", () => {
  it("shows the live My Papers count in the navbar badge", () => {
    document.body.innerHTML =
      '<a href="./my-papers"><span class="badge-my-papers" hidden></span></a>';
    const store = new EventTarget();
    let value = [{ id: "a" }];
    Object.defineProperty(store, "value", { get: () => value });
    bindMyPapersBadge(store);
    const badge = document.querySelector(".badge-my-papers");
    expect(badge.textContent).toBe("1");
    expect(badge.hidden).toBe(false);
    value = [];
    store.dispatchEvent(new Event("input"));
    expect(badge.hidden).toBe(true);
    expect(badge.getAttribute("aria-label")).toBe("0 papers in My Papers");
  });
});
