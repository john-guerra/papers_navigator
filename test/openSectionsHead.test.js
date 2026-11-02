import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import config from "../observablehq.config.js";
import { readFileSync } from "node:fs";
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
    expect(run("null")).toBe("");
    expect(run('{"a":1}')).toBe("");
  });
});

describe("style.css folds every section the page makes collapsible", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf-8");
  it("has a rule for each name passed in my-papers.md", () => {
    const page = read("../src/my-papers.md");
    const call = page.slice(page.indexOf("collapsibleSections(document"));
    const names = [
      ...call.slice(0, call.indexOf("});")).matchAll(/name: "([a-z]+)"/g),
    ].map((m) => m[1]);
    expect(names).toEqual(["watching", "recommended"]);
    const css = read("../src/style.css");
    for (const name of names) {
      expect(css).toContain(
        `:root:not([data-open-sections~="${name}"])\n    .mp-${name}\n    :not(h2, h2 *, :has(h2))`,
      );
    }
  });
});
