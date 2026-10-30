// Copies static files that pages don't reference (so `observable build` skips them) from src/
// to dist/ — today the social preview image named by the conference's `ogImage` (#18), which the
// head references by absolute URL.
// CLI (run by `npm run build`): node scripts/copyStatic.js [srcDir] [distDir]
import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConferenceConfig } from "../src/lib/conference.js";

/** Files to copy for a conference config; only plain names inside src/. */
export function staticFiles(conference) {
  return [conference.ogImage].filter(
    (name) =>
      typeof name === "string" &&
      /^[\w.-]+$/.test(name) &&
      !name.startsWith("."),
  );
}

export async function copyStatic(files, srcDir, distDir) {
  for (const name of files)
    await copyFile(join(srcDir, name), join(distDir, name));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [srcDir = "src", distDir = "dist"] = process.argv.slice(2);
  const conference = await loadConferenceConfig();
  const files = staticFiles(conference);
  await copyStatic(files, srcDir, distDir);
  console.log(`static → ${distDir}: ${files.join(", ") || "(none)"}`);
}
