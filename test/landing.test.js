import { describe, expect, it } from "vitest";
import { landingHtml, redirectHtml } from "../scripts/landing.js";

describe("landingHtml", () => {
  const configs = [
    {
      id: "chi2027",
      name: "CHI 2027",
      days: ["2027-04-26", "2027-04-30"],
      deployDir: "papersNavigator/chi2027",
    },
    {
      id: "ieeevis2026",
      name: "IEEE VIS 2026",
      days: ["2026-11-08", "2026-11-13"],
      deployDir: "papersNavigator/ieeevis2026",
    },
  ];

  it("links every conference by its folder, newest first", () => {
    const html = landingHtml(configs);
    expect(html.indexOf("CHI 2027")).toBeLessThan(
      html.indexOf("IEEE VIS 2026"),
    );
    expect(html).toContain('href="./ieeevis2026/"');
    expect(html).toContain('href="./chi2027/"');
  });

  it("escapes conference names", () => {
    expect(
      landingHtml([
        {
          id: "a",
          name: "A <b>",
          days: ["2026-01-01"],
          deployDir: "papersNavigator/a",
        },
      ]),
    ).toContain("A &lt;b&gt;");
  });
});

describe("redirectHtml", () => {
  it("redirects to the new URL keeping query and hash (share links use #follow=)", () => {
    const html = redirectHtml(
      "https://johnguerra.co/viz/papersNavigator/ieeevis2026/",
    );
    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain("location.search + location.hash");
    expect(html).toContain(
      "https://johnguerra.co/viz/papersNavigator/ieeevis2026/",
    );
  });
});
