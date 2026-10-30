import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FONTS, selectFaces } from "../scripts/fonts.js";

const source = `/* newsreader-vietnamese-opsz-italic */
@font-face {
  font-family: 'Newsreader Variable';
  font-style: italic;
  font-display: swap;
  font-weight: 200 800;
  src: url(./files/newsreader-vietnamese-opsz-italic.woff2) format('woff2-variations');
  unicode-range: U+1EA0-1EF9;
}

/* newsreader-cyrillic-opsz-italic */
@font-face {
  font-family: 'Newsreader Variable';
  font-style: italic;
  font-display: swap;
  font-weight: 200 800;
  src: url(./files/newsreader-cyrillic-opsz-italic.woff2) format('woff2-variations');
  unicode-range: U+0400-045F;
}`;

describe("self-hosted fonts (#91)", () => {
  it("keeps the wanted subsets, under the DESIGN.md family name", () => {
    const { css, files } = selectFaces(source, FONTS[0]);
    expect(files).toEqual(["newsreader-vietnamese-opsz-italic.woff2"]);
    expect(css).toContain('font-family: "Newsreader";');
    expect(css).toContain("font-style: italic;");
    expect(css).toContain("font-weight: 200 800;");
    expect(css).toContain(
      'src: url("./newsreader-vietnamese-opsz-italic.woff2") format("woff2");',
    );
    expect(css).toContain("unicode-range: U+1EA0-1EF9;");
    expect(css).not.toContain("cyrillic");
  });

  it("commits every font file src/fonts/fonts.css names, and no other", () => {
    const dir = new URL("../src/fonts/", import.meta.url);
    const css = readFileSync(new URL("fonts.css", dir), "utf8");
    const named = [...css.matchAll(/url\("\.\/([^"]+)"\)/g)].map((m) => m[1]);
    const committed = readdirSync(dir).filter((f) => f.endsWith(".woff2"));
    expect(named.sort()).toEqual(committed.sort());
    expect(css).not.toContain("googleapis");
  });
});
