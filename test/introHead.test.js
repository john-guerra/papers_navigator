import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import config from "../observablehq.config.js";
import { INTRO_KEY } from "../src/components/intro.js";

// #174: the intro opens on a first visit; once closed it stays closed, from the first paint
describe("the head script puts the intro's state on <html>", () => {
  const classicScript = [
    ...config.head.matchAll(/<script>([^]*?)<\/script>/g),
  ].map((m) => m[1])[0];
  const run = (stored, { throws = false } = {}) => {
    const { window } = new JSDOM(
      `<!doctype html><head><meta name="viewport" content="width=device-width"></head>`,
      { url: "http://127.0.0.1:3000/", runScripts: "outside-only" },
    );
    if (stored != null) window.localStorage.setItem(INTRO_KEY, stored);
    if (throws)
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new Error("SecurityError");
        },
      });
    window.eval(classicScript);
    return window.document.documentElement.dataset.intro;
  };

  it("closed only when the person closed it", () => {
    expect(run("closed")).toBe("closed");
    expect(run("open")).toBe("open");
    expect(run(null)).toBe("open");
    expect(run("junk")).toBe("open");
    expect(run(null, { throws: true })).toBe("open");
  });
});

describe("style.css folds the intro before the page's JS runs", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf-8");
  it("the page opens it by default and the CSS knows the attribute", () => {
    expect(read("../src/index.md")).toMatch(/<details class="lede" open>/);
    const css = read("../src/style.css");
    expect(css).toContain(':root[data-intro="closed"] details.lede');
  });
});
