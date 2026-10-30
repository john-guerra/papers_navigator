import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXPLORE_KEYS,
  MAX_HASH,
  cleanHash,
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

  it("after Clear all (empty search, Main tracks, no region) leaves only q=", () => {
    const cleared = {
      ...fresh(),
      query: "",
      facets: { ...fresh().facets, types: [...defaults.types] },
      region: null,
    };
    expect(encodeExploreState(cleared, defaults).toString()).toBe("q=");
  });

  it("never writes more than MAX_HASH: drops the region first, then facet values, and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const authors = Array.from(
      { length: 50 },
      (_, i) => `${i} ${"x".repeat(150)}`,
    );
    const state = {
      ...fresh(),
      query: "LLM",
      facets: { ...fresh().facets, authors },
      region: { projection: "umap", x: [0, 1], y: [0, 1] },
    };
    const params = encodeExploreState(state, defaults);
    expect(params.toString().length).toBeLessThanOrEqual(MAX_HASH);
    expect(params.has("region")).toBe(false);
    expect(params.get("q")).toBe("LLM");
    expect(params.getAll("author").length).toBeGreaterThan(0);
    expect(params.getAll("author")).toEqual(
      authors.slice(0, params.getAll("author").length),
    );
    expect(warn).toHaveBeenCalledOnce();
    // Short enough: the region stays, no warning
    warn.mockClear();
    const small = encodeExploreState(
      { ...state, facets: fresh().facets },
      defaults,
    );
    expect(small.has("region")).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
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

  it("accepts only plain decimal numbers in a region (no empty, hex or Infinity)", () => {
    const region = (text) =>
      decodeExploreState(new URLSearchParams({ region: text }), options).region;
    expect(region("-1.5,2,.5,3e1")).toEqual({
      projection: "umap",
      x: [-1.5, 2],
      y: [0.5, 30],
    });
    for (const bad of [
      ",1,2,3",
      "0x10,1,2,3",
      "Infinity,1,2,3",
      " 1,2,3,4",
      "1,2,3,4,",
      "0b1,2,3,4",
    ])
      expect(region(bad)).toBeNull();
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

  it("with `keep`, drops pairs that are neither the page's nor kept (no junk carried along)", () => {
    const href = "https://x.org/?paper=a#follow=ab&junk=1&q=old&watch=a:X";
    expect(
      withParams(href, new URLSearchParams("q=new"), ["q"], {
        keep: ["follow", "watch"],
      }),
    ).toBe("https://x.org/?paper=a#follow=ab&watch=a%3AX&q=new");
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

describe("cleanHash (at load: a link is attacker-controllable)", () => {
  it("keeps only the page's keys and share keys, rewriting the URL", () => {
    const win = fakeWindow("https://x.org/?paper=a#q=x&junk=1&follow=ab");
    const params = cleanHash({ win, keys: ["q"] });
    expect([...params]).toEqual([
      ["q", "x"],
      ["follow", "ab"],
    ]);
    expect(win.location.href).toBe("https://x.org/?paper=a#q=x&follow=ab");
    expect(win.history.state).toEqual({ paperDetail: 1 });
  });

  it("leaves a clean URL alone", () => {
    const win = fakeWindow("https://x.org/#q=x");
    cleanHash({ win, keys: ["q"] });
    expect(win.history.replaceState).not.toHaveBeenCalled();
  });

  it("drops a fragment over ~4 KB, with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const win = fakeWindow(`https://x.org/?paper=a#q=${"x".repeat(MAX_HASH)}`);
    const params = cleanHash({ win, keys: ["q"] });
    expect([...params]).toEqual([]);
    expect(win.location.href).toBe("https://x.org/?paper=a");
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe("createUrlSync", () => {
  const encode = (s) => new URLSearchParams(s.q ? { q: s.q } : {});

  it("writes with replaceState (never pushState), keeping history.state", () => {
    const win = fakeWindow("https://x.org/?paper=abc");
    const sync = createUrlSync({
      win,
      encode,
      keys: ["q"],
      state: {},
      delay: 0,
    });
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
    const sync = createUrlSync({
      win,
      encode,
      keys: ["q"],
      state: { q: "a" },
      delay: 0,
    });
    sync.update({ q: "a" });
    expect(win.history.replaceState).not.toHaveBeenCalled();
  });

  it("re-applies the page's state after Back/Forward (e.g. closing a paper)", () => {
    const win = fakeWindow("https://x.org/#q=new");
    const sync = createUrlSync({
      win,
      encode,
      keys: ["q"],
      state: {},
      delay: 0,
    });
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
      delay: 0,
      onExternalChange,
    });
    win.location.href = "https://x.org/?paper=a#q=b";
    win.fire("popstate");
    expect(onExternalChange).toHaveBeenCalledOnce();
    expect(win.location.href).toBe("https://x.org/?paper=a#q=b");
  });

  it("doesn't take an in-page anchor (#privacy) for a new link", () => {
    const win = fakeWindow("https://x.org/#q=a");
    const onExternalChange = vi.fn();
    createUrlSync({
      win,
      encode,
      keys: ["q"],
      state: { q: "a" },
      delay: 0,
      onExternalChange,
    });
    win.location.href = "https://x.org/#privacy";
    win.fire("popstate");
    expect(onExternalChange).not.toHaveBeenCalled();
    expect(win.location.href).toBe("https://x.org/#privacy");
  });

  it("writes only its own keys and share keys (unknown pairs are dropped)", () => {
    const win = fakeWindow("https://x.org/#junk=1&follow=ab");
    const sync = createUrlSync({ win, encode, keys: ["q"], delay: 0 });
    sync.update({ q: "a" });
    expect(win.location.href).toBe("https://x.org/#follow=ab&q=a");
  });

  it("isn't fooled by closing paper details onto an older fragment", () => {
    const win = fakeWindow("https://x.org/?paper=a#q=a");
    const onExternalChange = vi.fn();
    const sync = createUrlSync({
      win,
      encode,
      keys: ["q"],
      state: { q: "a" },
      delay: 0,
      onExternalChange,
    });
    sync.update({ q: "b" });
    win.location.href = "https://x.org/#q=a";
    win.fire("popstate");
    expect(onExternalChange).not.toHaveBeenCalled();
    expect(win.location.href).toBe("https://x.org/#q=b");
  });

  describe("debounced writes (Safari limits history calls)", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("writes once, 250 ms after the last change", () => {
      const win = fakeWindow("https://x.org/");
      const sync = createUrlSync({ win, encode, keys: ["q"], state: {} });
      for (const q of ["a", "ab", "abc"]) sync.update({ q });
      expect(sync.state).toEqual({ q: "abc" });
      expect(win.history.replaceState).not.toHaveBeenCalled();
      vi.advanceTimersByTime(250);
      expect(win.history.replaceState).toHaveBeenCalledOnce();
      expect(win.location.href).toBe("https://x.org/#q=abc");
    });

    it("flush() writes a pending change now", () => {
      const win = fakeWindow("https://x.org/");
      const sync = createUrlSync({ win, encode, keys: ["q"], state: {} });
      sync.update({ q: "a" });
      sync.flush();
      expect(win.location.href).toBe("https://x.org/#q=a");
      vi.advanceTimersByTime(500);
      expect(win.history.replaceState).toHaveBeenCalledOnce();
    });

    it("Back/Forward writes the pending change onto the new entry", () => {
      const win = fakeWindow("https://x.org/?paper=a#q=old");
      const sync = createUrlSync({
        win,
        encode,
        keys: ["q"],
        state: { q: "old" },
      });
      sync.update({ q: "new" });
      win.location.href = "https://x.org/#q=old";
      win.fire("popstate");
      expect(win.location.href).toBe("https://x.org/#q=new");
    });

    it("survives a browser that refuses history calls", () => {
      const win = fakeWindow("https://x.org/");
      win.history.replaceState.mockImplementation(() => {
        throw new Error("SecurityError");
      });
      const sync = createUrlSync({ win, encode, keys: ["q"], state: {} });
      sync.update({ q: "a" });
      expect(() => vi.advanceTimersByTime(250)).not.toThrow();
      expect(sync.state).toEqual({ q: "a" });
    });
  });
});
