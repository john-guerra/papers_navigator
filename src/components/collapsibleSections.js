import { STACKED_QUERY } from "../lib/breakpoints.js";

/**
 * Collapsible sections on My Papers in one column (#160). Below 1024px the page is one long
 * column and Watching and Recommended papers push All my papers far down (y≈2,400 on a phone),
 * so there their headings become disclosure buttons ("Watching 2", aria-expanded) that start
 * collapsed; what the reader opens is remembered on this device (OPEN_SECTIONS_KEY). Desktop's
 * side column shows everything: no buttons there.
 *
 * `sections` are {name, count}: the `.mp-<name>` block inside `layout` and a selector for what
 * the heading counts. The state lives on the block (`is-collapsed`, style.css hides all but the
 * heading), which the page never re-renders, while the heading itself can be re-rendered (the
 * Watching component draws its own): a MutationObserver puts the button back and keeps the count
 * current. Returns a function that removes the buttons and stops listening.
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
  },
) {
  const doc = layout.ownerDocument;
  const media = win.matchMedia?.(query);
  const open = readOpen(storage);
  const save = () => {
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

  const enhance = ({ name, count }) => {
    const el = block(name);
    const heading = el?.querySelector("h2");
    if (!heading) return;
    const expanded = open.has(name);
    el.classList.toggle("is-collapsed", !expanded);
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
        enhance({ name, count });
      });
    }
    button.setAttribute("aria-expanded", String(expanded));
    const badge = button.querySelector(".section-count");
    const n = String(el.querySelectorAll(count).length);
    if (badge.textContent !== n) badge.textContent = n;
  };

  const plain = ({ name }) => {
    const el = block(name);
    el?.classList.remove("is-collapsed");
    for (const button of el?.querySelectorAll("h2 > .section-toggle") ?? []) {
      button.querySelector(".section-count")?.remove();
      const anchor = anchors.get(button);
      if (anchor) {
        anchor.append(...button.childNodes);
        button.replaceWith(anchor);
      } else button.replaceWith(...button.childNodes);
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
    if (el) observer?.observe(el, { childList: true, subtree: true });
  }
  apply();
  media?.addEventListener?.("change", apply);
  return () => {
    media?.removeEventListener?.("change", apply);
    observer?.disconnect();
    sections.forEach(plain);
  };
}
