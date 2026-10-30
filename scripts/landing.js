// Static pages the deploy script puts next to the conference builds:
// the landing page listing conferences and redirects from legacy URLs.
// CLI: node scripts/landing.js landing <outFile> | redirect <url> <outFile>
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const escape = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

/** Landing page linking each conference folder (deployDir's last segment), newest first. */
export function landingHtml(configs) {
  const items = [...configs]
    .sort((a, b) => (b.days?.[0] ?? "").localeCompare(a.days?.[0] ?? ""))
    .map((c) => {
      const folder = c.deployDir.split("/").pop();
      const when = c.days?.length
        ? ` <span>${escape(c.days[0])} – ${escape(c.days.at(-1))}</span>`
        : "";
      return `<li><a href="./${escape(folder)}/">${escape(c.name)}</a>${when}</li>`;
    })
    .join("\n    ");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Papers Navigator</title>
  <style>
    body { font: 16px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; }
    li { margin: 0.5rem 0; } span { color: #666; font-size: 0.9em; margin-left: 0.5rem; }
  </style>
</head>
<body>
  <h1>Papers Navigator</h1>
  <p>Semantic search, a map of the program and a personal schedule for each conference.</p>
  <ul>
    ${items}
  </ul>
  <p><small>Built by <a href="https://johnguerra.co">John Alexis Guerra Gómez</a></small></p>
</body>
</html>
`;
}

/** Redirect page that keeps the query and hash (share links carry #follow=…). */
export function redirectHtml(url) {
  const u = escape(url);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=${u}">
  <link rel="canonical" href="${u}">
  <title>Moved</title>
  <script>location.replace(${JSON.stringify(url)} + location.search + location.hash);</script>
</head>
<body><p>Moved to <a href="${u}">${u}</a>.</p></body>
</html>
`;
}

async function allConfigs() {
  const dir = fileURLToPath(new URL("../conferences/", import.meta.url));
  const ids = await readdir(dir);
  return Promise.all(
    ids.map(async (id) =>
      JSON.parse(await readFile(`${dir}${id}/config.json`, "utf-8")),
    ),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "landing")
    await writeFile(args[0], landingHtml(await allConfigs()));
  else if (command === "redirect")
    await writeFile(args[1], redirectHtml(args[0]));
  else {
    console.error("usage: landing <out> | redirect <url> <out>");
    process.exit(1);
  }
}
