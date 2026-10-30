import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { copyFonts, copyStatic, staticFiles } from "../scripts/copyStatic.js";

describe("copyStatic (#18)", () => {
  it("lists the conference's og image", () => {
    expect(staticFiles({ ogImage: "og.png" })).toEqual(["og.png"]);
    expect(staticFiles({})).toEqual([]);
    // never outside src/
    expect(staticFiles({ ogImage: "../secret.png" })).toEqual([]);
  });
  it("copies listed files from src to dist", async () => {
    const root = await mkdtemp(join(tmpdir(), "copy-static-"));
    await mkdir(join(root, "src"));
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "src", "og.png"), "png");
    await copyStatic(["og.png"], join(root, "src"), join(root, "dist"));
    expect(await readFile(join(root, "dist", "og.png"), "utf8")).toBe("png");
  });
});

describe("copyFonts (#91)", () => {
  it("copies the self-hosted .woff2 next to the built fonts.css", async () => {
    const root = await mkdtemp(join(tmpdir(), "copy-fonts-"));
    await mkdir(join(root, "src", "fonts"), { recursive: true });
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "src", "fonts", "a-latin.woff2"), "woff2");
    await writeFile(join(root, "src", "fonts", "fonts.css"), "css");
    expect(await copyFonts(join(root, "src"), join(root, "dist"))).toEqual([
      "a-latin.woff2",
    ]);
    expect(
      await readFile(
        join(root, "dist", "_file", "fonts", "a-latin.woff2"),
        "utf8",
      ),
    ).toBe("woff2");
  });
});
