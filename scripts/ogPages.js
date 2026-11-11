// Social cards for the pages other than Explore (Explore's is scripts/og.js): My Papers, Live,
// Researchers and About, each a 1200×630 card in the same style (the page's name and pitch on the
// left, a screenshot of the deployed page on the right; phones for My Papers and Live). The
// browser starts empty, with a sample schedule (one paper per session on the conference's third
// day) and Live's clock set into that day, so no one's data is in the cards.
// Needs Playwright and Google Chrome (not dependencies of the site):
//   npm i --no-save playwright && node scripts/ogPages.js [page …]
// Writes src/<config.pageImages[path]>; commit them and deploy. Rename a card in config.json when
// it changes, so platforms that cache cards by URL fetch the new one.
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { conferenceDir, loadConferenceConfig } from "../src/lib/conference.js";
import { dayKey } from "../src/lib/time.js";
import { escape } from "./og.js";

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

/** What each card says and shows. */
export const PAGES = {
  "/my-papers": {
    file: "my-papers.html",
    heading: "My<br>Papers",
    pitch:
      "Your schedule by day and room. Add papers, or watch people, institutions and topics.",
    viewport: PHONE,
    // the itinerary (Now / Next follows the real clock, after the sample day it's empty)
    prepare: (tab) =>
      tab.getByRole("button", { name: "Itinerary" }).first().click(),
  },
  "/live": {
    file: "live.html",
    heading: "Live",
    pitch:
      "What's on in every room, now and next. Rate talks, take notes, post to Bluesky.",
    viewport: PHONE,
  },
  "/authors": {
    file: "authors.html",
    heading: "Researchers",
    pitch:
      "Everyone in the program: their papers, when and where they present, co-authors.",
    viewport: DESKTOP,
  },
  "/about": {
    file: "about.html",
    heading: "About",
    pitch:
      "An open-source tool by John Alexis Guerra Gómez. What you save stays on your device.",
    viewport: DESKTOP,
  },
};

/** The card's HTML: text on the left; the page's screenshot on the right (a phone or a window). */
export function pageCardHtml({
  name,
  place,
  url,
  heading,
  pitch,
  screenshot,
  phone,
  fontsCss,
}) {
  const shownUrl = String(url).replace(/^https?:\/\//, "");
  const shot = phone
    ? `<div class="phone"><img src="${escape(screenshot)}"></div>`
    : `<div class="window fade"><img src="${escape(screenshot)}"></div>`;
  return `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${escape(fontsCss)}">
<style>
*{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#fcf9f3;color:#241e1a}
.kicker{font:600 22px/1 "Source Sans 3",sans-serif;letter-spacing:.12em;color:#903129;text-transform:uppercase}
h1{font:500 84px/.98 Newsreader,serif;letter-spacing:-.5px;margin:22px 0 30px}
.pitch{font:400 25px/1.4 "Source Sans 3",sans-serif;color:#3a332e;margin:0}
.url{font:400 21px/1 "Source Sans 3",sans-serif;color:#605954;position:absolute;left:72px;bottom:56px}
.phone{position:absolute;right:120px;top:40px;width:330px;height:640px;border:10px solid #241e1a;border-radius:44px;overflow:hidden;background:#fff;box-shadow:0 18px 40px rgba(36,30,26,.25)}
.phone img{width:100%;display:block}
.window{position:absolute;right:-30px;top:48px;width:630px;height:470px;border:1px solid #d8d3cc;border-radius:10px;overflow:hidden;background:#fffdfa;box-shadow:0 10px 30px rgba(36,30,26,.12)}
.window img{width:1008px;display:block}
.fade{-webkit-mask-image:linear-gradient(to bottom,#000 75%,transparent);mask-image:linear-gradient(to bottom,#000 75%,transparent)}
</style>
<div style="position:absolute;left:72px;top:64px;width:470px">
  <div class="kicker">${escape(name)}${place ? ` · ${escape(place)}` : ""}</div>
  <h1>${heading}</h1>
  <p class="pitch">${escape(pitch)}</p>
</div>
<div class="url">${escape(shownUrl)}</div>
${shot}`;
}

/** One paper per session on the conference's third day (talks with a time), at most 8. */
export function samplePapers(papers, day, tz) {
  const seen = new Set();
  const picked = [];
  for (const p of papers) {
    if (!p.start || dayKey(new Date(p.start), tz) !== day) continue;
    if (!["full", "short", "tvcg"].includes(p.type) || seen.has(p.sessionId))
      continue;
    seen.add(p.sessionId);
    picked.push(p.id);
    if (picked.length === 8) break;
  }
  return picked;
}

async function capture(chromium, config, page, ids, dir) {
  const spec = PAGES[page];
  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--force-device-scale-factor=2"],
  });
  try {
    const context = await browser.newContext({
      viewport: spec.viewport,
      deviceScaleFactor: 2,
    });
    const tab = await context.newPage();
    const day = config.days[2];
    await tab.addInitScript(
      ({ id, ids, day, tz }) => {
        try {
          const at = new Date(`${day}T15:40:00Z`); // 10:40 in the morning, US/Eastern
          const today = new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
          }).format(new Date());
          localStorage.setItem("papersNavigator:intro", "closed");
          localStorage.setItem(
            `papersNavigator:${id}:followed`,
            JSON.stringify(
              ids.map((paper) => ({
                id: paper,
                reason: "★ Added by hand",
                addedOn: "2026-11-01T12:00:00.000Z",
              })),
            ),
          );
          localStorage.setItem(
            `papersNavigator:${id}:liveClock`,
            JSON.stringify({ offsetMs: at.getTime() - Date.now(), day: today }),
          );
        } catch {
          // the card shows an empty page
        }
      },
      { id: config.id, ids, day, tz: config.timezone },
    );
    await tab.goto(new URL(spec.file, config.siteUrl).href, {
      waitUntil: "load",
      timeout: 60000,
    });
    await tab.waitForTimeout(4000);
    if (spec.prepare) {
      await spec.prepare(tab);
      await tab.waitForTimeout(1000);
    }
    const screenshot = join(dir, `${page.slice(1)}.png`);
    await tab.screenshot({ path: screenshot });
    return screenshot;
  } finally {
    await browser.close();
  }
}

async function main(only = []) {
  const { chromium } = await import("playwright").catch(() => {
    throw new Error("Playwright is missing: npm i --no-save playwright");
  });
  const config = await loadConferenceConfig();
  const papers = JSON.parse(
    await readFile(`${conferenceDir(config.id)}data/papers.json`, "utf-8"),
  );
  const ids = samplePapers(papers, config.days[2], config.timezone);
  const dir = await mkdtemp(join(tmpdir(), "og-pages-"));
  const fontsCss = pathToFileURL(
    fileURLToPath(new URL("../src/fonts/fonts.css", import.meta.url)),
  ).href;
  for (const page of Object.keys(PAGES)) {
    if (only.length && !only.includes(page) && !only.includes(page.slice(1)))
      continue;
    const name = config.pageImages?.[page];
    if (!name) throw new Error(`config.json has no pageImages["${page}"]`);
    const screenshot = await capture(chromium, config, page, ids, dir);
    const spec = PAGES[page];
    const html = pageCardHtml({
      name: config.name,
      place: config.city,
      url: new URL(spec.file, config.siteUrl).href,
      heading: spec.heading,
      pitch: spec.pitch,
      screenshot: pathToFileURL(screenshot).href,
      phone: spec.viewport === PHONE,
      fontsCss,
    });
    const htmlPath = join(dir, `${page.slice(1)}.html`);
    await writeFile(htmlPath, html);
    const out = fileURLToPath(new URL(`../src/${name}`, import.meta.url));
    const browser = await chromium.launch({ channel: "chrome" });
    try {
      const card = await browser.newPage({
        viewport: { width: 1200, height: 630 },
      });
      await card.goto(pathToFileURL(htmlPath).href);
      await card.evaluate(() => document.fonts.ready);
      await card.waitForTimeout(300);
      await card.screenshot({ path: out });
    } finally {
      await browser.close();
    }
    console.log(`Wrote ${out}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await main(process.argv.slice(2));
