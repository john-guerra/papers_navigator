// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  QR_MAX_PAPERS,
  renderShareBanner,
  renderShareDialog,
} from "../src/components/shareDialog.js";

const noop = () => {};

describe("renderShareBanner", () => {
  it("offers Merge and Replace when papers resolve", () => {
    const el = renderShareBanner(
      { ids: ["a"], unknown: [] },
      { onMerge: noop, onReplace: noop, onIgnore: noop },
    );
    expect(
      [...el.querySelectorAll("button")].map((b) => b.textContent),
    ).toEqual(["Merge", "Replace", "Ignore"]);
  });

  it("never offers Replace when no shared paper resolves", () => {
    const el = renderShareBanner(
      { ids: [], unknown: ["zz"] },
      { onMerge: noop, onReplace: noop, onIgnore: noop },
    );
    const labels = [...el.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toEqual(["Dismiss"]);
    expect(el.textContent.replace(/\s+/g, " ")).toContain(
      "none of them are in the current program",
    );
  });
});

describe("renderShareDialog", () => {
  it("skips the QR code and explains why for long lists", () => {
    const el = renderShareDialog("https://x.test/#follow=a", {
      count: QR_MAX_PAPERS + 1,
    });
    expect(el.querySelector("canvas")).toBeNull();
    expect(el.textContent.replace(/\s+/g, " ")).toContain(
      "too many papers for a QR code",
    );
    expect(el.querySelector("input").value).toBe("https://x.test/#follow=a");
  });
});
