/**
 * Search engines and link previews: each page's description, canonical URL, author, Open Graph
 * and Twitter tags and its own social card (config `pageImages`, else `ogImage`), written into the
 * <head> by observablehq.config.js (its `head` is a function of the page's path). Explore and
 * About also describe the app in JSON-LD. Plus a sitemap of the pages (scripts/copyStatic.js).
 */

export const AUTHOR = {
  name: "John Alexis Guerra Gómez",
  url: "https://johnguerra.co",
  sameAs: ["https://johnguerra.co", "https://github.com/john-guerra"],
};

/** The site's pages, as Framework names their paths. */
export const PAGE_PATHS = [
  "/index",
  "/my-papers",
  "/live",
  "/authors",
  "/about",
];

/** Each page's description (≤ 160 characters with the conference's name). */
const DESCRIPTIONS = {
  "/index": ({ name }) =>
    `Search every paper, workshop, poster and talk of ${name} by meaning, explore a map of topics and build your schedule. By ${AUTHOR.name}.`,
  "/my-papers": ({ name }) =>
    `Your ${name} schedule: the papers you add or watch (people, institutions, topics) by day and room, with your notes and ratings, kept on your device.`,
  "/live": ({ name }) =>
    `${name} right now: every session on in each room, the talk now and next, worth moving for. Rate talks, take notes and post to Bluesky.`,
  "/authors": ({ name }) =>
    `Every researcher in the ${name} program: their papers, when and where they present, co-authors, topics and Bluesky accounts.`,
  "/about": ({ name }) =>
    `About the ${name} Papers Navigator, an open-source tool by ${AUTHOR.name}: how it works, where the data comes from, what stays on your device.`,
};

/** What each page's social card shows, for people who can't see it. */
const IMAGE_ALTS = {
  "/index": (site) =>
    `${site}: a search highlighted on the map of all papers, with the similarity legend`,
  "/my-papers": (site) =>
    `${site}: My Papers on a phone, a schedule by day and room`,
  "/live": (site) =>
    `${site}: the Live page on a phone, the sessions on now in each room`,
  "/authors": (site) => `${site}: the list of researchers in the program`,
  "/about": (site) => `${site}: the About page and its contents`,
};

const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

/** A page's public address: Explore is the folder; the others end in .html (cleanUrls is off). */
export function pageUrl({ siteUrl }, path) {
  return path === "/index" ? siteUrl : `${siteUrl}${path.slice(1)}.html`;
}

const siteName = ({ name }) => `${name} Papers Navigator`;

/** The <head> tags for a page (Framework's `head` function input); "" for an unknown page. */
export function pageMeta(conference, { title, path }) {
  const describe = DESCRIPTIONS[path];
  if (!describe || !conference?.siteUrl) return "";
  const description = describe(conference);
  const url = pageUrl(conference, path);
  const image = `${conference.siteUrl}${conference.pageImages?.[path] ?? conference.ogImage}`;
  const alt = IMAGE_ALTS[path](siteName(conference));
  const fullTitle = title
    ? `${title} · ${siteName(conference)}`
    : siteName(conference);
  const meta = (attr, key, value) =>
    `<meta ${attr}="${key}" content="${escape(value)}">`;
  const tags = [
    meta("name", "description", description),
    meta("name", "author", AUTHOR.name),
    `<link rel="canonical" href="${escape(url)}">`,
    meta("property", "og:type", "website"),
    meta("property", "og:site_name", siteName(conference)),
    meta("property", "og:url", url),
    meta("property", "og:title", fullTitle),
    meta("property", "og:description", description),
    meta("property", "og:image", image),
    meta("property", "og:image:width", "1200"),
    meta("property", "og:image:height", "630"),
    meta("property", "og:image:alt", alt),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", fullTitle),
    meta("name", "twitter:description", description),
    meta("name", "twitter:image", image),
    meta("name", "twitter:image:alt", alt),
  ];
  if (path === "/index" || path === "/about") {
    const data = {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: siteName(conference),
      url: conference.siteUrl,
      description: DESCRIPTIONS["/index"](conference),
      applicationCategory: "EducationalApplication",
      operatingSystem: "Any (web browser)",
      isAccessibleForFree: true,
      image: `${conference.siteUrl}${conference.ogImage}`,
      author: { "@type": "Person", ...AUTHOR },
    };
    // JSON inside <script>: escape "<" so no text can close the tag
    tags.push(
      `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`,
    );
  }
  return tags.join("\n");
}

/** sitemap.xml for the conference's pages. */
export function sitemapXml(conference) {
  const urls = PAGE_PATHS.map(
    (path) => `  <url><loc>${escape(pageUrl(conference, path))}</loc></url>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
