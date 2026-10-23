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
<meta name="twitter:card" content="summary_large_image">`,
  footer: `Built by <a href="https://johnguerra.co">John Alexis Guerra Gómez</a> · Papers Navigator`,
  search: false,
};
