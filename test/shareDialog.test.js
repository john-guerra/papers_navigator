// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  QR_MAX_PAPERS,
  renderShareBanner,
  renderShareButton,
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

describe("renderShareBanner safe Replace", () => {
  it("says how many you already have and asks inline before replacing", () => {
    const onReplace = vi.fn();
    const el = renderShareBanner(
      { ids: ["a", "b"], unknown: [], already: 1, current: 14 },
      { onMerge: noop, onReplace, onIgnore: noop },
    );
    expect(el.textContent.replace(/\s+/g, " ")).toContain("you already have 1");
    [...el.querySelectorAll("button")]
      .find((b) => b.textContent === "Replace")
      .click();
    expect(onReplace).not.toHaveBeenCalled();
    const text = el.textContent.replace(/\s+/g, " ");
    expect(text).toContain("Replace your 14 papers with these 2?");
    const labels = [...el.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toEqual(["Yes, replace", "Cancel"]);
    [...el.querySelectorAll("button")]
      .find((b) => b.textContent === "Cancel")
      .click();
    expect(
      [...el.querySelectorAll("button")].map((b) => b.textContent),
    ).toEqual(["Merge", "Replace", "Ignore"]);
    [...el.querySelectorAll("button")]
      .find((b) => b.textContent === "Replace")
      .click();
    [...el.querySelectorAll("button")]
      .find((b) => b.textContent === "Yes, replace")
      .click();
    expect(onReplace).toHaveBeenCalledTimes(1);
  });
});

describe("renderShareBanner with watched papers", () => {
  it("says Replace only affects papers added by hand, and focuses Replace after Cancel", () => {
    const el = renderShareBanner(
      { ids: ["a", "b"], unknown: [], already: 0, current: 5, watched: 20 },
      { onMerge: noop, onReplace: noop, onIgnore: noop },
    );
    document.body.append(el);
    [...el.querySelectorAll("button")]
      .find((b) => b.textContent === "Replace")
      .click();
    expect(el.textContent.replace(/\s+/g, " ")).toContain(
      "Replace your 5 papers added by hand with these 2? (The 20 papers from your watches stay.)",
    );
    [...el.querySelectorAll("button")]
      .find((b) => b.textContent === "Cancel")
      .click();
    expect(document.activeElement.textContent).toBe("Replace");
    el.remove();
  });
});

describe("renderShareBanner with watch rules (#49)", () => {
  const watches = [{ type: "affiliation", value: "Northeastern University" }];
  it("mentions shared watches next to the papers", () => {
    const el = renderShareBanner(
      { ids: ["a"], unknown: [], watches },
      { onMerge: noop, onReplace: noop, onIgnore: noop },
    );
    expect(el.textContent.replace(/\s+/g, " ")).toContain(
      "and 1 watch (🏫 Northeastern University)",
    );
  });
  it("offers Add (not Dismiss or Replace) when the link only shares watches", () => {
    const onMerge = vi.fn();
    const el = renderShareBanner(
      { ids: [], unknown: [], watches },
      { onMerge, onReplace: noop, onIgnore: noop },
    );
    const labels = [...el.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toEqual(["Add", "Ignore"]);
    el.querySelector("button").click();
    expect(onMerge).toHaveBeenCalled();
  });
});

describe("renderShareDialog QR limit by link length", () => {
  it("skips the QR code when the link is too long to scan, whatever the paper count", async () => {
    const { renderShareDialog } =
      await import("../src/components/shareDialog.js");
    const el = renderShareDialog(
      `https://example.org/#follow=&watch=${"i:x,".repeat(400)}`,
      { count: 0 },
    );
    expect(el.textContent.replace(/\s+/g, " ")).toMatch(
      /too long for a QR code/i,
    );
  });
});

describe("renderShareButton (#16)", () => {
  it("uses the native share sheet on phones when available", async () => {
    const share = vi.fn(() => Promise.resolve());
    const onFallback = vi.fn();
    const button = renderShareButton({
      narrow: true,
      share,
      url: () => "https://x/#follow=a",
      count: () => 3,
      title: "VIS",
      onFallback,
    });
    expect(button.textContent).toContain("Share list");
    button.click();
    await Promise.resolve();
    expect(share).toHaveBeenCalledWith({
      title: "VIS: My Papers (3)",
      url: "https://x/#follow=a",
    });
    expect(onFallback).not.toHaveBeenCalled();
  });
  it("keeps Send to my phone (QR) on laptops or without navigator.share", () => {
    for (const opts of [
      { narrow: false, share: vi.fn() },
      { narrow: true, share: undefined },
    ]) {
      const onFallback = vi.fn();
      const button = renderShareButton({
        ...opts,
        url: () => "u",
        count: () => 1,
        title: "VIS",
        onFallback,
      });
      expect(button.textContent).toContain("Send to my phone");
      button.click();
      expect(onFallback).toHaveBeenCalled();
      if (opts.share) expect(opts.share).not.toHaveBeenCalled();
    }
  });
  it("falls back to the QR panel if sharing fails (but not when the user cancels)", async () => {
    const onFallback = vi.fn();
    const fail = (name) => () =>
      Promise.reject(Object.assign(new Error(name), { name }));
    renderShareButton({
      narrow: true,
      share: fail("AbortError"),
      url: () => "u",
      count: () => 1,
      title: "VIS",
      onFallback,
    }).click();
    await new Promise((r) => setTimeout(r));
    expect(onFallback).not.toHaveBeenCalled();
    renderShareButton({
      narrow: true,
      share: fail("NotAllowedError"),
      url: () => "u",
      count: () => 1,
      title: "VIS",
      onFallback,
    }).click();
    await new Promise((r) => setTimeout(r));
    expect(onFallback).toHaveBeenCalled();
  });
});

describe("renderShareBanner lazy counts (#52)", () => {
  it("reads current/watched when Replace is clicked, not when the banner is built", () => {
    let current = 3;
    const el = renderShareBanner(
      { ids: ["a"], unknown: [], current: () => current, watched: () => 0 },
      { onMerge: noop, onReplace: noop, onIgnore: noop },
    );
    current = 9;
    [...el.querySelectorAll("button")]
      .find((b) => b.textContent === "Replace")
      .click();
    expect(el.textContent.replace(/\s+/g, " ")).toContain(
      "Replace your 9 papers",
    );
  });
});
