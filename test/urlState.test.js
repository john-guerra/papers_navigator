import { describe, expect, it, vi } from "vitest";
import {
  EXPLORE_KEYS,
  createUrlSync,
  decodeExploreState,
  encodeExploreState,
  hashParams,
  withParams,
} from "../src/lib/urlState.js";

const defaults = {
  query: "Dimensionality reduction",
  types: ["full", "short"],
  projection: "umap",
  projections: ["umap", "tsne", "pca"],
};
const options = {
  defaults,
  projections: ["umap", "tsne", "pca"],
  colors: ["score", "typeLabel", "room", "sessionName", "clusterLabel"],
  facetValues: {
    types: new Set(["full", "short", "workshop", "cg&a"]),
    authors: new Set(["Smith, Jane", "José Núñez", "A & B"]),
    affiliations: new Set(["University of X, Boston"]),
  },
};
const fresh = () => decodeExploreState(new URLSearchParams(), options);
const roundTrip = (state) =>
  decodeExploreState(
    new URLSearchParams(encodeExploreState(state, defaults).toString()),
    options,
  );

describe("encodeExploreState", () => {
  it("omits every default, so a fresh visit has a clean URL", () => {
    expect(encodeExploreState(fresh(), defaults).toString()).toBe("");
  });

  it("uses short keys, in a stable order", () => {
    const state = {
      ...fresh(),
      query: "LLM agents",
      level: "strong",
      facets: { types: ["workshop"], authors: ["Smith, Jane"] },
      color: "typeLabel",
      projection: "tsne",
      labels: false,
      map: false,
      region: { projection: "tsne", x: [1.23456, 2], y: [-3, 4.0001] },
    };
    expect(encodeExploreState(state, defaults).toString()).toBe(
      "q=LLM+agents&level=strong&type=workshop&author=Smith%2C+Jane&color=type&proj=tsne&labels=0&map=0&region=1.235%2C2%2C-3%2C4",
    );
  });

  it("repeats a facet's key per value: names contain commas", () => {
    const params = encodeExploreState(
      { ...fresh(), facets: { authors: ["Smith, Jane", "A & B"] } },
      defaults,
    );
    expect(params.getAll("author")).toEqual(["Smith, Jane", "A & B"]);
  });

  it("writes an empty q when the default search was cleared", () => {
    expect(
      encodeExploreState({ ...fresh(), query: "" }, defaults).toString(),
    ).toBe("q=");
  });

  it("writes an empty type when all types are shown", () => {
    const state = { ...fresh(), facets: { ...fresh().facets, types: [] } };
    expect(encodeExploreState(state, defaults).toString()).toBe("type=");
  });

  it("writes the relevance level only with a search", () => {
    const state = { ...fresh(), query: "", level: "all" };
    expect(encodeExploreState(state, defaults).has("level")).toBe(false);
    expect(
      encodeExploreState({ ...state, query: "x" }, defaults).get("level"),
    ).toBe("all");
  });

  it("writes a map region only for the projection it was drawn on", () => {
    const state = {
      ...fresh(),
      region: { projection: "tsne", x: [0, 1], y: [0, 1] },
    };
    expect(encodeExploreState(state, defaults).has("region")).toBe(false);
  });

  it("leaves live clusters and live projections out (computed in this browser)", () => {
    const state = {
      ...fresh(),
      color: "liveCluster",
      projection: "umap (live)",
    };
    expect(encodeExploreState(state, defaults).toString()).toBe("");
    const region = { projection: "umap (live)", x: [0, 1], y: [0, 1] };
    expect(
      encodeExploreState({ ...state, region }, defaults).has("region"),
    ).toBe(false);
  });
});

describe("decodeExploreState", () => {
  it("round-trips names with commas, accents and &", () => {
    const facets = {
      ...fresh().facets,
      types: ["cg&a"],
      authors: ["Smith, Jane", "José Núñez", "A & B"],
      affiliations: ["University of X, Boston"],
    };
    const state = { ...fresh(), query: "café, & más", facets };
    expect(roundTrip(state)).toEqual(state);
  });

  it("round-trips options and a region", () => {
    const state = {
      ...fresh(),
      query: "LLM agents",
      level: "weak",
      color: "room",
      projection: "pca",
      labels: false,
      map: false,
      region: { projection: "pca", x: [0.5, 1.25], y: [-2, 3] },
    };
    expect(roundTrip(state)).toEqual(state);
  });

  it("drops unknown values", () => {
    const state = decodeExploreState(
      new URLSearchParams(
        "level=huge&color=shoe&proj=mds&type=nope&type=full&author=Nobody&labels=maybe&map=yes&kw=anything",
      ),
      options,
    );
    expect(state.level).toBe("good");
    expect(state.color).toBe("score");
    expect(state.projection).toBe("umap");
    expect(state.facets.types).toEqual(["full"]);
    expect(state.facets.authors).toEqual([]);
    expect(state.labels).toBe(true);
    expect(state.map).toBe(true);
    // no list of valid keywords given: kept (length-capped)
    expect(state.facets.keywords).toEqual(["anything"]);
  });

  it("keeps the default types when every type in the link is unknown", () => {
    const state = decodeExploreState(new URLSearchParams("type=nope"), options);
    expect(state.facets.types).toEqual(defaults.types);
  });

  it("caps lengths and counts (a link is attacker-controllable)", () => {
    const many = Array.from({ length: 80 }, (_, i) => `kw=k${i}`).join("&");
    const state = decodeExploreState(
      new URLSearchParams(
        `q=${"a".repeat(1000)}&kw=${"b".repeat(500)}&${many}`,
      ),
      options,
    );
    expect(state.query).toHaveLength(300);
    expect(state.facets.keywords).toHaveLength(50);
    expect(state.facets.keywords).not.toContain("b".repeat(500));
  });

  it("drops a malformed region", () => {
    for (const region of ["1,2,3", "a,b,c,d", "1,2,3,Infinity", "1,1,2,3"])
      expect(
        decodeExploreState(new URLSearchParams({ region }), options).region,
      ).toBeNull();
  });

  it("orders a region's ends and tags it with the projection", () => {
    const state = decodeExploreState(
      new URLSearchParams("proj=tsne&region=2,1,4,3"),
      options,
    );
    expect(state.region).toEqual({ projection: "tsne", x: [1, 2], y: [3, 4] });
  });

  it("de-duplicates repeated facet values", () => {
    const state = decodeExploreState(
      new URLSearchParams("type=full&type=full"),
      options,
    );
    expect(state.facets.types).toEqual(["full"]);
  });

  it("returns every facet in options.facets, even ones absent from the URL", () => {
    expect(Object.keys(fresh().facets).sort()).toEqual([
      "affiliations",
      "authors",
      "keywords",
      "sessions",
      "topics",
      "types",
    ]);
  });
});

describe("withParams (in the fragment: it never reaches the server)", () => {
  it("replaces only Explore's keys in the fragment, keeping ?paper= and share pairs", () => {
    const href =
      "https://x.org/conf/?paper=abc&now=2026#follow=a.b&q=old&author=Old";
    const url = new URL(
      withParams(href, new URLSearchParams("q=new&type=full")),
    );
    expect(url.search).toBe("?paper=abc&now=2026");
    const hash = new URLSearchParams(url.hash.slice(1));
    expect(hash.get("follow")).toBe("a.b");
    expect(hash.get("q")).toBe("new");
    expect(hash.getAll("type")).toEqual(["full"]);
    expect(hash.has("author")).toBe(false);
  });

  it("never touches the query string", () => {
    expect(
      withParams("https://x.org/conf/?q=keep", new URLSearchParams("q=new")),
    ).toBe("https://x.org/conf/?q=keep#q=new");
  });

  it("drops the fragment when no pairs are left", () => {
    expect(
      withParams("https://x.org/conf/?paper=a#q=old", new URLSearchParams()),
    ).toBe("https://x.org/conf/?paper=a");
  });

  it("clears a share link's keys (My Papers) without touching other pairs", () => {
    const href =
      "https://x.org/my-papers.html?paper=a#follow=ab.cd&watch=a:Jane%20Doe,i:MIT&q=x";
    expect(withParams(href, new URLSearchParams(), ["follow", "watch"])).toBe(
      "https://x.org/my-papers.html?paper=a#q=x",
    );
  });

  it("reads the fragment's pairs", () => {
    expect(hashParams("https://x.org/?q=no#q=yes&type=").get("q")).toBe("yes");
    expect([...hashParams("https://x.org/")]).toEqual([]);
  });

  it("covers every Explore key", () => {
    expect(EXPLORE_KEYS).toEqual([
      "q",
      "level",
      "type",
      "author",
      "inst",
      "kw",
      "session",
      "topic",
      "color",
      "proj",
      "labels",
      "map",
      "region",
    ]);
  });
});

function fakeWindow(href) {
  const listeners = {};
  const win = {
    location: { href },
    history: {
      state: { paperDetail: 1 },
      replaceState: vi.fn((state, _, url) => {
        win.history.state = state;
        win.location.href = new URL(url, win.location.href).href;
      }),
      pushState: vi.fn(),
    },
    addEventListener: (type, fn) => (listeners[type] = fn),
    reload: vi.fn(),
    removeEventListener: (type) => delete listeners[type],
    fire: (type) => listeners[type]?.(),
  };
  return win;
}

describe("createUrlSync", () => {
  const encode = (s) => new URLSearchParams(s.q ? { q: s.q } : {});

  it("writes with replaceState (never pushState), keeping history.state", () => {
    const win = fakeWindow("https://x.org/?paper=abc");
    const sync = createUrlSync({ win, encode, keys: ["q"], state: {} });
    sync.update({ q: "hello" });
    expect(win.history.pushState).not.toHaveBeenCalled();
    expect(win.history.replaceState).toHaveBeenCalledWith(
      { paperDetail: 1 },
      "",
      "https://x.org/?paper=abc#q=hello",
    );
    expect(sync.state).toEqual({ q: "hello" });
  });

  it("skips writes that don't change the URL", () => {
    const win = fakeWindow("https://x.org/#q=a");
    const sync = createUrlSync({ win, encode, keys: ["q"], state: { q: "a" } });
    sync.update({ q: "a" });
    expect(win.history.replaceState).not.toHaveBeenCalled();
  });

  it("re-applies the page's state after Back/Forward (e.g. closing a paper)", () => {
    const win = fakeWindow("https://x.org/#q=new");
    const sync = createUrlSync({ win, encode, keys: ["q"], state: {} });
    sync.update({ q: "new" });
    // Closing paper details goes back to an entry written before the last change
    win.location.href = "https://x.org/?paper=a#q=old";
    win.fire("popstate");
    expect(win.location.href).toBe("https://x.org/?paper=a#q=new");
    sync.stop();
    win.location.href = "https://x.org/#q=old";
    win.fire("popstate");
    expect(win.location.href).toBe("https://x.org/#q=old");
  });

  it("starts over from a fragment changed in the address bar (same page: no reload)", () => {
    const win = fakeWindow("https://x.org/?paper=a#q=a");
    const onExternalChange = vi.fn();
    createUrlSync({
      win,
      encode,
      keys: ["q"],
      state: { q: "a" },
      onExternalChange,
    });
    win.location.href = "https://x.org/?paper=a#q=b";
    win.fire("popstate");
    expect(onExternalChange).toHaveBeenCalledOnce();
    expect(win.location.href).toBe("https://x.org/?paper=a#q=b");
  });

  it("isn't fooled by closing paper details onto an older fragment", () => {
    const win = fakeWindow("https://x.org/?paper=a#q=a");
    const onExternalChange = vi.fn();
    const sync = createUrlSync({
      win,
      encode,
      keys: ["q"],
      state: { q: "a" },
      onExternalChange,
    });
    sync.update({ q: "b" });
    win.location.href = "https://x.org/#q=a";
    win.fire("popstate");
    expect(onExternalChange).not.toHaveBeenCalled();
    expect(win.location.href).toBe("https://x.org/#q=b");
  });
});
