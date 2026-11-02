import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import config from "../observablehq.config.js";
import { OPEN_SECTIONS_KEY } from "../src/components/collapsibleSections.js";

describe("the head script (#162: folded from the first paint)", () => {
  const classicScript = [
    ...config.head.matchAll(/<script>([^]*?)<\/script>/g),
  ].map((m) => m[1])[0];
  const run = (stored) => {
    const { window } = new JSDOM(
      `<!doctype html><head><meta name="viewport" content="width=device-width"></head>`,
      { url: "http://127.0.0.1:3000/", runScripts: "outside-only" },
    );
    if (stored != null) window.localStorage.setItem(OPEN_SECTIONS_KEY, stored);
    window.eval(classicScript);
    return window.document.documentElement.dataset.openSections;
  };

  it("puts the open sections on <html> before the page draws", () => {
    expect(run('["watching","recommended"]')).toBe("watching recommended");
  });

  it("nothing stored or unreadable: every section folded", () => {
    expect(run(null)).toBe("");
    expect(run("not json")).toBe("");
  });
});
