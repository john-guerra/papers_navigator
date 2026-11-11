// The program's type colors (#199, extended): every color the config names has light and dark
// tokens and a rule that applies it, so a new type can't silently fall back to grey
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = JSON.parse(
  readFileSync(
    new URL("../conferences/ieeevis2026/config.json", import.meta.url),
    "utf8",
  ),
);
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
const colors = [
  ...new Set([
    ...Object.values(config.typeStyles).map((s) => s.color),
    ...Object.values(config.sessionTypeColors ?? {}),
  ]),
];

describe("type colors", () => {
  it("every paper type in the program has its own color", () => {
    for (const type of [
      "full",
      "tvcg",
      "cg&a",
      "short",
      "visap",
      "workshop",
      "challenge",
      "poster",
      "invited-talk",
    ])
      expect(config.typeStyles[type]?.color, type).toMatch(/^[a-z][a-z0-9-]*$/);
  });
  it("sessions without papers (plenaries, tutorials, panels, meetups) have one too", () => {
    for (const type of ["plenary", "tutorial", "panel", "meetup", "cluster"])
      expect(config.sessionTypeColors?.[type], type).toBeTruthy();
  });
  it("each color has a light token, a dark token in both dark blocks, and a rule", () => {
    for (const c of colors) {
      const tokens = css.match(new RegExp(`--color-type-${c}:`, "g")) ?? [];
      expect(tokens.length, c).toBe(3); // light, [data-theme=dark], prefers-color-scheme dark
      expect(css, c).toContain(`[data-type-color="${c}"]`);
    }
  });
});
