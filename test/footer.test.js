// The site footer (#189): credits, license, source and where to send feedback, with no
// third-party requests (the service worker and the About page's privacy promises rely on it).
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import config from "../observablehq.config.js";

const footer = () =>
  new JSDOM(`<!doctype html><footer>${config.footer}</footer>`).window.document
    .body.firstElementChild;

describe("the site footer (#189)", () => {
  it("loads nothing: no images, scripts, styles, frames or src attributes", () => {
    const el = footer();
    expect(
      el.querySelectorAll(
        "img, script, link, style, iframe, object, embed, picture, video, audio, use, image",
      ),
    ).toHaveLength(0);
    expect(el.querySelectorAll("[src], [srcset], [style]")).toHaveLength(0);
    expect(config.footer).not.toMatch(/url\(/);
  });

  it("links the social accounts John uses for feedback, as in the CHI navigator", () => {
    const hrefs = [...footer().querySelectorAll("a")].map((a) => a.href);
    for (const href of [
      "https://bsky.app/profile/johnguerra.bsky.social",
      "https://vis.social/@jguerra",
      "https://www.linkedin.com/in/dutoguerra/",
      "https://twitter.com/duto_guerra",
      "https://twitter.com/guerravis",
    ])
      expect(hrefs).toContain(href);
  });

  it("credits John, the MIT license and the source code, and keeps About & privacy", () => {
    const el = footer();
    const hrefs = [...el.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toContain("https://johnguerra.co");
    expect(hrefs).toContain("https://github.com/john-guerra/papers_navigator");
    expect(hrefs).toContain(
      "https://github.com/john-guerra/papers_navigator/blob/main/LICENSE",
    );
    expect(hrefs).toContain("./about#privacy");
    expect(el.textContent).toContain("John Alexis Guerra Gómez");
    expect(el.textContent).toContain("MIT License");
    expect(el.textContent).toContain("About & privacy");
  });

  it("opens external links safely and passes nothing in their URLs", () => {
    const external = [...footer().querySelectorAll("a")].filter((a) =>
      a.getAttribute("href").startsWith("http"),
    );
    expect(external.length).toBeGreaterThan(0);
    for (const a of external) {
      expect(a.getAttribute("rel")?.split(" ")).toContain("noopener");
      expect(a.href).not.toMatch(/[?#]/);
    }
  });

  it("icons are inline, decorative and in the text color; every link has visible text", () => {
    const el = footer();
    const svgs = [...el.querySelectorAll("svg")];
    expect(svgs.length).toBeGreaterThanOrEqual(6);
    for (const svg of svgs) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.getAttribute("focusable")).toBe("false");
      expect(svg.getAttribute("fill")).toBe("currentColor");
    }
    for (const a of el.querySelectorAll("a")) {
      const clone = a.cloneNode(true);
      clone.querySelectorAll("svg, .sr-only").forEach((n) => n.remove());
      expect(clone.textContent.trim()).not.toBe("");
    }
  });
});
