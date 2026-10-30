// Copies the offline service worker (src/sw.js) to dist/sw.js after `observable build`,
// stamping a build id (hash of the built pages) into its VERSION. A changed sw.js is
// what makes browsers install the new worker on a deploy: it re-precaches the new
// pages and assets, and activate deletes the previous deploy's cache.
// CLI (run by `npm run build`): node scripts/buildSw.js [srcFile] [distDir]
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION_LINE = /^const VERSION = "([^"]+)";$/m;

/** sw.js source with `const VERSION = "v1";` → `const VERSION = "v1-<buildId>";`. */
export function stampVersion(source, buildId) {
  if (!VERSION_LINE.test(source))
    throw new Error('sw.js: no `const VERSION = "…";` line');
  return source.replace(
    VERSION_LINE,
    (_, version) => `const VERSION = "${version}-${buildId}";`,
  );
}

/** Short hash of the built pages (they name every hashed asset, so any change shows here). */
export function buildId(pages) {
  const hash = createHash("sha256");
  for (const { name, content } of [...pages].sort((a, b) =>
    a.name.localeCompare(b.name),
  ))
    hash.update(name).update("\0").update(content).update("\0");
  return hash.digest("hex").slice(0, 12);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [srcFile = "src/sw.js", distDir = "dist"] = process.argv.slice(2);
  const names = (await readdir(distDir)).filter((name) =>
    name.endsWith(".html"),
  );
  const pages = await Promise.all(
    names.map(async (name) => ({
      name,
      content: await readFile(join(distDir, name)),
    })),
  );
  const id = buildId(pages);
  await writeFile(
    join(distDir, "sw.js"),
    stampVersion(await readFile(srcFile, "utf8"), id),
  );
  console.log(`sw.js → ${join(distDir, "sw.js")} (build ${id})`);
}
