/**
 * Researchers page URL state (#78): `authors.html` is the index, `authors.html?name=<name>` a
 * profile. The URL is the source of truth, so a profile can be shared or reloaded, and each
 * profile you open is a history entry: Back/Forward move between the index and profiles.
 *
 * Reactive object (reactivewidgets.org): `.value` is the name in the URL or null; emits `input`
 * when it changes. `open(name)` (null = the index), `intercept(root)` handles clicks on links
 * to this page in place (no reload), `stop()`.
 */
export function createAuthorRoute({
  win = globalThis.window,
  param = "name",
} = {}) {
  const route = new EventTarget();
  const read = () => new URL(win.location.href).searchParams.get(param) || null;
  let value = read();
  const sync = () => {
    const next = read();
    if (next === value) return;
    value = next;
    route.dispatchEvent(new Event("input"));
  };
  win.addEventListener("popstate", sync);

  route.open = (name) => {
    const url = new URL(win.location.href);
    // A profile is its own view: an open paper's details and other params don't carry over
    url.search = "";
    url.hash = "";
    if (name) url.searchParams.set(param, name);
    if (url.href === win.location.href) return;
    win.history.pushState({}, "", url);
    // pushState fires no popstate: tell every route on the page (e.g. an open paper's details,
    // whose ?paper= is now gone) that the URL changed
    win.dispatchEvent(new Event("popstate"));
    win.scrollTo?.(0, 0);
  };

  /** Same-page links (`authors.html`, `authors.html?name=…`) under `root` open in place. */
  route.intercept = (root) => {
    const onClick = (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const a = event.target.closest?.("a[href]");
      if (!a || a.target) return;
      const url = new URL(a.href, win.location.href);
      const here = new URL(win.location.href);
      if (url.origin !== here.origin || url.pathname !== here.pathname) return;
      event.preventDefault();
      route.open(url.searchParams.get(param));
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  };

  route.stop = () => win.removeEventListener("popstate", sync);
  Object.defineProperty(route, "value", { get: () => value });
  return route;
}
