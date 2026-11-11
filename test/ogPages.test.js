// Per-page social cards (scripts/ogPages.js): sample data only, and nothing unescaped in the card
import { describe, expect, it } from "vitest";
import { PAGES, pageCardHtml, samplePapers } from "../scripts/ogPages.js";

describe("ogPages", () => {
  it("has a card for every page but Explore", () => {
    expect(Object.keys(PAGES).sort()).toEqual([
      "/about",
      "/authors",
      "/live",
      "/my-papers",
    ]);
  });
  it("samples one timed paper per session on the given day, at most 8", () => {
    const papers = [
      { id: "a", type: "full", sessionId: "s1", start: "2026-11-10T15:00:00Z" },
      { id: "b", type: "full", sessionId: "s1", start: "2026-11-10T15:15:00Z" },
      {
        id: "c",
        type: "poster",
        sessionId: "s2",
        start: "2026-11-10T15:00:00Z",
      },
      {
        id: "d",
        type: "short",
        sessionId: "s3",
        start: "2026-11-11T15:00:00Z",
      },
      { id: "e", type: "tvcg", sessionId: "s4" },
      {
        id: "f",
        type: "short",
        sessionId: "s5",
        start: "2026-11-10T18:00:00Z",
      },
    ];
    expect(samplePapers(papers, "2026-11-10", "US/Eastern")).toEqual([
      "a",
      "f",
    ]);
  });
  it("escapes the text it puts in the card", () => {
    const html = pageCardHtml({
      name: "A <b>",
      place: "B",
      url: "https://x.org/a?b=<c>",
      heading: "My<br>Papers",
      pitch: "<script>x</script>",
      screenshot: "file:///tmp/a.png",
      phone: true,
      fontsCss: "file:///f.css",
    });
    expect(html).not.toContain("<script>x");
    expect(html).toContain("A &lt;b&gt;");
    expect(html).toContain('class="phone"');
  });
});
