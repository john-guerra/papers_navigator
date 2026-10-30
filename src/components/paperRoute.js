/**
 * Paper details URL state (#22, #70), shared by Explore and My Papers: `?paper=<shortId>` is the
 * source of truth, so a details view can be shared or reloaded, and Back closes it.
 *
 * `history.state.paperDetail` counts the details views pushed on top of the list (related papers
 * stack), so one Close goes back past all of them. A direct `?paper=A` link has no list under it:
 * on load the route puts one there (replaceState to the list, pushState the paper), so the stack
 * always starts at the list, and Close (or Back) from A, or from a related paper opened from A,
 * lands on the list instead of on A or off the site.
 *
 * Reactive object (reactivewidgets.org): `.value` is the open paper's key or null; emits `input`
 * when it changes. `open(key)`, `close()`, `stop()`.
 */
export function createPaperRoute({
  win = globalThis.window,
  param = "paper",
  openerSelector = (id) =>
    `[data-paper-id="${CSS.escape(id)}"] .paper-details-open`,
  resolveId = (key) => key,
} = {}) {
  const route = new EventTarget();
  const { history } = win;
  const read = () => new URL(win.location.href).searchParams.get(param);
  const depth = () => history.state?.paperDetail ?? 0;
  const withDepth = (n) => {
    const { paperDetail, ...rest } = history.state ?? {}; // eslint-disable-line no-unused-vars
    return n ? { ...rest, paperDetail: n } : rest;
  };

  // A direct link: put the list under it (once; history.state survives reloads)
  if (read() != null && !depth()) {
    const paperUrl = win.location.href;
    const listUrl = new URL(paperUrl);
    listUrl.searchParams.delete(param);
    history.replaceState(withDepth(0), "", listUrl);
    history.pushState(withDepth(1), "", paperUrl);
  }

  // Close returns focus to the Details button that opened the panel: the same button if it's
  // still on the page, else (the list re-rendered meanwhile) that row's button, by paper id.
  // Focus moves once the panel is gone (history.go is async; the page re-renders after `input`).
  // Without an opener (a direct link): the row of the paper the stack started with, else the
  // page's main heading, never <body>.
  const rootKey = read();
  let opener = rootKey != null ? { id: resolveId(rootKey) } : null;
  let focusOnClose = null;
  const restoreFocus = () => {
    const { element, id } = focusOnClose ?? {};
    focusOnClose = null;
    win.setTimeout(() => {
      const { document } = win;
      const heading = document.querySelector("h1");
      const target = element?.isConnected
        ? element
        : (id && document.querySelector(openerSelector(id))) || heading;
      if (target && target === heading) heading.setAttribute("tabindex", "-1");
      target?.focus();
    }, 50);
  };
  // history.go is async: a second Close before popstate arrives (held Esc, double click)
  // would go back past the list, off the site
  let closing = false;

  let value = read();
  const sync = () => {
    closing = false;
    const next = read();
    if (next === value) return;
    value = next;
    route.dispatchEvent(new Event("input"));
    if (value == null && focusOnClose) restoreFocus();
  };
  win.addEventListener("popstate", sync);

  /** Link to paper `key`'s details on this page (other params kept), for real <a href>s. */
  route.href = (key) => {
    const url = new URL(win.location.href);
    url.searchParams.set(param, key);
    return url.pathname + url.search;
  };
  route.open = (key) => {
    if (!depth()) {
      const element = win.document.activeElement;
      const id = element?.closest?.("[data-paper-id]")?.dataset.paperId;
      opener = id ? { element, id } : null;
    }
    const url = new URL(win.location.href);
    url.searchParams.set(param, key);
    history.pushState(withDepth(depth() + 1), "", url);
    sync();
  };
  route.close = () => {
    if (closing) return;
    focusOnClose = opener ?? { id: null };
    opener = null;
    const n = depth();
    if (n) {
      closing = true;
      return history.go(-n);
    }
    // Defensive: a details URL without a counted stack (e.g. state lost)
    const url = new URL(win.location.href);
    url.searchParams.delete(param);
    history.replaceState(withDepth(0), "", url);
    sync();
  };
  route.stop = () => win.removeEventListener("popstate", sync);
  Object.defineProperty(route, "value", { get: () => value });
  return route;
}
