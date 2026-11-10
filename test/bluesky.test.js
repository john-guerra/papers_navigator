import { describe, expect, it, vi } from "vitest";
import {
  composePost,
  composeUrl,
  createHandlesStore,
  graphemes,
  loadDiscussion,
  matchDiscussion,
  paperIdFromLink,
  parseAccounts,
  postUrl,
  profileUrl,
  affiliationMatch,
  searchAccounts,
} from "../src/lib/bluesky.js";

describe("composePost (#203 Stage C)", () => {
  it("fills the template: title, authors (picked handles), stars, note, link, #ieeevis", () => {
    const { text, over } = composePost({
      title: "T",
      authors: ["Ann", "Bo"],
      handles: { Bo: "bo.bsky.social" },
      rating: 4,
      note: "great",
      link: "https://x",
    });
    expect(text).toBe(
      '"T" by Ann, @bo.bsky.social ★★★★ great\nhttps://x\n#ieeevis',
    );
    expect(over).toBe(false);
  });

  it("leaves out empty parts", () => {
    expect(
      composePost({ title: "T", authors: ["Ann"], link: "https://x" }).text,
    ).toBe('"T" by Ann\nhttps://x\n#ieeevis');
  });

  it("shortens the authors first: picked handles, then the first other author, then et al.", () => {
    const authors = Array.from({ length: 12 }, (_, i) => `Author Number ${i}`);
    const { text, length, over } = composePost({
      title: "A fairly long paper title about visualization",
      authors,
      handles: { "Author Number 5": "five.bsky.social" },
      note: "n".repeat(60),
      link: "https://ieeevis.org/year/2026/program/content/3121c4fc-2fc3-4c4c-a716-fc64018061ec",
    });
    expect(text).toContain("by @five.bsky.social, Author Number 0 et al.");
    expect(text).toContain("n".repeat(60));
    expect(length).toBeLessThanOrEqual(300);
    expect(over).toBe(false);
  });

  it("then the title, with an ellipsis; never the note or the link", () => {
    const link = "https://example.org/" + "l".repeat(40);
    const note = "x".repeat(200);
    const { text, length } = composePost({
      title: "W".repeat(120),
      authors: ["Ann", "Bo", "Cy"],
      note,
      link,
    });
    expect(text).toContain(note);
    expect(text).toContain(link);
    expect(text).toMatch(/"W+…" by Ann et al\./);
    expect(length).toBeLessThanOrEqual(300);
  });

  it("is over when even the shortest draft doesn't fit", () => {
    const r = composePost({
      title: "T",
      authors: ["Ann"],
      note: "y".repeat(400),
      link: "https://x",
    });
    expect(r.over).toBe(true);
    expect(r.text).toContain("y".repeat(400));
  });

  it("counts graphemes, not code units", () => {
    expect(graphemes("👩🏽‍💻é")).toBe(2);
  });
});

describe("links (#203 Stage C)", () => {
  it("composeUrl encodes the draft", () => {
    expect(composeUrl("a b\n#x")).toBe(
      "https://bsky.app/intent/compose?text=a%20b%0A%23x",
    );
  });

  it("postUrl turns an at:// uri into a bsky.app link", () => {
    expect(
      postUrl("at://did:plc:x/app.bsky.feed.post/3abc", "papers.ieeevis.org"),
    ).toBe("https://bsky.app/profile/papers.ieeevis.org/post/3abc");
  });

  it("paperIdFromLink reads paper and content links", () => {
    const id = "3121c4fc-2fc3-4c4c-a716-fc64018061ec";
    expect(
      paperIdFromLink(`https://ieeevis.org/year/2026/program/paper/${id}/`),
    ).toBe(id);
    expect(
      paperIdFromLink(`https://ieeevis.org/year/2026/program/content/${id}`),
    ).toBe(id);
    expect(paperIdFromLink("https://ieeevis.org/year/2026/program")).toBeNull();
  });
});

const post = (rkey, text, links = [], external = null) => ({
  post: {
    uri: `at://did:plc:z/app.bsky.feed.post/${rkey}`,
    author: { handle: "papers.ieeevis.org" },
    record: {
      text,
      facets: links.map((uri) => ({ features: [{ uri }] })),
    },
    ...(external && { embed: { external: { uri: external } } }),
  },
});
const papers = [
  {
    id: "3121c4fc-2fc3-4c4c-a716-fc64018061ec",
    title: "Olli with Hypergraphs: An Extensible Architecture",
  },
  {
    id: "159dc0ce-c998-40fb-bbbb-9e7a4dba6be4",
    title: "AgroScan - An Interactive SOC Prediction Tool for Farmers",
  },
];

describe("matchDiscussion (#203 Stage C)", () => {
  it("matches by the paper id in a link or embed, else by the quoted title; first post wins", () => {
    const feed = [
      post("a1", "📄 something", [
        "https://ieeevis.org/year/2026/program/paper/3121c4fc-2fc3-4c4c-a716-fc64018061ec/",
      ]),
      post(
        "a2",
        "📄 again",
        [],
        "https://ieeevis.org/year/2026/program/content/3121c4fc-2fc3-4c4c-a716-fc64018061ec",
      ),
      post(
        "b1",
        '📄 "AgroScan - An Interactive SOC Pred…" by Someone. #ieeevis',
      ),
      post(
        "t1",
        '📄 "Towards Optimal Cookie Allocation: A Pict…" by Crumb Ledger',
        [
          "https://ieeevis.org/year/2026/program/paper/7e570000-0000-4000-8000-000000000002/",
        ],
      ),
    ];
    const map = matchDiscussion(feed, papers);
    expect([...map]).toEqual([
      [
        "3121c4fc-2fc3-4c4c-a716-fc64018061ec",
        "https://bsky.app/profile/papers.ieeevis.org/post/a1",
      ],
      [
        "159dc0ce-c998-40fb-bbbb-9e7a4dba6be4",
        "https://bsky.app/profile/papers.ieeevis.org/post/b1",
      ],
    ]);
  });

  it("ignores short quoted titles (too ambiguous)", () => {
    expect(
      matchDiscussion([post("x", '📄 "AgroScan" by A')], papers).size,
    ).toBe(0);
  });
});

describe("network wrappers (#203 Stage C)", () => {
  it("searchAccounts: full search (bios), then one profiles request (counts, joined)", async () => {
    const fetch = vi.fn(async (url) => ({
      ok: true,
      json: async () =>
        url.includes("searchActors?")
          ? {
              actors: [
                {
                  handle: "ann.bsky.social",
                  displayName: "Ann",
                  avatar: "https://a/x.jpg",
                  description: "Vis at Utrecht",
                },
                { handle: "other.bsky.social", displayName: "Ann B" },
              ],
            }
          : {
              profiles: [
                {
                  handle: "ann.bsky.social",
                  followersCount: 66,
                  postsCount: 27,
                  createdAt: "2024-11-15T00:00:00.000Z",
                },
              ],
            },
    }));
    const accounts = await searchAccounts("Ann Lee", { fetch });
    expect(fetch.mock.calls[0][0]).toBe(
      "https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=Ann%20Lee&limit=5",
    );
    expect(fetch.mock.calls[1][0]).toBe(
      "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?actors=ann.bsky.social&actors=other.bsky.social",
    );
    expect(accounts).toEqual([
      {
        handle: "ann.bsky.social",
        name: "Ann",
        avatar: "https://a/x.jpg",
        bio: "Vis at Utrecht",
        followers: 66,
        posts: 27,
        joined: "2024-11-15T00:00:00.000Z",
      },
      {
        handle: "other.bsky.social",
        name: "Ann B",
        avatar: "",
        bio: "",
        followers: null,
        posts: null,
        joined: null,
      },
    ]);
  });

  it("searchAccounts keeps the accounts when the profiles request fails", async () => {
    const fetch = vi.fn(async (url) =>
      url.includes("searchActors?")
        ? {
            ok: true,
            json: async () => ({ actors: [{ handle: "h", displayName: "H" }] }),
          }
        : { ok: false, status: 502, json: async () => ({}) },
    );
    const [a] = await searchAccounts("x", { fetch });
    expect(a).toMatchObject({ handle: "h", followers: null });
  });

  it("searchAccounts rejects on an HTTP error", async () => {
    const fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    await expect(searchAccounts("x", { fetch })).rejects.toThrow();
  });

  it("parseAccounts tolerates missing fields", () => {
    expect(parseAccounts({ actors: [{ handle: "h" }] })).toEqual([
      {
        handle: "h",
        name: "",
        avatar: "",
        bio: "",
        followers: null,
        posts: null,
        joined: null,
      },
    ]);
    expect(parseAccounts(null)).toEqual([]);
  });

  it("loadDiscussion pages through the feed until there's no cursor", async () => {
    const pages = [
      {
        feed: [
          post("a1", "x", [
            "https://ieeevis.org/year/2026/program/paper/3121c4fc-2fc3-4c4c-a716-fc64018061ec/",
          ]),
        ],
        cursor: "c1",
      },
      { feed: [], cursor: undefined },
    ];
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => pages.shift(),
    }));
    const map = await loadDiscussion(papers, { fetch, pages: 5 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toContain("&cursor=c1");
    expect(map.size).toBe(1);
  });
});

describe("createHandlesStore (#203 Stage C)", () => {
  const memoryStorage = () => {
    const data = new Map();
    return {
      data,
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(k, String(v)),
      removeItem: (k) => data.delete(k),
    };
  };

  it("remembers handles by author name, and forgets with an empty one", () => {
    const storage = memoryStorage();
    const store = createHandlesStore("ieeevis2026", storage);
    store.set("Ann Lee", "ann.bsky.social");
    expect(createHandlesStore("ieeevis2026", storage).get("Ann Lee")).toBe(
      "ann.bsky.social",
    );
    store.set("Ann Lee", "");
    expect(store.get("Ann Lee")).toBe("");
    expect(store.value).toEqual({});
  });

  it("tolerates bad stored data", () => {
    const storage = memoryStorage();
    storage.setItem(
      "papersNavigator:ieeevis2026:bskyHandles",
      '{"a": 3, "b": "b.bsky.social"}',
    );
    expect(createHandlesStore("ieeevis2026", storage).value).toEqual({
      b: "b.bsky.social",
    });
    storage.setItem("papersNavigator:ieeevis2026:bskyHandles", "{nope");
    expect(createHandlesStore("ieeevis2026", storage).value).toEqual({});
  });
});

describe("composePost review fixes (#203 Stage C)", () => {
  it("shortens the title of a single-author paper too", () => {
    const r = composePost({
      title: "W".repeat(150),
      authors: ["Ann"],
      note: "n".repeat(150),
      link: "https://x.org/" + "l".repeat(40),
    });
    expect(r.text).toMatch(/"W+…" by Ann/);
    expect(r.length).toBeLessThanOrEqual(300);
    expect(r.over).toBe(false);
  });
});

describe("affiliationMatch and profileUrl (#203 Stage C)", () => {
  it("finds the paper's affiliation in a bio by its distinctive words, ignoring case and accents", () => {
    expect(
      affiliationMatch("PhD student @ utrecht uni, vis", "Utrecht University"),
    ).toBe("Utrecht University");
    expect(affiliationMatch("Researcher at ETH Zürich", "ETH Zurich")).toBe(
      "ETH Zurich",
    );
    expect(
      affiliationMatch("Professor at Notre Dame", "University of Notre Dame"),
    ).toBe("University of Notre Dame");
  });

  it("doesn't match on generic words alone", () => {
    expect(
      affiliationMatch("I love my university", "Utrecht University"),
    ).toBeNull();
    expect(
      affiliationMatch("Institute of something", "Institute of Technology"),
    ).toBeNull();
    expect(affiliationMatch("", "Utrecht University")).toBeNull();
    expect(affiliationMatch("Utrecht", "")).toBeNull();
  });

  it("profileUrl", () => {
    expect(profileUrl("ann.bsky.social")).toBe(
      "https://bsky.app/profile/ann.bsky.social",
    );
  });
});

describe("affiliationMatch ignores field and place words (#206 quick review)", () => {
  it("doesn't hint on data, visualization, computing or places alone", () => {
    expect(
      affiliationMatch("I do data visualization", "Data Visualization Lab"),
    ).toBeNull();
    expect(
      affiliationMatch(
        "Living in California",
        "University of California, Davis",
      ),
    ).toBeNull();
    expect(
      affiliationMatch("Computer science at NYU", "New York University"),
    ).toBeNull();
    expect(
      affiliationMatch("Prof at UC Davis", "University of California, Davis"),
    ).toBe("University of California, Davis");
  });
});
