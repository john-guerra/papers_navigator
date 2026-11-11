// The program's colors on Live's sessions (type pills keep #199's): every color the config names
// has light and dark tokens and a rule that applies it, so a new type can't silently fall back to grey
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
].filter(Boolean);

describe("type colors", () => {
  it("pills keep their colors: only Full, Short and Arts are colored", () => {
    const colored = Object.entries(config.typeStyles).filter(
      ([, s]) => s.color,
    );
    expect(Object.fromEntries(colored.map(([t, s]) => [t, s.color]))).toEqual({
      full: "full",
      tvcg: "full",
      "cg&a": "full",
      short: "short",
      visap: "arts",
    });
  });
  it("every session has a color: paper sessions by paper type, events by session type", () => {
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
      expect(config.sessionTypeColors?.[type], type).toBeTruthy();
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
