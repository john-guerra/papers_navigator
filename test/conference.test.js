import { describe, expect, it } from "vitest";
import {
  getConferenceId,
  loadConferenceConfig,
} from "../src/lib/conference.js";

describe("conference config", () => {
  it("defaults to ieeevis2026", () => {
    expect(getConferenceId({})).toBe("ieeevis2026");
  });

  it("reads CONFERENCE from the environment", () => {
    expect(getConferenceId({ CONFERENCE: "chi2027" })).toBe("chi2027");
  });

  it("loads the conference timezone", async () => {
    const config = await loadConferenceConfig("ieeevis2026");
    expect(config.timezone).toBe("US/Eastern");
  });

  // #165: chosen by running the search on the VIS 2026 papers (evidence in the PR)
  it("has 6–8 distinct example searches, the default among them", async () => {
    const { defaultQuery, exampleQueries } =
      await loadConferenceConfig("ieeevis2026");
    expect(defaultQuery).toBeTruthy();
    expect(exampleQueries).toContain(defaultQuery);
    // #174: Data literacy, offered first among the chips
    expect(defaultQuery).toBe("Data literacy");
    expect(exampleQueries[0]).toBe(defaultQuery);
    expect(exampleQueries.length).toBeGreaterThanOrEqual(6);
    expect(exampleQueries.length).toBeLessThanOrEqual(8);
    expect(new Set(exampleQueries).size).toBe(exampleQueries.length);
    // "visualization" and "analytics" match almost every VIS paper (e.g. "Visualization
    // literacy" clears the Good cut for 361 of 488, "Visual analytics" for 373), so an
    // example with them doesn't narrow anything
    for (const q of exampleQueries)
      expect(q).not.toMatch(/visuali[sz]ation|analytic/i);
  });
});

describe("publicConfig", () => {
  it("drops server-only deploy fields before the config reaches the browser", async () => {
    const { publicConfig } = await import("../src/lib/conference.js");
    const pub = publicConfig({
      id: "x",
      name: "X",
      deployDir: "papersNavigator/x",
      legacyDirs: ["xPapers"],
      deployPath: "/var/www/a",
    });
    expect(pub).toEqual({ id: "x", name: "X" });
  });
});
