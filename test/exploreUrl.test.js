import { describe, expect, it, vi } from "vitest";
import { startExploreUrl } from "../src/components/exploreUrl.js";

const papers = [
  {
    id: "p1",
    type: "full",
    authors: [{ name: "Smith, Jane", affiliation: "Uni, Boston" }],
    keywords: ["LLM"],
    sessionName: "S1",
    clusterLabel: "agents",
  },
  { id: "p2", type: "workshop", authors: [], sessionName: "W1" },
];
const conference = {
  defaultQuery: "Dimensionality reduction",
  defaultTypes: ["full", "gone"],
  projections: ["umap", "tsne"],
};
const typeLabels = new Map([
  ["full", "Full"],
  ["workshop", "Workshop"],
]);

function fakeWindow(hash, search = "?paper=abc") {
  const win = {
    location: { href: `https://x.org/conf/${search}${hash}` },
    history: {
      state: null,
      replaceState: vi.fn((state, _, url) => {
        win.location.href = url;
      }),
    },
    addEventListener() {},
    removeEventListener() {},
  };
  return win;
}
const start = (search, options = {}) =>
  startExploreUrl({
    papers,
    conference,
    typeLabels,
    hasTopics: true,
    win: fakeWindow(search),
    ...options,
  });

describe("startExploreUrl (#92)", () => {
  it("defaults to the conference's search, main types and first projection", () => {
    const { start: state, explicitQuery } = start("");
    expect(state.query).toBe("Dimensionality reduction");
    expect(state.facets.types).toEqual(["full"]);
    expect(state.projection).toBe("umap");
    expect(explicitQuery).toBe(false);
  });

  it("reads the fragment, not the query string", () => {
    const state = startExploreUrl({
      papers,
      conference,
      typeLabels,
      hasTopics: true,
      win: fakeWindow("", "?q=agents"),
    }).start;
    expect(state.query).toBe("Dimensionality reduction");
  });

  it("keeps only facet values of this program", () => {
    const { start: state } = start(
      "#author=Smith%2C+Jane&author=Ghost&inst=Uni%2C+Boston&session=S1&topic=agents&kw=LLM&kw=nope",
    );
    expect(state.facets).toMatchObject({
      authors: ["Smith, Jane"],
      affiliations: ["Uni, Boston"],
      sessions: ["S1"],
      topics: ["agents"],
      keywords: ["LLM"],
    });
  });

  it("offers Color by Topic only when the conference has topics", () => {
    expect(start("#color=topic").start.color).toBe("clusterLabel");
    expect(start("#color=topic", { hasTopics: false }).start.color).toBe(
      "score",
    );
  });

  it("says when the link names a search (it takes over from My research)", () => {
    expect(start("#q=agents").explicitQuery).toBe(true);
    expect(start("#q=").explicitQuery).toBe(false);
  });

  it("counts a followed link that says no search, not a reload of one (#155 review)", () => {
    const withNavigation = (hash, type) => {
      const win = fakeWindow(hash);
      win.performance = { getEntriesByType: () => [{ type }] };
      return start(hash, { win }).explicitQuery;
    };
    // A topic/keyword link: "no search", and My research must not cut its papers
    expect(withNavigation("#q=&type=&kw=LLM", "navigate")).toBe(true);
    // The page writes q= itself when the search is cleared: a reload or Back keeps My research
    expect(withNavigation("#q=&type=&kw=LLM", "reload")).toBe(false);
    expect(withNavigation("#q=", "back_forward")).toBe(false);
    expect(withNavigation("#type=&kw=LLM", "navigate")).toBe(false);
  });

  it("writes back only what differs from the defaults", () => {
    const { sync } = start("");
    sync.update({ query: "LLM agents" });
    expect(sync.state.query).toBe("LLM agents");
    const win = fakeWindow("");
    const { sync: other } = startExploreUrl({
      papers,
      conference,
      typeLabels,
      hasTopics: true,
      win,
    });
    other.update({ facets: { ...other.state.facets, types: [] } });
    other.flush();
    expect(win.location.href).toBe("https://x.org/conf/?paper=abc#type=");
  });
});

describe("startExploreUrl: the remembered search (#174)", () => {
  const storage = (value) => ({
    getItem: (k) =>
      k === "papersNavigator:vis:lastQuery" && value !== undefined
        ? JSON.stringify(value)
        : null,
  });
  const conf = { ...conference, id: "vis" };
  const open = (hash, value, win = fakeWindow(hash)) => ({
    win,
    ...startExploreUrl({
      papers,
      conference: conf,
      typeLabels,
      hasTopics: true,
      win,
      storage: storage(value),
    }),
  });

  it("starts from the last search when the link names none", () => {
    expect(open("", "graphs").start.query).toBe("graphs");
    // A cleared search is remembered too: no default search
    expect(open("", "").start.query).toBe("");
    // First visit: the conference's default
    expect(open("", undefined).start.query).toBe("Dimensionality reduction");
  });

  it("a link's search wins, and the remembered one is no explicit search", () => {
    expect(open("#q=agents", "graphs").start.query).toBe("agents");
    expect(open("#q=", "graphs").start.query).toBe("");
    expect(open("", "graphs").explicitQuery).toBe(false);
  });

  it("writes a remembered search into the fragment, so a reload keeps it", () => {
    const { win, sync } = open("", "graphs");
    sync.update({});
    sync.flush();
    expect(win.location.href).toBe("https://x.org/conf/?paper=abc#q=graphs");
    // Reloading that URL, whatever is remembered by then
    expect(open("#q=graphs", "other").start.query).toBe("graphs");
    const cleared = open("", "");
    cleared.sync.update({});
    cleared.sync.flush();
    expect(cleared.win.location.href).toBe("https://x.org/conf/?paper=abc#q=");
    expect(open("#q=", "").start.query).toBe("");
  });

  it("the default search stays out of the fragment, remembered or not", () => {
    const { win, sync } = open("", "Dimensionality reduction");
    expect(sync.state.query).toBe("Dimensionality reduction");
    sync.update({});
    sync.flush();
    expect(win.location.href).toBe("https://x.org/conf/?paper=abc");
  });
});
