import { describe, expect, it } from "vitest";
import { ogCrops, ogHtml } from "../scripts/og.js";

// Element boxes (CSS px) measured on the live Explore page at 1280×900 after a search (#197)
const boxes = {
  search: { x: 28, y: 114.5, width: 360, height: 44 },
  map: { x: 4, y: 223.34, width: 804, height: 626 },
  legend: { x: 631.5, y: 285.5, width: 120, height: 13.2 },
};

describe("og card (#197)", () => {
  it("crops the search box without its clear button", () => {
    const { search } = ogCrops(boxes);
    expect(search.x).toBeCloseTo(26);
    expect(search.width).toBeLessThan(boxes.search.width - 30);
  });

  it("crops the bottom of the map, where the search bands are", () => {
    const { map } = ogCrops(boxes);
    const bottom = boxes.map.y + boxes.map.height;
    expect(map.y + map.height).toBeLessThan(bottom); // the "Color by" controls start at the edge
    expect(map.y + map.height).toBeGreaterThan(bottom - 20);
    expect(map.x).toBeGreaterThan(boxes.map.x);
    expect(map.x + map.width).toBeLessThanOrEqual(
      boxes.map.x + boxes.map.width,
    );
  });

  it("crops the legend from its title down to the scale labels", () => {
    const { legend } = ogCrops(boxes);
    expect(legend.y).toBeLessThan(boxes.legend.y);
    expect(legend.height).toBeGreaterThan(40);
  });

  it("writes the conference, place, count and URL, escaped", () => {
    const html = ogHtml({
      name: "IEEE VIS 2026",
      place: "Boston",
      count: 488,
      url: "https://johnguerra.co/viz/papersNavigator/ieeevis2026/",
      screenshot: "explore.png",
      crops: ogCrops(boxes),
      fontsCss: "fonts.css",
    });
    expect(html).toContain("IEEE VIS 2026 · Boston");
    expect(html).toContain("All 488 papers");
    expect(html).toContain("johnguerra.co/viz/papersNavigator");
    expect(html).not.toContain("https://");
    expect(
      ogHtml({
        name: "<b>",
        place: "",
        count: 1,
        url: "",
        screenshot: "",
        crops: ogCrops(boxes),
        fontsCss: "",
      }),
    ).not.toContain("<b>");
  });
});
