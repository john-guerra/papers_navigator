// Node environment: the config reads conferences/ through file URLs, which jsdom's URL breaks;
// the pages run in their own JSDOM instead
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { bindMyPapersBadge } from "../src/components/badge.js";
// The real header and head scripts (#110)
import config from "../observablehq.config.js";

let window, document;
/** A fresh page at `path`; scripts run only through window.eval. */
function page(path = "/", head = "") {
  window = new JSDOM(`<!doctype html><head>${head}</head><body></body>`, {
    url: `http://127.0.0.1:3000${path}`,
    runScripts: "outside-only",
  }).window;
  document = window.document;
}

/** The head's inline scripts, in order (classic first, then the module). */
const headScripts = () =>
  [...config.head.matchAll(/<script[^>]*>([^]*?)<\/script>/g)].map((m) => m[1]);

/** Loads the header at `path` as built (cleanUrls: false makes Framework link to "x.html") and
 * runs the head's "current page" script. */
function loadHeaderAt(path) {
  page(path);
  document.body.innerHTML = config.header.replace(
    /href="\.\/(\w[\w-]*)"/g,
    'href="./$1.html"',
  );
  window.eval(headScripts().find((code) => code.includes("aria-current")));
}

describe("navigation (DESIGN.md → Nav bar, #110)", () => {
  it("has a bottom tab bar with the same pages as the top nav, and no ☰ menu", () => {
    page();
    document.body.innerHTML = config.header;
    const hrefs = (selector) =>
      [...document.querySelectorAll(selector)].map((a) =>
        a.getAttribute("href"),
      );
    expect(hrefs(".tabbar a")).toEqual([
      "./",
      "./my-papers",
      "./authors",
      "./about",
    ]);
    expect(hrefs(".tabbar a")).toEqual(hrefs(".navbar-links a"));
    expect(document.querySelector(".tabbar").getAttribute("aria-label")).toBe(
      "Pages",
    );
    expect(document.querySelector(".navbar-toggler")).toBeNull();
    // Both the top nav and the tab bar carry the My Papers badge
    expect(document.querySelectorAll(".badge-my-papers")).toHaveLength(2);
  });

  it.each([
    ["/my-papers.html", "My Papers"],
    ["/", "Explore"],
    ["/index.html", "Explore"],
    ["/authors.html", "Researchers"],
  ])("marks the current page (%s) in both navs", (path, name) => {
    loadHeaderAt(path);
    for (const nav of [".navbar-links", ".tabbar"]) {
      const current = [
        ...document.querySelectorAll(`${nav} a[aria-current="page"]`),
      ];
      expect(current.map((a) => a.textContent.trim())).toEqual([name]);
    }
  });

  it("asks for viewport-fit=cover so the tab bar can respect the safe areas", () => {
    page(
      "/",
      '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">',
    );
    const classic = headScripts().find((code) => code.includes("viewport-fit"));
    // in a block: the script's top-level consts may run twice
    window.eval(`{${classic}}`);
    window.eval(`{${classic}}`); // idempotent
    expect(document.querySelector("meta[name=viewport]").content).toBe(
      "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
    );
  });

  it("keeps both badges live with the My Papers count", () => {
    loadHeaderAt("/authors.html");
    const store = new window.EventTarget();
    let value = [];
    Object.defineProperty(store, "value", { get: () => value });
    const stop = bindMyPapersBadge(store, document);
    const badges = [...document.querySelectorAll(".badge-my-papers")];
    expect(badges.every((b) => b.hidden)).toBe(true);
    value = [{ id: "a" }, { id: "b" }, { id: "c" }];
    store.dispatchEvent(new window.Event("input"));
    expect(badges.map((b) => [b.textContent, b.hidden])).toEqual([
      ["3", false],
      ["3", false],
    ]);
    for (const b of badges)
      expect(b.closest("a").getAttribute("aria-label")).toBe(
        "My Papers, 3 papers",
      );
    stop();
    value = [];
    store.dispatchEvent(new window.Event("input"));
    expect(badges[1].textContent).toBe("3");
  });
});
