// Social preview card (#18, #197): the live Explore page after a search, cropped into a 1200×630
// card with the conference name, the pitch and the URL. Screenshots the deployed site, so run it
// after a deploy that changes the map or the search UI, then commit the image and redeploy.
// Needs Playwright and Google Chrome, which aren't dependencies of the site:
//   npm i --no-save playwright && node scripts/og.js [query]
// Writes src/<config.ogImage>. Give the image a new name in config.json when it changes, so
// platforms that cache cards by URL (LinkedIn, X) fetch the new one.
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { conferenceDir, loadConferenceConfig } from "../src/lib/conference.js";

const VIEWPORT = { width: 1280, height: 900 };
const SCALE = 2; // screenshot at 2× so the crops stay sharp in the card

/** Crop windows (CSS px of the page) from the measured element boxes. */
export function ogCrops({ search, map, legend }) {
  return {
    // the input without its ✕ clear button
    search: {
      x: search.x - 2,
      y: search.y - 2.5,
      width: search.width - 42,
      height: search.height + 2,
    },
    // the bottom of the map, where the search's bands and "Your search" sit
    // (stop 8px above its bottom edge: the "Color by" controls start right below it)
    map: {
      x: map.x + 126,
      y: map.y + map.height - 458,
      width: 640,
      height: 450,
    },
    // the similarity legend: title, ramp and its 0% · 30% (Good) · 60%+ labels
    legend: {
      x: legend.x - 6,
      y: legend.y - 5,
      width: legend.width + 15,
      height: 60,
    },
  };
}

const escape = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

/** The card's HTML: text on the left; the map, the search box and the legend on the right. */
export function ogHtml({
  name,
  place,
  count,
  url,
  screenshot,
  crops,
  fontsCss,
}) {
  const crop = ({ x, y, width, height }, s = 1) =>
    `<div class="crop" style="width:${width * s}px;height:${height * s}px"><img src="${escape(screenshot)}" style="width:${VIEWPORT.width * s}px;left:${-x * s}px;top:${-y * s}px"></div>`;
  const shownUrl = String(url)
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  return `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${escape(fontsCss)}">
<style>
*{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#fcf9f3;color:#241e1a}
.crop{position:relative;overflow:hidden}.crop img{position:absolute;max-width:none}
.fade{-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 70px);mask-image:linear-gradient(to bottom,transparent 0,#000 70px)}
.kicker{font:600 22px/1 "Source Sans 3",sans-serif;letter-spacing:.12em;color:#903129;text-transform:uppercase}
h1{font:500 84px/.98 Newsreader,serif;letter-spacing:-.5px;margin:22px 0 30px}
.pitch{font:400 25px/1.4 "Source Sans 3",sans-serif;color:#3a332e;margin:0}
.url{font:400 21px/1 "Source Sans 3",sans-serif;color:#605954;position:absolute;left:72px;bottom:56px}
.card{background:#fffdfa;border:1px solid #d8d3cc;border-radius:8px;box-shadow:0 10px 30px rgba(36,30,26,.12)}
</style>
<div style="position:absolute;left:72px;top:64px;width:470px">
  <div class="kicker">${escape(name)}${place ? ` · ${escape(place)}` : ""}</div>
  <h1>Papers<br>Navigator</h1>
  <p class="pitch">All ${escape(count)} papers, workshops, posters and talks.<br>Search by meaning, explore the map,<br>and build your schedule.</p>
</div>
<div class="url">${escape(shownUrl)}</div>
<div class="fade" style="position:absolute;right:0;bottom:0">${crop(crops.map)}</div>
<div class="card" style="position:absolute;left:600px;top:48px;padding:8px 14px 4px">${crop(crops.search)}</div>
<div style="position:absolute;right:30px;top:52px">${crop(crops.legend, 1.25)}</div>`;
}

/** Searches the live Explore page and returns the screenshot path and the element boxes. */
async function capture(chromium, siteUrl, query, dir) {
  const browser = await chromium.launch({
    channel: "chrome",
    args: [`--force-device-scale-factor=${SCALE}`],
  });
  try {
    const page = await (
      await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE })
    ).newPage();
    await page.addInitScript(() => {
      try {
        localStorage.setItem("papersNavigator:intro", "closed");
      } catch {
        // the intro just stays open
      }
    });
    await page.goto(siteUrl, { waitUntil: "load", timeout: 60000 });
    const box = page.getByPlaceholder(/Describe what you are looking for/);
    await box.waitFor({ timeout: 60000 });
    // warm up the language model, or the search shows the keyword fallback
    await box.fill("warm up");
    await box.press("Enter");
    await page.waitForTimeout(1000);
    await page
      .getByText(/Loading the language model/)
      .first()
      .waitFor({ state: "hidden", timeout: 180000 });
    await box.fill(query);
    await box.press("Enter");
    await page.waitForTimeout(3500);
    await page.mouse.move(5, VIEWPORT.height - 10);
    const boxes = {
      search: await box.boundingBox(),
      map: await page.evaluate(() => {
        const [r] = [...document.querySelectorAll("svg, canvas")]
          .map((e) => e.getBoundingClientRect())
          .filter((r) => r.width > 300)
          .sort((a, b) => b.width * b.height - a.width * a.height);
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
      legend: await page
        .getByText("Similarity", { exact: true })
        .filter({ visible: true })
        .first()
        .boundingBox(),
    };
    const screenshot = join(dir, "explore.png");
    await page.screenshot({ path: screenshot });
    return { screenshot, boxes };
  } finally {
    await browser.close();
  }
}

async function main([query = "visualizing uncertainty in forecasts"] = []) {
  const { chromium } = await import("playwright").catch(() => {
    throw new Error("Playwright is missing: npm i --no-save playwright");
  });
  const config = await loadConferenceConfig();
  const papers = JSON.parse(
    await readFile(`${conferenceDir(config.id)}data/papers.json`, "utf-8"),
  );
  const dir = await mkdtemp(join(tmpdir(), "og-"));
  const { screenshot, boxes } = await capture(
    chromium,
    config.siteUrl,
    query,
    dir,
  );
  const html = ogHtml({
    name: config.name,
    place: config.city,
    count: papers.length,
    url: config.siteUrl,
    screenshot: pathToFileURL(screenshot).href,
    crops: ogCrops(boxes),
    fontsCss: pathToFileURL(
      fileURLToPath(new URL("../src/fonts/fonts.css", import.meta.url)),
    ).href,
  });
  const htmlPath = join(dir, "og.html");
  await writeFile(htmlPath, html);
  const out = fileURLToPath(
    new URL(`../src/${config.ogImage}`, import.meta.url),
  );
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 630 },
    });
    await page.goto(pathToFileURL(htmlPath).href);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out });
  } finally {
    await browser.close();
  }
  console.log(`Wrote ${out} (${papers.length} papers, query "${query}")`);
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await main(process.argv.slice(2));
