import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { copyStatic, staticFiles } from "../scripts/copyStatic.js";

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
