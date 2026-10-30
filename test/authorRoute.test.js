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
