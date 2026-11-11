// Copies static files that pages don't reference (so `observable build` skips them) from src/
// to dist/: the social preview images named by the conference's `ogImage` (#18) and
// `pageImages` (one card per page), and the Home
// Screen app's icons (`ICON_FILES`), which the head references by absolute URL; writes the
// conference's manifest.webmanifest; and copies the self-hosted fonts (#91): Framework copies
// src/fonts/fonts.css (linked from the head) to _file/fonts/fonts.<hash>.css but not the .woff2
// its url()s name, so they go next to it, in dist/_file/fonts/.
// CLI (run by `npm run build`): node scripts/copyStatic.js [srcDir] [distDir]
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConferenceConfig } from "../src/lib/conference.js";
import { ICON_FILES, webManifest } from "../src/lib/webManifest.js";
import { sitemapXml } from "../src/lib/seo.js";

/** Writes the conference's manifest.webmanifest at the root of distDir. */
export async function writeManifest(conference, distDir) {
  await writeFile(
    join(distDir, "manifest.webmanifest"),
    JSON.stringify(webManifest(conference), null, 2),
  );
}

/** Writes the conference's sitemap.xml (its pages) at the root of distDir. */
export async function writeSitemap(conference, distDir) {
  await writeFile(join(distDir, "sitemap.xml"), sitemapXml(conference));
}

/** Files to copy for a conference config; only plain names inside src/. */
export function staticFiles(conference) {
  const names = [
    conference.ogImage,
    ...Object.values(conference.pageImages ?? {}),
  ].filter(
    (name) =>
      typeof name === "string" &&
      /^[\w.-]+$/.test(name) &&
      !name.startsWith("."),
  );
  return [...new Set(names)];
}

export async function copyStatic(files, srcDir, distDir) {
  for (const name of files)
    await copyFile(join(srcDir, name), join(distDir, name));
}

/** Copies src/fonts/*.woff2 to dist/_file/fonts/, where the built fonts.css looks for them. */
export async function copyFonts(srcDir, distDir) {
  const names = (await readdir(join(srcDir, "fonts"))).filter((name) =>
    name.endsWith(".woff2"),
  );
  await mkdir(join(distDir, "_file", "fonts"), { recursive: true });
  await copyStatic(
    names.map((name) => join("fonts", name)),
    srcDir,
    join(distDir, "_file"),
  );
  return names;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [srcDir = "src", distDir = "dist"] = process.argv.slice(2);
  const conference = await loadConferenceConfig();
  const files = [...staticFiles(conference), ...ICON_FILES];
  await copyStatic(files, srcDir, distDir);
  await writeManifest(conference, distDir);
  if (conference.siteUrl) await writeSitemap(conference, distDir);
  console.log(
    `static → ${distDir}: ${files.join(", ") || "(none)"}, manifest.webmanifest, sitemap.xml`,
  );
  const fonts = await copyFonts(srcDir, distDir);
  console.log(`fonts → ${distDir}/_file/fonts: ${fonts.length} files`);
}
