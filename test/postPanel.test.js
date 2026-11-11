// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderPostPanel } from "../src/components/postPanel.js";
import { NO_HANDLE } from "../src/lib/bluesky.js";

const paper = {
  id: "p1",
  shortId: "s1",
  title: "QueerTravel",
  url: "https://ieeevis.org/year/2026/program/content/p1",
  authors: [
    { name: "Başak Oral", affiliation: "Utrecht University" },
    { name: "Evanthia Dimara", affiliation: "Utrecht University" },
  ],
};
const fakeHandles = (initial = {}) => {
  const store = new EventTarget();
  let value = { ...initial };
  store.get = (name) => value[name] ?? "";
  store.set = vi.fn((name, handle) => {
    value = { ...value, [name]: handle };
    if (!handle) delete value[name];
    store.dispatchEvent(new Event("input"));
  });
  return store;
};
const fakeSetting = (value = false) => {
  const s = new EventTarget();
  s.value = value;
  s.set = (v) => {
    s.value = v;
    s.dispatchEvent(new Event("input"));
  };
  return s;
};
const tick = () => new Promise((r) => setTimeout(r));
const setup = ({ paper: shown = paper, ...options } = {}) => {
  const deps = {
    handles: fakeHandles(),
    linkSetting: fakeSetting(),
    fetch: vi.fn(async (url) => ({
      ok: true,
      json: async () =>
        url.includes("getProfiles")
          ? {
              profiles: [
                {
                  handle: "dimara.bsky.social",
                  followersCount: 1200,
                  postsCount: 45,
                  createdAt: "2023-05-02T00:00:00.000Z",
                },
              ],
            }
          : {
              actors: [
                {
                  handle: "dimara.bsky.social",
                  displayName: "Evanthia Dimara",
                  description:
                    "Assistant prof, Utrecht University. Decision making & vis.",
                },
                {
                  handle: "someone.bsky.social",
                  displayName: "Someone",
                  description: "Cats.",
                },
              ],
            },
    })),
    share: {},
    clipboard: { writeText: vi.fn(async () => {}) },
    open: vi.fn(),
  };
  const el = renderPostPanel(shown, {
    rating: 4,
    note: "great",
    toolLink: "https://johnguerra.co/x/?paper=s1",
    ...deps,
    ...options,
  });
  document.body.append(el);
  return { el, ...deps, ...options };
};
const text = (el) => el.querySelector(".post-text").value;

describe("renderPostPanel (#203 Stage C)", () => {
  it("drafts the post with the conference link, and the tool link when chosen", () => {
    const { el } = setup();
    expect(text(el)).toBe(
      '"QueerTravel" by Başak Oral, Evanthia Dimara ★★★★ great\nhttps://ieeevis.org/year/2026/program/content/p1\n#ieeevis',
    );
    const tool = el.querySelector('input[value="tool"]');
    tool.checked = true;
    tool.dispatchEvent(new Event("change", { bubbles: true }));
    expect(text(el)).toContain("https://johnguerra.co/x/?paper=s1");
    el.remove();
  });

  it("finds an author on Bluesky, and picking one puts the @handle in the draft", async () => {
    const { el, fetch, handles } = setup();
    const row = el.querySelectorAll(".post-author")[1];
    row.querySelector(".post-find").click();
    await tick();
    expect(fetch.mock.calls[0][0]).toContain("q=Evanthia%20Dimara");
    const options = row.querySelectorAll(".post-account");
    expect(options).toHaveLength(2);
    options[0].click();
    expect(handles.set).toHaveBeenCalledWith(
      "Evanthia Dimara",
      "dimara.bsky.social",
    );
    expect(text(el)).toContain("@dimara.bsky.social");
    // ✕ forgets it
    row.querySelector(".post-forget").click();
    expect(text(el)).not.toContain("@dimara");
    el.remove();
  });

  it("None of these closes the results; never picks automatically", async () => {
    const { el, handles } = setup();
    const row = el.querySelectorAll(".post-author")[0];
    row.querySelector(".post-find").click();
    await tick();
    row.querySelector(".post-none").click();
    expect(row.querySelector(".post-account")).toBeNull();
    expect(handles.set).not.toHaveBeenCalled();
    el.remove();
  });

  it("says when the search fails or finds nothing", async () => {
    const failing = setup({
      fetch: vi.fn(async () => Promise.reject(new Error("offline"))),
    });
    failing.el.querySelector(".post-find").click();
    await tick();
    expect(failing.el.textContent).toContain(
      "Bluesky search needs a connection",
    );
    failing.el.remove();
    const empty = setup({
      fetch: vi.fn(async () => ({
        ok: true,
        json: async () => ({ actors: [] }),
      })),
    });
    empty.el.querySelector(".post-find").click();
    await tick();
    expect(empty.el.textContent).toContain("No accounts found");
    empty.el.remove();
  });

  it("keeps text you typed when something else changes", async () => {
    const { el } = setup();
    const area = el.querySelector(".post-text");
    area.value = "my own words";
    area.dispatchEvent(new Event("input"));
    const tool = el.querySelector('input[value="tool"]');
    tool.checked = true;
    tool.dispatchEvent(new Event("change", { bubbles: true }));
    expect(area.value).toBe("my own words");
    el.remove();
  });

  it("counts graphemes against 300", () => {
    const { el } = setup();
    const area = el.querySelector(".post-text");
    const count = el.querySelector(".post-count");
    expect(count.textContent).toMatch(/^\d+ \/ 300$/);
    area.value = "x".repeat(301);
    area.dispatchEvent(new Event("input"));
    expect(count.textContent).toBe("301 / 300");
    expect(count.classList).toContain("is-over");
    el.remove();
  });

  it("Copy text & open Bluesky copies the draft and opens the compose page", async () => {
    const { el, clipboard, open } = setup();
    el.querySelector(".post-copy-open").click();
    await tick();
    expect(clipboard.writeText).toHaveBeenCalledWith(text(el));
    expect(open).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/bsky\.app\/intent\/compose\?text=/),
      "_blank",
      "noopener",
    );
    el.remove();
  });

  it("Share… only when the device can share; with photos it shares them; a dismissed share is fine", async () => {
    expect(setup().el.querySelector(".post-share")).toBeNull();
    const share = {
      share: vi.fn(async () => {
        throw Object.assign(new Error("dismissed"), { name: "AbortError" });
      }),
      canShare: vi.fn(() => true),
    };
    const { el } = setup({ share });
    const file = new File(["x"], "slide.jpg", { type: "image/jpeg" });
    const input = el.querySelector(".post-choose-input");
    Object.defineProperty(input, "files", { value: [file] });
    input.dispatchEvent(new Event("change"));
    expect(el.textContent).toContain("1 photo");
    el.querySelector(".post-share").click();
    await tick();
    expect(share.share).toHaveBeenCalledWith({ text: text(el), files: [file] });
    expect(el.querySelector(".post-status").textContent).toBe("");
    el.remove();
  });

  it("links the discussion when there is one", () => {
    const { el } = setup({
      discussionUrl: "https://bsky.app/profile/papers.ieeevis.org/post/a1",
    });
    expect(el.querySelector("a.post-discussion").getAttribute("href")).toBe(
      "https://bsky.app/profile/papers.ieeevis.org/post/a1",
    );
    el.remove();
  });
});

describe("renderPostPanel review fixes (#203 Stage C)", () => {
  const store = (initial) => {
    const s = new EventTarget();
    let v = initial;
    s.get = () => v;
    s.put = (x) => {
      v = x;
      s.dispatchEvent(new Event("input"));
    };
    return s;
  };

  it("follows the rating and note while you haven't edited the draft", () => {
    const ratings = store(0);
    const notes = store("");
    const { el } = setup({
      rating: () => ratings.get(),
      note: () => notes.get(),
      watch: [ratings, notes],
    });
    expect(text(el)).not.toContain("★");
    ratings.put(4);
    notes.put("loved it");
    expect(text(el)).toContain("★★★★ loved it");
    el.dispose();
    ratings.put(1);
    expect(text(el)).toContain("★★★★ loved it");
    el.remove();
  });

  it("says when your own edits keep a change out, and Reset draft brings it back", async () => {
    const { el } = setup();
    const area = el.querySelector(".post-text");
    area.value = "mine";
    area.dispatchEvent(new Event("input"));
    expect(el.querySelector(".post-reset")).toBeTruthy();
    const row = el.querySelectorAll(".post-author")[1];
    row.querySelector(".post-find").click();
    await tick();
    row.querySelector(".post-account").click();
    expect(area.value).toBe("mine");
    expect(el.querySelector(".post-edited").textContent).toContain(
      "You edited the draft",
    );
    el.querySelector(".post-reset").click();
    expect(area.value).toContain("@dimara.bsky.social");
    expect(el.querySelector(".post-edited").textContent).toBe("");
    el.remove();
  });

  it("offers photos only where the device can share them", () => {
    expect(setup().el.querySelector(".post-photo-buttons")).toBeNull();
    const share = { share: vi.fn(), canShare: () => true };
    expect(
      setup({ share }).el.querySelector(".post-photo-buttons"),
    ).toBeTruthy();
  });

  it("opens Bluesky right away on the tap, even before the copy finishes (iOS popups)", () => {
    const clipboard = { writeText: vi.fn(() => new Promise(() => {})) };
    const { el, open } = setup({ clipboard });
    el.querySelector(".post-copy-open").click();
    expect(open).toHaveBeenCalledTimes(1);
    expect(clipboard.writeText).toHaveBeenCalled();
    el.remove();
  });

  it("the draft box grows to show the whole draft", () => {
    const { el } = setup();
    const area = el.querySelector(".post-text");
    Object.defineProperty(area, "scrollHeight", {
      value: 180,
      configurable: true,
    });
    area.dispatchEvent(new Event("input"));
    expect(area.style.height).toBe("180px");
    el.remove();
  });
});

describe("account details in search results (#203 Stage C)", () => {
  it("shows bio, followers, posts, joined, a View on Bluesky link and the affiliation hint", async () => {
    const { el } = setup();
    const row = el.querySelectorAll(".post-author")[1];
    row.querySelector(".post-find").click();
    await tick();
    await tick();
    const [first, second] = row.querySelectorAll(".post-result");
    expect(first.querySelector(".post-bio").textContent).toContain(
      "Decision making",
    );
    expect(first.querySelector(".post-stats").textContent).toBe(
      "1,200 followers · 45 posts · since May 2023",
    );
    expect(first.querySelector(".post-hint").textContent).toContain(
      "Matches the paper: Utrecht University",
    );
    const view = first.querySelector("a.post-view");
    expect(view.getAttribute("href")).toBe(
      "https://bsky.app/profile/dimara.bsky.social",
    );
    expect(view.getAttribute("target")).toBe("_blank");
    // no hint, no counts when unknown
    expect(second.querySelector(".post-hint")).toBeNull();
    expect(second.querySelector(".post-stats")).toBeNull();
    // the hint never picks: nothing is set until a tap
    expect(el.querySelector(".post-text").value).not.toContain("@dimara");
    el.remove();
  });
});

describe("compact search results, details on ⓘ (hover on a laptop)", () => {
  it("each result is one line: name, @handle and a ✓ when the bio matches the paper", async () => {
    const { el } = setup();
    const row = el.querySelectorAll(".post-author")[1];
    row.querySelector(".post-find").click();
    await tick();
    await tick();
    const [first, second] = row.querySelectorAll(".post-result");
    const pick = first.querySelector(".post-account");
    expect(pick.textContent).toContain("Evanthia Dimara");
    expect(pick.textContent).toContain("@dimara.bsky.social");
    // the long parts are not in the button you tap to pick
    expect(pick.querySelector(".post-bio")).toBeNull();
    expect(pick.querySelector(".post-stats")).toBeNull();
    expect(
      first.querySelector(".post-match").getAttribute("aria-label"),
    ).toContain("Matches the paper: Utrecht University");
    expect(second.querySelector(".post-match")).toBeNull();
    el.remove();
  });

  it("ⓘ shows and hides the account's details", async () => {
    const { el } = setup();
    const row = el.querySelectorAll(".post-author")[1];
    row.querySelector(".post-find").click();
    await tick();
    await tick();
    const first = row.querySelector(".post-result");
    const more = first.querySelector("button.post-more");
    const details = first.querySelector(".post-details");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(details.classList.contains("is-open")).toBe(false);
    expect(more.getAttribute("aria-controls")).toBe(details.id);
    more.click();
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(details.classList.contains("is-open")).toBe(true);
    more.click();
    expect(details.classList.contains("is-open")).toBe(false);
    el.remove();
  });
});

describe("the handle the conference lists", () => {
  const listed = {
    ...paper,
    authors: [
      {
        name: "Başak Oral",
        affiliation: "Utrecht University",
        bluesky: "oral.bsky.social",
      },
      paper.authors[1],
    ],
  };

  it("is preselected and says where it came from, without saving anything", () => {
    const { el, handles } = setup({ paper: listed });
    const row = el.querySelectorAll(".post-author")[0];
    expect(row.querySelector(".post-handle").textContent).toContain(
      "@oral.bsky.social",
    );
    expect(row.querySelector(".post-source").textContent).toContain(
      "conference page",
    );
    expect(text(el)).toContain("@oral.bsky.social");
    expect(handles.set).not.toHaveBeenCalled();
    // the other author still has Find on Bluesky
    expect(
      el.querySelectorAll(".post-author")[1].querySelector(".post-find"),
    ).not.toBeNull();
    el.remove();
  });

  it("✕ removes it for good (remembered), and Find on Bluesky comes back", () => {
    const { el, handles } = setup({ paper: listed });
    const row = el.querySelectorAll(".post-author")[0];
    row.querySelector(".post-forget").click();
    expect(handles.set).toHaveBeenCalledWith("Başak Oral", NO_HANDLE);
    expect(text(el)).not.toContain("@oral");
    expect(row.querySelector(".post-find")).not.toBeNull();
    el.remove();
    // a new panel (another visit) keeps it removed
    const again = setup({ paper: listed, handles });
    expect(text(again.el)).not.toContain("@oral");
    again.el.remove();
  });

  it("an account you picked wins over the listed one", () => {
    const { el } = setup({
      paper: listed,
      handles: fakeHandles({ "Başak Oral": "basak.bsky.social" }),
    });
    expect(text(el)).toContain("@basak.bsky.social");
    expect(text(el)).not.toContain("@oral");
    expect(el.querySelector(".post-source")).toBeNull();
    el.remove();
  });
});
