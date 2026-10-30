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
    // aria-label on a <span> is ignored by screen readers: label the link instead
    expect(document.querySelector("a").getAttribute("aria-label")).toBe("My Papers, 0 papers");
  });
});
