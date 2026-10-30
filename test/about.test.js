import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  STORAGE_ITEMS,
  conferenceDateRange,
  hostName,
} from "../src/lib/about.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf-8");

/** App sources (pages + lib + components + widgets), not Framework's cache. */
function appSources() {
  const files = ["../src/index.md", "../src/my-papers.md", "../src/authors.md"];
  for (const dir of ["lib", "components", "widgets"])
    for (const name of readdirSync(new URL(`../src/${dir}/`, import.meta.url)))
      if (name.endsWith(".js")) files.push(`../src/${dir}/${name}`);
  return files.map(read).join("\n");
}

describe("About page privacy facts", () => {
  it("lists every localStorage key the app writes", () => {
    const source = appSources();
    const keys = new Set();
    // `papersNavigator:${conferenceId}:followed` and "papersNavigator:theme"
    for (const match of source.matchAll(
      /papersNavigator:(\$\{[^}]+\}:)?([A-Za-z]+)/g,
    ))
      keys.add(`papersNavigator:${match[1] ? "<id>:" : ""}${match[2]}`);
    // the followed store's backup, `${key}:backup`
    if (/`\$\{key\}:backup`/.test(read("../src/lib/followed.js")))
      keys.add("papersNavigator:<id>:followed:backup");
    const listed = STORAGE_ITEMS.map((d) => d.key);
    expect(keys.size).toBeGreaterThan(5);
    for (const key of keys) expect(listed).toContain(key);
  });

  it("the page, nav and service worker know about about.html", () => {
    expect(read("../observablehq.config.js")).toMatch(/path: "\/about"/);
    expect(read("../observablehq.config.js")).toContain('href="./about"');
    expect(read("../src/sw.js")).toContain('"./about.html"');
    expect(read("../src/about.md")).toContain("STORAGE_ITEMS");
  });
});

describe("conferenceDateRange", () => {
  it("formats days within one month", () => {
    expect(
      conferenceDateRange(["2026-11-09", "2026-11-08", "2026-11-13"]),
    ).toBe("November 8–13, 2026");
  });

  it("formats days across months and years", () => {
    expect(conferenceDateRange(["2027-04-29", "2027-05-02"])).toBe(
      "April 29 – May 2, 2027",
    );
    expect(conferenceDateRange(["2026-12-31", "2027-01-01"])).toBe(
      "December 31, 2026 – January 1, 2027",
    );
  });

  it("handles one day and no days", () => {
    expect(conferenceDateRange(["2026-11-08"])).toBe("November 8, 2026");
    expect(conferenceDateRange([])).toBe("");
    expect(conferenceDateRange()).toBe("");
  });
});

describe("hostName", () => {
  it("returns the host without www", () => {
    expect(hostName("https://ieeevis.org/year/2026")).toBe("ieeevis.org");
    expect(hostName("https://www.example.com/x")).toBe("example.com");
    expect(hostName("not a url")).toBe("");
  });
});
