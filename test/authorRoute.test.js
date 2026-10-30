// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createAuthorRoute } from "../src/components/authorRoute.js";

/** A window with a synchronous fake history. */
function fakeWindow(href) {
  const win = new EventTarget();
  const entries = [href];
  let index = 0;
  win.location = {
    get href() {
      return entries[index];
    },
  };
  win.history = {
    state: null,
    replaceState(state, __, url) {
      this.state = state;
      entries[index] = String(url);
    },
    pushState(_, __, url) {
      entries.splice(index + 1);
      entries.push(String(url));
      index++;
    },
    back() {
      index--;
      win.dispatchEvent(new Event("popstate"));
    },
    forward() {
      index++;
      win.dispatchEvent(new Event("popstate"));
    },
  };
  return win;
}

const base = "https://example.org/vis/authors.html";

describe("createAuthorRoute (#78)", () => {
  it("reads the profile name from ?name=", () => {
    expect(
      createAuthorRoute({ win: fakeWindow(`${base}?name=Ann+Lee`) }).value,
    ).toBe("Ann Lee");
    expect(createAuthorRoute({ win: fakeWindow(base) }).value).toBeNull();
  });

  it("opens profiles as history entries; Back and Forward move between them", () => {
    const win = fakeWindow(base);
    const route = createAuthorRoute({ win });
    const onInput = vi.fn();
    route.addEventListener("input", onInput);
    route.open("Ann Lee");
    expect(win.location.href).toBe(`${base}?name=Ann+Lee`);
    expect(route.value).toBe("Ann Lee");
    route.open("Bo");
    win.history.back();
    expect(route.value).toBe("Ann Lee");
    win.history.back();
    expect(route.value).toBeNull();
    win.history.forward();
    expect(route.value).toBe("Ann Lee");
    expect(onInput).toHaveBeenCalledTimes(5);
  });

  it("drops an open paper's details when opening a profile, and back to the index", () => {
    const win = fakeWindow(`${base}?name=Ann&paper=p1`);
    const route = createAuthorRoute({ win });
    route.open("Bo");
    expect(win.location.href).toBe(`${base}?name=Bo`);
    route.open(null);
    expect(win.location.href).toBe(base);
  });

  it("keeps other params such as ?now= (changes only name and paper)", () => {
    const now = "now=2026-11-10T15%3A14%3A00Z";
    const win = fakeWindow(`${base}?${now}&name=Ann&paper=p1`);
    const route = createAuthorRoute({ win });
    route.open("Bo");
    expect(win.location.href).toBe(`${base}?${now}&name=Bo`);
    route.open(null);
    expect(win.location.href).toBe(`${base}?${now}`);
  });

  it("intercepts plain clicks on links to this page", () => {
    const win = fakeWindow(base);
    const route = createAuthorRoute({ win });
    const root = document.createElement("div");
    root.innerHTML = `<a id="same" href="${base}?name=Cy">Cy</a><a id="other" href="https://example.org/vis/my-papers.html">My</a>`;
    document.body.append(root);
    route.intercept(root);
    const same = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    root.querySelector("#same").dispatchEvent(same);
    expect(same.defaultPrevented).toBe(true);
    expect(route.value).toBe("Cy");
    const other = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    root.querySelector("#other").dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    const withMeta = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      metaKey: true,
    });
    root.querySelector("#same").dispatchEvent(withMeta);
    expect(withMeta.defaultPrevented).toBe(false);
    root.remove();
  });
});

describe("Researchers index search in the URL (#92)", () => {
  it("reads the search from #q= (the fragment never reaches the server)", () => {
    expect(createAuthorRoute({ win: fakeWindow(`${base}#q=Lee`) }).query).toBe(
      "Lee",
    );
    expect(createAuthorRoute({ win: fakeWindow(base) }).query).toBe("");
  });

  it("writes the search with replaceState on the index (no history entry)", () => {
    const win = fakeWindow(`${base}?now=x`);
    const route = createAuthorRoute({ win });
    const push = vi.spyOn(win.history, "pushState");
    route.setQuery("Lee, A & B");
    const url = new URL(win.location.href);
    expect(new URLSearchParams(url.hash.slice(1)).get("q")).toBe("Lee, A & B");
    expect(url.searchParams.has("q")).toBe(false);
    expect(new URL(win.location.href).searchParams.get("now")).toBe("x");
    route.setQuery("");
    expect(win.location.href).toBe(`${base}?now=x`);
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps the search out of profile URLs and back on the index", () => {
    const win = fakeWindow(base);
    const route = createAuthorRoute({ win });
    route.setQuery("Lee");
    route.open("Ann Lee");
    expect(win.location.href).toBe(`${base}?name=Ann+Lee`);
    // on a profile, the search isn't written
    route.setQuery("Other");
    expect(win.location.href).toBe(`${base}?name=Ann+Lee`);
    route.open(null);
    expect(win.location.href).toBe(`${base}#q=Other`);
    // Back to the index entry: it still has the search it was left with
    win.history.back();
    win.history.back();
    expect(win.location.href).toBe(`${base}#q=Lee`);
  });
});
