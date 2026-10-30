import { loadConferenceConfig } from "./src/lib/conference.js";

const conference = await loadConferenceConfig();

export default {
  title: `${conference.name} Papers`,
  root: "src",
  // No "Previous page / Next page" cards: the nav already links every page
  pager: false,
  output: "dist",
  pages: [
    { name: "Explore", path: "/" },
    { name: "My Papers", path: "/my-papers" },
    { name: "Researchers", path: "/authors" },
    { name: "About", path: "/about" },
  ],
  head: `<link rel="stylesheet" href="./fonts/fonts.css">
<meta property="og:title" content="${conference.name} Papers Navigator">
<meta property="og:image" content="${conference.siteUrl}${conference.ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${conference.name} Papers Navigator: the map of all papers, colored by topic">
<meta name="twitter:card" content="summary_large_image">
<script>
  // Phone bottom tab bar (#110): let env(safe-area-inset-*) report the home indicator and notch
  // (Framework writes the viewport meta; this runs right after it, before the page draws)
  const viewport = document.querySelector("meta[name=viewport]");
  if (viewport && !viewport.content.includes("viewport-fit")) viewport.content += ", viewport-fit=cover";
  // Apply the saved Appearance before the page draws (no flash); see src/lib/theme.js
  try {
    const theme = localStorage.getItem("papersNavigator:theme");
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  } catch (error) {}
  // Offline after first load (#15): src/sw.js, copied to dist/sw.js by npm run build.
  // Relative URL: the site lives in a subfolder. (No sw.js in npm run dev: it fails quietly.)
  if ("serviceWorker" in navigator)
    addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
</script>
<script type="module">
  // Highlight the current page in the navbar ("/index", "/index.html" and "/" are the same page)
  const page = (path) => {
    for (const suffix of ["/index.html", "/index"]) if (path.endsWith(suffix)) return path.slice(0, -suffix.length + 1);
    return path;
  };
  for (const a of document.querySelectorAll(".navbar-links a, .tabbar a"))
    if (page(new URL(a.href).pathname) === page(location.pathname)) a.setAttribute("aria-current", "page");
</script>`,
  // No left sidebar; a Bootstrap-style navbar instead. On phones (< 640px) its links move to a
  // bottom tab bar (DESIGN.md → Nav bar); the Options button is revealed by pages that have
  // options (Explore). Both badges show the My Papers count (src/components/badge.js).
  sidebar: false,
  header: `<nav class="navbar" aria-label="Main">
  <a class="navbar-brand" href="./">${conference.name} Papers</a>
  <div class="navbar-links">
    <a href="./">Explore</a>
    <a href="./my-papers">My Papers <span class="badge-my-papers" hidden></span></a>
    <a href="./authors">Researchers</a>
    <a href="./about">About</a>
  </div>
  <button class="navbar-options" aria-controls="filters-panel" aria-expanded="false" hidden>⚙ Options</button>
</nav>
<nav class="tabbar" aria-label="Pages">
  <a href="./">Explore</a>
  <a href="./my-papers">My Papers <span class="badge-my-papers" hidden></span></a>
  <a href="./authors">Researchers</a>
  <a href="./about">About</a>
</nav>`,
  footer: `Built by <a href="https://johnguerra.co">John Alexis Guerra Gómez</a> · Papers Navigator · <a href="./about#privacy">About &amp; privacy</a>`,
  search: false,
  // johnguerra.co (Apache) serves my-papers.html, not /my-papers
  cleanUrls: false,
  style: "style.css",
  // No Google Fonts (#91): the DESIGN.md fonts are self-hosted, linked from the head. An
  // empty list also drops Framework's default Source Serif 4 from Google.
  globalStylesheets: [],
};
