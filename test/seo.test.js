// SEO and social cards per page: what search engines and link previews read in each <head>
import { describe, expect, it } from "vitest";
import { pageMeta, pageUrl, sitemapXml, PAGE_PATHS } from "../src/lib/seo.js";
import config from "../observablehq.config.js";
import { loadConferenceConfig } from "../src/lib/conference.js";

const conference = {
  id: "ieeevis2026",
  name: "IEEE VIS 2026",
  city: "Boston",
  siteUrl: "https://example.org/viz/papersNavigator/ieeevis2026/",
  ogImage: "og-v2.png",
  pageImages: { "/my-papers": "og-my-papers.png", "/live": "og-live.png" },
};
const meta = (path, title) => pageMeta(conference, { title, path });
const attr = (html, selector) => {
  const [name, value] = selector.split("=");
  const re = new RegExp(`<meta ${name}="${value}" content="([^"]*)">`);
  return html.match(re)?.[1];
};

describe("pageUrl", () => {
  it("is the page's public address (Explore is the folder; .html since cleanUrls is off)", () => {
    expect(pageUrl(conference, "/index")).toBe(conference.siteUrl);
    expect(pageUrl(conference, "/my-papers")).toBe(
      `${conference.siteUrl}my-papers.html`,
    );
  });
});

describe("pageMeta", () => {
  it("gives every page its own description, canonical URL, title and card", () => {
    const seen = new Set();
    for (const path of PAGE_PATHS) {
      const html = meta(path, "X");
      const description = attr(html, "name=description");
      expect(description, path).toBeTruthy();
      expect(description.length, path).toBeLessThanOrEqual(160);
      expect(attr(html, "property=og:description")).toBe(description);
      expect(attr(html, "name=twitter:description")).toBe(description);
      expect(html).toContain(
        `<link rel="canonical" href="${pageUrl(conference, path)}">`,
      );
      expect(attr(html, "property=og:url")).toBe(pageUrl(conference, path));
      seen.add(description);
    }
    expect(seen.size).toBe(PAGE_PATHS.length);
  });

  it("names the tool and its author, so a search for them finds it", () => {
    const html = meta("/index", "Explore");
    expect(attr(html, "property=og:title")).toBe(
      "Explore · IEEE VIS 2026 Papers Navigator",
    );
    expect(attr(html, "name=author")).toBe("John Alexis Guerra Gómez");
    expect(attr(html, "property=og:site_name")).toBe(
      "IEEE VIS 2026 Papers Navigator",
    );
    const about = attr(meta("/about", "About"), "name=description");
    expect(about).toContain("John Alexis Guerra Gómez");
  });

  it("uses the page's own social card, else the conference's", () => {
    expect(attr(meta("/live", "Live"), "property=og:image")).toBe(
      `${conference.siteUrl}og-live.png`,
    );
    expect(attr(meta("/authors", "Researchers"), "property=og:image")).toBe(
      `${conference.siteUrl}og-v2.png`,
    );
    expect(attr(meta("/live", "Live"), "name=twitter:image")).toBe(
      `${conference.siteUrl}og-live.png`,
    );
  });

  it("describes the app in JSON-LD on Explore and About", () => {
    const ld = meta("/index", "Explore").match(
      /<script type="application\/ld\+json">([^<]*)<\/script>/,
    );
    const data = JSON.parse(ld[1]);
    expect(data["@type"]).toBe("WebApplication");
    expect(data.author).toMatchObject({
      "@type": "Person",
      name: "John Alexis Guerra Gómez",
      url: "https://johnguerra.co",
    });
    expect(data.url).toBe(conference.siteUrl);
    expect(meta("/live", "Live")).not.toContain("application/ld+json");
  });

  it("escapes what it writes into attributes and the JSON-LD", () => {
    const html = pageMeta(
      { ...conference, name: `A "B" x</script><script>alert(1)` },
      { title: "X", path: "/index" },
    );
    expect(html).toContain("A &quot;B&quot; x&lt;/script&gt;");
    // one closing tag only: the JSON-LD's own
    expect(html.match(/<\/script/g)).toHaveLength(1);
    expect(html).not.toContain("<script>alert");
  });

  it("describes each card for people who can't see it", () => {
    for (const path of PAGE_PATHS) {
      const html = meta(path, "X");
      const alt = attr(html, "property=og:image:alt");
      expect(alt, path).toMatch(/IEEE VIS 2026 Papers Navigator/);
      expect(attr(html, "name=twitter:image:alt"), path).toBe(alt);
    }
    expect(attr(meta("/index", "Explore"), "property=og:image:alt")).toContain(
      "a search highlighted on the map of all papers",
    );
  });

  it("links the author's other profiles", () => {
    const ld = JSON.parse(
      meta("/about", "About").match(
        /<script type="application\/ld\+json">([^<]*)<\/script>/,
      )[1],
    );
    expect(ld.author.sameAs).toContain("https://github.com/john-guerra");
  });

  it("is nothing for a page it doesn't know, or without a siteUrl", () => {
    expect(meta("/404", "Not found")).toBe("");
    expect(pageMeta({ name: "X" }, { title: "Explore", path: "/index" })).toBe(
      "",
    );
  });
});

describe("the built pages get it", () => {
  it("every page in the nav has its tags, once, and keeps the rest of the head", () => {
    expect(
      config.pages.map((p) => (p.path === "/" ? "/index" : p.path)).sort(),
    ).toEqual([...PAGE_PATHS].sort());
    for (const path of PAGE_PATHS) {
      const head = config.head({ title: "X", path });
      for (const tag of [
        '<meta name="description"',
        '<link rel="canonical"',
        '<meta property="og:title"',
      ])
        expect(head.split(tag).length - 1, `${path} ${tag}`).toBe(1);
      expect(head).toContain('rel="manifest"');
      expect(head).toContain("serviceWorker");
    }
  });

  it("the config's head writes each page's tags", async () => {
    const conf = await loadConferenceConfig();
    const head = config.head({ title: "Live", data: {}, path: "/live" });
    expect(head).toContain(
      `<link rel="canonical" href="${conf.siteUrl}live.html">`,
    );
    expect(head).toContain('<meta name="description"');
    // the rest of the head is still there
    expect(head).toContain('rel="manifest"');
  });
  it("search titles say Papers Navigator", () => {
    expect(config.title).toMatch(/Papers Navigator$/);
  });
});

describe("sitemapXml", () => {
  it("lists every page by its public URL", () => {
    const xml = sitemapXml(conference);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    for (const path of PAGE_PATHS)
      expect(xml).toContain(`<loc>${pageUrl(conference, path)}</loc>`);
  });
});

describe("writeSitemap", () => {
  it("writes sitemap.xml at the root of dist", async () => {
    const { mkdtemp, readFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { writeSitemap } = await import("../scripts/copyStatic.js");
    const dist = await mkdtemp(join(tmpdir(), "sitemap-"));
    await writeSitemap(conference, dist);
    expect(await readFile(join(dist, "sitemap.xml"), "utf8")).toBe(
      sitemapXml(conference),
    );
  });
});
