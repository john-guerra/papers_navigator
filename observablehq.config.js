import { loadConferenceConfig } from "./src/lib/conference.js";

const conference = await loadConferenceConfig();

export default {
  title: `${conference.name} Papers`,
  root: "src",
  output: "dist",
  pages: [
    { name: "Explore", path: "/" },
    { name: "My Papers", path: "/my-papers" },
  ],
  head: `<meta property="og:title" content="${conference.name} Papers Navigator">
<meta property="og:image" content="${conference.siteUrl}${conference.ogImage}">
<meta name="twitter:card" content="summary_large_image">
<script type="module">
  // Highlight the current page in the navbar ("/index", "/index.html" and "/" are the same page)
  const page = (path) => {
    for (const suffix of ["/index.html", "/index"]) if (path.endsWith(suffix)) return path.slice(0, -suffix.length + 1);
    return path;
  };
  for (const a of document.querySelectorAll(".navbar-links a"))
    if (page(new URL(a.href).pathname) === page(location.pathname)) a.setAttribute("aria-current", "page");
</script>`,
  // No left sidebar; a Bootstrap-style navbar instead. On phones the links fold
  // behind ☰; the Options button is revealed by pages that have options (Explore).
  sidebar: false,
  header: `<nav class="navbar">
  <a class="navbar-brand" href="./">${conference.name} Papers</a>
  <button class="navbar-toggler" aria-label="Menu" aria-controls="navbar-links" aria-expanded="false"
    onclick="const nav = this.closest('nav'); nav.classList.toggle('open'); this.setAttribute('aria-expanded', nav.classList.contains('open'))">☰</button>
  <div id="navbar-links" class="navbar-links">
    <a href="./">Explore</a>
    <a href="./my-papers">My Papers</a>
  </div>
  <button class="navbar-options" aria-controls="filters-panel" aria-expanded="false" hidden>⚙ Options</button>
</nav>`,
  footer: `Built by <a href="https://johnguerra.co">John Alexis Guerra Gómez</a> · Papers Navigator`,
  search: false,
  // johnguerra.co (Apache) serves my-papers.html, not /my-papers
  cleanUrls: false,
  style: "style.css",
  // DESIGN.md fonts (replaces Framework's default Source Serif 4; Framework adds the
  // preconnect): Newsreader 400–500 roman + italic with optical sizes, Source Sans 3 400–600.
  globalStylesheets: [
    "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..500;1,6..72,400..500&family=Source+Sans+3:wght@400..600&display=swap",
  ],
};
