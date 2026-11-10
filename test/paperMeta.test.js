import { describe, expect, it } from "vitest";
import {
  AWARD_TIERS,
  awardName,
  awardTier,
  enrichPapers,
} from "../src/lib/paperMeta.js";

describe("awardTier (#199)", () => {
  it.each([
    ["best paper", "best"],
    ["best paper award", "best"],
    ["best poster", "best"],
    ["challenge - winner", "best"],
    ["award of excellence", "best"],
    ["honorable mention", "honorable"],
    ["best poster honorable mention", "honorable"],
    [
      "mini-challenge 1: honorable mention for innovative integrated timeline visualization",
      "honorable",
    ],
    ["challenge - runner-up", "honorable"],
    ["best explainable award", "other"],
    [
      "mini-challenge 2: award for innovative support for analytical pivoting",
      "other",
    ],
    ["design challenge: award for bold exploratory visual design", "other"],
  ])("%s → %s", (award, tier) => {
    expect(awardTier(award)).toBe(tier);
  });

  it("is null without an award", () => {
    expect(awardTier(null)).toBeNull();
    expect(awardTier("")).toBeNull();
  });

  it("names each tier with its icon", () => {
    expect(AWARD_TIERS.best.icon).toBe("🏆");
    expect(AWARD_TIERS.honorable.icon).toBe("🏅");
    expect(AWARD_TIERS.other.icon).toBe("🎖️");
  });
});

describe("awardName", () => {
  it("capitalizes the award as the program writes it", () => {
    expect(awardName("best paper")).toBe("Best paper");
    expect(awardName("mini-challenge 2: award for x")).toBe(
      "Mini-challenge 2: award for x",
    );
  });
});

describe("enrichPapers (#199)", () => {
  const conference = {
    timezone: "US/Eastern",
    typeStyles: {
      full: { label: "Full", color: "full" },
      tvcg: { label: "Full", color: "full" },
      short: { label: "Short", color: "short" },
    },
  };

  it("adds the day in the conference timezone, from the session when the paper has no time", () => {
    const [timed, session, none] = enrichPapers(
      [
        // 01:30 UTC Wednesday is still Tuesday in Boston
        { id: "a", type: "full", start: "2026-11-11T01:30:00.000Z" },
        {
          id: "b",
          type: "workshop",
          start: null,
          sessionStart: "2026-11-09T13:00:00+00:00",
        },
        { id: "c", type: "poster" },
      ],
      conference,
    );
    expect(timed.day).toBe("2026-11-10");
    expect(session.day).toBe("2026-11-09");
    expect(none.day).toBeNull();
  });

  it("adds the award tier", () => {
    const [p, q] = enrichPapers(
      [
        { id: "a", award: "best paper" },
        { id: "b", award: null },
      ],
      conference,
    );
    expect(p.awardTier).toBe("best");
    expect(q.awardTier).toBeNull();
  });

  it("adds the pill's short label and color from config, else the type label in neutral", () => {
    const [full, tvcg, workshop] = enrichPapers(
      [
        { id: "a", type: "full", typeLabel: "Full VIS Paper" },
        { id: "b", type: "tvcg", typeLabel: "TVCG Paper" },
        { id: "c", type: "workshop", typeLabel: "Workshop Paper" },
      ],
      conference,
    );
    expect(full).toMatchObject({ typeShort: "Full", typeColor: "full" });
    expect(tvcg).toMatchObject({ typeShort: "Full", typeColor: "full" });
    expect(workshop).toMatchObject({
      typeShort: "Workshop Paper",
      typeColor: "other",
    });
  });

  it("doesn't change the input papers", () => {
    const input = [{ id: "a", type: "full" }];
    enrichPapers(input, conference);
    expect(input[0]).toEqual({ id: "a", type: "full" });
  });
});
