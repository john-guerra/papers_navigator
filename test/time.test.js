import { describe, expect, it } from "vitest";
import { conferenceZone, formatWhen, zoneLabel } from "../src/lib/time.js";

describe('zoneLabel (DESIGN.md → Vocabulary: always "ET")', () => {
  it("names US zones generically, never EST/EDT", () => {
    expect(zoneLabel("US/Eastern")).toBe("ET");
    expect(zoneLabel("America/New_York")).toBe("ET");
    expect(zoneLabel("America/Los_Angeles")).toBe("PT");
  });

  it("prefers the conference config's label", () => {
    expect(zoneLabel("Europe/Berlin", "CET")).toBe("CET");
    expect(zoneLabel("US/Eastern", "ET")).toBe("ET");
  });

  it("falls back to the short abbreviation when the generic name isn't a code", () => {
    // shortGeneric says "Germany Time" / "United Kingdom Time": too long for a meta line
    expect(zoneLabel("Europe/Berlin")).toMatch(/^(GMT\+[12]|CES?T)$/);
    expect(zoneLabel("Europe/London")).toMatch(/^(GMT(\+1)?|BST)$/);
    expect(zoneLabel("Asia/Tokyo")).toMatch(/^(GMT\+9|JST)$/);
  });
});

describe("conferenceZone", () => {
  it("is the config's timezoneLabel, else derived from its timezone", () => {
    expect(conferenceZone({ timezone: "US/Eastern" })).toBe("ET");
    expect(
      conferenceZone({ timezone: "Europe/Berlin", timezoneLabel: "CET" }),
    ).toBe("CET");
    expect(
      conferenceZone({ timezone: "Europe/London", timezoneLabel: "UK time" }),
    ).toBe("UK time");
    expect(conferenceZone({ timezone: "Europe/Berlin" })).not.toContain(
      "Germany",
    );
  });
});

describe("formatWhen", () => {
  it("is day, 24h time and the zone in the conference timezone", () => {
    // 15:00 UTC = 10:00 in Boston (EST, after Nov 1)
    expect(formatWhen("2026-11-10T15:00:00Z", "US/Eastern")).toBe(
      "Tue Nov 10 10:00 ET",
    );
    // in summer it's still "ET", not "EDT"
    expect(formatWhen("2026-07-01T14:00:00Z", "US/Eastern")).toBe(
      "Wed Jul 1 10:00 ET",
    );
  });

  it("uses the given label and is empty without a time", () => {
    expect(formatWhen("2026-11-10T09:00:00Z", "Europe/Berlin", "CET")).toBe(
      "Tue Nov 10 10:00 CET",
    );
    expect(formatWhen(null, "US/Eastern")).toBe("");
  });
});
