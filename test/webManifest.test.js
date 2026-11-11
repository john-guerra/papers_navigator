// Home Screen app: a web app manifest per conference, the map icon, and links to both in the head
import { mkdtemp, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../observablehq.config.js";
import { ICON_FILES, webManifest } from "../src/lib/webManifest.js";
import { writeManifest } from "../scripts/copyStatic.js";
import { loadConferenceConfig } from "../src/lib/conference.js";

const conference = { name: "IEEE VIS 2026" };

describe("webManifest", () => {
  it("opens the conference's folder as an app, in the site's colors", () => {
    const m = webManifest(conference);
    expect(m.name).toBe("IEEE VIS 2026 Papers Navigator");
    expect(m.short_name).toBe("Papers");
    // relative to the manifest, which sits at the conference folder's root
    expect(m.start_url).toBe("./");
    expect(m.scope).toBe("./");
    expect(m.display).toBe("standalone");
    expect(m.background_color).toBe("#fcf9f3");
    expect(m.theme_color).toBe("#903129");
  });

  it("lists the 192 and 512 icons, the 512 also as Android's maskable one", () => {
    expect(webManifest(conference).icons).toEqual([
      { src: "icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ]);
  });

  it("every icon it names is copied to dist", () => {
    for (const icon of webManifest(conference).icons)
      expect(ICON_FILES).toContain(icon.src);
  });
});

describe("writeManifest", () => {
  it("writes manifest.webmanifest at the root of dist", async () => {
    const dist = await mkdtemp(join(tmpdir(), "manifest-"));
    await mkdir(dist, { recursive: true });
    await writeManifest(conference, dist);
    const written = JSON.parse(
      await readFile(join(dist, "manifest.webmanifest"), "utf8"),
    );
    expect(written).toEqual(webManifest(conference));
  });
});

describe("the head links the manifest and the icons", () => {
  it("by absolute URL, like the social card, so Framework leaves them unhashed", async () => {
    const { siteUrl } = await loadConferenceConfig();
    expect(config.head).toContain(
      `<link rel="manifest" href="${siteUrl}manifest.webmanifest">`,
    );
    expect(config.head).toContain(
      `<link rel="apple-touch-icon" href="${siteUrl}icon-180.png">`,
    );
    expect(config.head).toContain(
      `<link rel="icon" type="image/png" sizes="32x32" href="${siteUrl}icon-32.png">`,
    );
  });
});
