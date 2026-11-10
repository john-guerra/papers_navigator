// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderPostPanel } from "../src/components/postPanel.js";

const paper = {
  id: "p1",
  shortId: "s1",
  title: "QueerTravel",
  url: "https://ieeevis.org/year/2026/program/content/p1",
  authors: [{ name: "Başak Oral" }, { name: "Evanthia Dimara" }],
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
const setup = (options = {}) => {
  const deps = {
    handles: fakeHandles(),
    linkSetting: fakeSetting(),
    fetch: vi.fn(async () => ({
      ok: true,
      json: async () => ({
        actors: [
          { handle: "dimara.bsky.social", displayName: "Evanthia Dimara" },
          { handle: "someone.bsky.social", displayName: "Someone" },
        ],
      }),
    })),
    share: {},
    clipboard: { writeText: vi.fn(async () => {}) },
    open: vi.fn(),
  };
  const el = renderPostPanel(paper, {
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
