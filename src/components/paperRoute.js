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
  let opener = null;
  let focusOnClose = null;
  const restoreFocus = () => {
    const { element, id } = focusOnClose ?? {};
    focusOnClose = null;
    win.setTimeout(() => {
      const target = element?.isConnected
        ? element
        : id && win.document.querySelector(openerSelector(id));
      target?.focus();
    }, 50);
  };

  let value = read();
  const sync = () => {
    const next = read();
    if (next === value) return;
    value = next;
    route.dispatchEvent(new Event("input"));
    if (value == null && focusOnClose) restoreFocus();
  };
  win.addEventListener("popstate", sync);

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
    focusOnClose = opener;
    opener = null;
    const n = depth();
    if (n) return history.go(-n);
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
