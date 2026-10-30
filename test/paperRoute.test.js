// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createPaperRoute } from "../src/components/paperRoute.js";

/** A window with a synchronous fake history (jsdom's traversal is async). */
function fakeWindow(href, state = null, { asyncGo = false } = {}) {
  const win = new EventTarget();
  const entries = [{ url: href, state }];
  let index = 0;
  win.location = {
    get href() {
      return entries[index].url;
    },
  };
  win.history = {
    get state() {
      return entries[index].state;
    },
    get length() {
      return entries.length;
    },
    pushState(s, _, url) {
      entries.splice(index + 1);
      entries.push({ url: String(url), state: s });
      index++;
    },
    replaceState(s, _, url) {
      entries[index] = { url: String(url ?? entries[index].url), state: s };
    },
    go(delta) {
      const traverse = () => {
        // like browsers: going before the first entry leaves the site
        index += delta;
        if (index < 0) win.leftSite = true;
        win.dispatchEvent(new Event("popstate"));
      };
      if (asyncGo) win.pending.push(traverse);
      else traverse();
    },
  };
  win.document = document;
  win.setTimeout = (fn) => fn();
  win.entries = entries;
  win.pending = [];
  win.flush = () => win.pending.splice(0).forEach((fn) => fn());
  return win;
}

const BASE = "https://example.org/my-papers.html";

describe("createPaperRoute", () => {
  it("reads ?paper= and emits input when a paper opens and closes", () => {
    const win = fakeWindow(BASE);
    const route = createPaperRoute({ win });
    const seen = vi.fn();
    route.addEventListener("input", () => seen(route.value));
    expect(route.value).toBeNull();
    route.open("A");
    expect(route.value).toBe("A");
    expect(win.location.href).toBe(`${BASE}?paper=A`);
    route.close();
    expect(route.value).toBeNull();
    expect(win.location.href).toBe(BASE);
    expect(seen.mock.calls).toEqual([["A"], [null]]);
  });

  it("one Close goes back past every related paper opened from the list", () => {
    const win = fakeWindow(BASE);
    const route = createPaperRoute({ win });
    route.open("A");
    route.open("B");
    route.open("C");
    expect(route.value).toBe("C");
    route.close();
    expect(route.value).toBeNull();
    expect(win.location.href).toBe(BASE);
  });

  it("a direct ?paper=A link, then related B: one Close returns to the list (#70)", () => {
    const win = fakeWindow(`${BASE}?paper=A`);
    const route = createPaperRoute({ win });
    expect(route.value).toBe("A");
    route.open("B");
    route.close();
    expect(route.value).toBeNull();
    expect(win.location.href).toBe(BASE);
  });

  it("a direct link closes to the list, and Back from it does too", () => {
    const win = fakeWindow(`${BASE}?paper=A&now=x`);
    const route = createPaperRoute({ win });
    // the list entry sits under the direct link, keeping other parameters
    expect(win.entries.map((e) => e.url)).toEqual([
      `${BASE}?now=x`,
      `${BASE}?paper=A&now=x`,
    ]);
    win.history.go(-1);
    expect(route.value).toBeNull();
  });

  it("doesn't add the list entry again on reload or when the page re-runs", () => {
    const win = fakeWindow(`${BASE}?paper=A`);
    createPaperRoute({ win }).stop();
    createPaperRoute({ win });
    expect(win.entries).toHaveLength(2);
  });

  it("keeps other history state (e.g. a share-link hash cleared with replaceState)", () => {
    const win = fakeWindow(BASE, { other: 1 });
    const route = createPaperRoute({ win });
    route.open("A");
    expect(win.history.state).toEqual({ other: 1, paperDetail: 1 });
  });

  it("returns focus to the Details button of the row that opened the panel", () => {
    const win = fakeWindow(BASE);
    document.body.innerHTML = `<div data-paper-id="p1"><button class="paper-details-open">Details</button></div>`;
    const button = document.querySelector("button");
    button.focus();
    const route = createPaperRoute({ win });
    route.open("A");
    document.body.focus();
    route.open("B");
    button.blur();
    route.close();
    expect(document.activeElement).toBe(button);
    document.body.innerHTML = "";
  });

  it("finds the row's Details button again when the list re-rendered", () => {
    const win = fakeWindow(BASE);
    const row = `<div data-paper-id="p1"><button class="paper-details-open">Details</button></div>`;
    document.body.innerHTML = row;
    document.querySelector("button").focus();
    const route = createPaperRoute({ win });
    route.open("A");
    document.body.innerHTML = row;
    route.close();
    expect(document.activeElement).toBe(document.querySelector("button"));
    document.body.innerHTML = "";
  });

  it("a second Close before popstate arrives (held Esc, double click) is ignored", () => {
    const win = fakeWindow(BASE, null, { asyncGo: true });
    const route = createPaperRoute({ win });
    route.open("A");
    route.open("B");
    route.close();
    route.close();
    win.flush();
    expect(win.leftSite).toBeUndefined();
    expect(win.location.href).toBe(BASE);
    expect(route.value).toBeNull();
    // and Close works again for the next panel
    route.open("C");
    route.close();
    win.flush();
    expect(win.location.href).toBe(BASE);
  });

  it("after a direct link, Close focuses that paper's row, else the main heading", () => {
    document.body.innerHTML = `<h1>My Papers</h1><div data-paper-id="id-a"><button class="paper-details-open">Details</button></div>`;
    const resolveId = (key) => ({ A: "id-a", Z: "id-z" })[key];
    const route = createPaperRoute({
      win: fakeWindow(`${BASE}?paper=A`),
      resolveId,
    });
    route.close();
    expect(document.activeElement).toBe(document.querySelector("button"));
    const other = createPaperRoute({
      win: fakeWindow(`${BASE}?paper=Z`),
      resolveId,
    });
    other.close();
    expect(document.activeElement).toBe(document.querySelector("h1"));
    document.body.innerHTML = "";
  });

  it("stops listening to history after stop()", () => {
    const win = fakeWindow(BASE);
    const route = createPaperRoute({ win });
    route.open("A");
    route.stop();
    const seen = vi.fn();
    route.addEventListener("input", seen);
    win.history.go(-1);
    expect(seen).not.toHaveBeenCalled();
  });
});

describe("route.href", () => {
  it("is the current page with ?paper=<key>, keeping other params but not the fragment (#92)", () => {
    const win = fakeWindow(
      "https://x.org/viz/index.html?now=2026-11-10&paper=old#q=LLM&type=full",
    );
    const route = createPaperRoute({ win });
    // A copied title link doesn't leak the sender's search and filters
    expect(route.href("s1")).toBe("/viz/index.html?now=2026-11-10&paper=s1");
    route.stop();
  });
});

describe("beforeOpen (#92)", () => {
  it("runs before the paper's history entry is pushed", () => {
    const win = fakeWindow("https://x.org/viz/index.html");
    const calls = [];
    const push = win.history.pushState.bind(win.history);
    win.history.pushState = (...args) => (calls.push("push"), push(...args));
    const route = createPaperRoute({
      win,
      beforeOpen: () => calls.push("before"),
    });
    route.open("s1");
    expect(calls).toEqual(["before", "push"]);
    route.stop();
  });
});
