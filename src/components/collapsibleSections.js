import { STACKED_QUERY } from "../lib/breakpoints.js";

/**
 * Collapsible sections on My Papers in one column (#160). Below 1024px the page is one long
 * column and Watching and Recommended papers push All my papers far down (y≈2,400 on a phone),
 * so there their headings become disclosure buttons ("Watching 2", aria-expanded) that start
 * collapsed; what the reader opens is remembered on this device (OPEN_SECTIONS_KEY). Desktop's
 * side column shows everything: no buttons there.
 *
 * `sections` are {name, count, unit}: the `.mp-<name>` block inside `layout`, `count(block)`
 * (a number, or null for none, the default: no number at all) and the count's
 * [singular, plural] word, which only screen readers hear ("Watching (2 watches)").
 *
 * The state lives on `root` (<html>) as `data-open-sections="watching …"`, which style.css folds
 * by: the head script (observablehq.config.js) writes it from storage before the page draws, so
 * nothing flashes open or closed while the page's cells run (#162). The heading itself can be
 * re-rendered (the Watching component draws its own): a MutationObserver puts the button back
 * and keeps the count current. Returns a function that removes the buttons and stops listening.
 */
export const OPEN_SECTIONS_KEY = "papersNavigator:openSections";

function readOpen(storage) {
  try {
    const value = JSON.parse(storage?.getItem(OPEN_SECTIONS_KEY) ?? "[]");
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

export function collapsibleSections(
  layout,
  {
    sections,
    query = STACKED_QUERY,
    win = globalThis,
    storage = globalThis.localStorage,
    root = layout.ownerDocument.documentElement,
  },
) {
  const doc = layout.ownerDocument;
  const media = win.matchMedia?.(query);
  const open = readOpen(storage);
  const publish = () => (root.dataset.openSections = [...open].join(" "));
  const save = () => {
    publish();
    try {
      storage?.setItem(OPEN_SECTIONS_KEY, JSON.stringify([...open]));
    } catch {
      // Private mode etc.: the section still opens for this page view
    }
  };
  const block = (name) => layout.querySelector(`.mp-${name}`);
  // Framework wraps a markdown heading's text in an anchor link: a link can't sit inside a
  // button, so it waits here while the heading is a button and gets its text back on desktop
  const anchors = new WeakMap();

  const setCount = (badge, n, [one, many]) => {
    const key = n == null ? "" : String(n);
    if (badge.dataset.n === key) return;
    badge.dataset.n = key;
    badge.replaceChildren();
    if (n == null) return;
    const visible = doc.createElement("span");
    visible.setAttribute("aria-hidden", "true");
    visible.textContent = key;
    const spoken = doc.createElement("span");
    spoken.className = "sr-only";
    spoken.textContent = ` (${n} ${n === 1 ? one : many})`;
    badge.append(visible, spoken);
  };

  const enhance = (section) => {
    const { name, count = () => null, unit = ["", ""] } = section;
    const el = block(name);
    const heading = el?.querySelector("h2");
    if (!heading) return;
    const expanded = open.has(name);
    let button = heading.querySelector(":scope > .section-toggle");
    if (!button) {
      button = doc.createElement("button");
      button.type = "button";
      button.className = "section-toggle";
      const anchor = heading.querySelector(
        ":scope > a.observablehq-header-anchor",
      );
      if (anchor) {
        anchors.set(button, anchor);
        anchor.replaceWith(...anchor.childNodes);
      }
      button.append(...heading.childNodes);
      const badge = doc.createElement("span");
      badge.className = "section-count";
      button.append(badge);
      heading.append(button);
      button.addEventListener("click", () => {
        if (open.has(name)) open.delete(name);
        else open.add(name);
        save();
        enhance(section);
      });
    }
    button.setAttribute("aria-expanded", String(expanded));
    setCount(button.querySelector(".section-count"), count(el), unit);
  };

  const plain = ({ name }) => {
    const el = block(name);
    for (const button of el?.querySelectorAll("h2 > .section-toggle") ?? []) {
      const heading = button.parentElement;
      const focused = doc.activeElement === button;
      button.querySelector(".section-count")?.remove();
      const anchor = anchors.get(button);
      if (anchor) {
        anchor.append(...button.childNodes);
        button.replaceWith(anchor);
      } else button.replaceWith(...button.childNodes);
      // Crossing the breakpoint with the toggle focused (a tablet turned): keep the keyboard here
      if (focused) {
        if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
  };

  const stacked = () => !!media?.matches;
  const apply = () => sections.forEach(stacked() ? enhance : plain);

  const Observer = win.MutationObserver ?? globalThis.MutationObserver;
  const observer = Observer
    ? new Observer(() => {
        if (stacked()) sections.forEach(enhance);
      })
    : null;
  for (const { name } of sections) {
    const el = block(name);
    if (el)
      observer?.observe(el, {
        childList: true,
        subtree: true,
        attributeFilter: ["data-count"],
      });
  }
  publish();
  apply();
  media?.addEventListener?.("change", apply);
  return () => {
    media?.removeEventListener?.("change", apply);
    observer?.disconnect();
    sections.forEach(plain);
  };
}
