import { describe, expect, it } from "vitest";
import { getConferenceId, loadConferenceConfig } from "../src/lib/conference.js";

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
});
