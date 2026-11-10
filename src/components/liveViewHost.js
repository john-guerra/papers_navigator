import { html } from "htl";

/**
 * A stable container for the Live page's main view (#203). The page displays it once; each
 * clock tick calls `show(key, build, at)`: a new key builds a new view (disposing the old one),
 * the same key only calls the view's `setNow(at)`. The view is never removed and re-inserted,
 * so a note being typed keeps its focus (and the phone keeps its keyboard). `host.current` is
 * the view shown.
 */
export function createViewHost() {
  const host = html`<div class="live-view"></div>`;
  let key = null;
  host.current = null;
  host.show = (nextKey, build, at) => {
    if (nextKey === key && host.current) {
      host.current.setNow?.(at);
      return host.current;
    }
    host.current?.dispose?.();
    key = nextKey;
    host.current = build();
    host.replaceChildren(host.current);
    return host.current;
  };
  return host;
}
