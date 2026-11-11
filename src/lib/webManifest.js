/**
 * Home Screen app: the web app manifest for a conference's site. `npm run build` writes it to
 * dist/manifest.webmanifest (scripts/copyStatic.js), so its relative URLs resolve to the
 * conference's folder. The icon is the "map of papers" (src/icon.svg; the PNGs are rendered from
 * it): its dots sit inside Android's maskable safe circle, so the 512 doubles as the maskable icon.
 */
export const ICON_FILES = [
  "icon-32.png",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
];

/**
 * The head's links to the manifest and icons, by absolute URL (like the social card) so Framework
 * leaves their names unhashed; "" without a `siteUrl`. They point at the deployed site, so
 * `npm run dev` shows the published manifest and icons, not local edits.
 */
export function appHeadLinks({ siteUrl } = {}) {
  if (!siteUrl) return "";
  return `<link rel="manifest" href="${siteUrl}manifest.webmanifest">
<link rel="apple-touch-icon" href="${siteUrl}icon-180.png">
<link rel="icon" type="image/png" sizes="32x32" href="${siteUrl}icon-32.png">`;
}

export function webManifest(conference) {
  return {
    name: `${conference.name} Papers Navigator`,
    short_name: "Papers",
    start_url: "./",
    scope: "./",
    display: "standalone",
    // DESIGN.md: background (warm paper) and primary (oxblood)
    background_color: "#fcf9f3",
    theme_color: "#903129",
    icons: [
      { src: "icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
