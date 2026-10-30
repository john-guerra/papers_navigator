import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COARSE_QUERY,
  PHONE_QUERY,
  STACKED_QUERY,
  TWO_COLUMN_QUERY,
  matches,
} from "../src/lib/breakpoints.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf-8");
const filesIn = (dir, ext) =>
  readdirSync(new URL(dir, root))
    .filter((f) => f.endsWith(ext))
    .map((f) => `${dir}${f}`);

describe("breakpoints (DESIGN.md → Layout)", () => {
  it("phone is < 640px, stacked (phone + tablet) < 1024px", () => {
    expect(PHONE_QUERY).toBe("(max-width: 639.98px)");
    expect(STACKED_QUERY).toBe("(max-width: 1023.98px)");
    expect(COARSE_QUERY).toBe("(pointer: coarse)");
    expect(TWO_COLUMN_QUERY).toBe("not all and (max-width: 1023.98px)");
  });

  it("matches() is false without matchMedia and asks it otherwise", () => {
    expect(matches(PHONE_QUERY, {})).toBe(false);
    const win = { matchMedia: (q) => ({ matches: q === PHONE_QUERY }) };
    expect(matches(PHONE_QUERY, win)).toBe(true);
    expect(matches(STACKED_QUERY, win)).toBe(false);
  });

  it("every stylesheet, widget and page uses only those widths", () => {
    const sources = [
      ...filesIn("src/", ".css"),
      ...filesIn("src/", ".md"),
      ...filesIn("src/widgets/", ".js"),
      ...filesIn("src/components/", ".js"),
    ];
    const widths = new Set();
    for (const file of sources)
      for (const [, w] of read(file).matchAll(
        /(?:max|min)-width:\s*([\d.]+)px\)/g,
      ))
        widths.add(`${file}: ${w}`);
    const odd = [...widths].filter(
      (w) => !w.endsWith(": 639.98") && !w.endsWith(": 1023.98"),
    );
    expect(odd).toEqual([]);
  });
});
