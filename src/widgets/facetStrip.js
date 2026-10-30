import { html } from "htl";
import { ascending, descending, max } from "d3-array";

/**
 * Facet strip: a row of facet buttons, each opening a popover with a searchable,
 * counted list of values (crossfilter-style counts). Reactive widget
 * (https://reactivewidgets.org): `.value` is `{ [facetId]: [values] }`; it emits
 * `input` on user changes and re-renders when `.value` is set and `input` is
 * dispatched on it. Independent of the app: everything comes in via `data` and
 * options, and it is styled only with DESIGN.md tokens (CSS custom properties).
 *
 * facets: [{ id, label, accessor, format?, search?, sort?, summary? }]
 *   accessor(datum) → value or array of values
 *   format(value) → display text (default String)
 *   search: show the in-facet search box (default true)
 *   sort: "count" (default), "alpha", or a comparator over { value, label, count }
 *   summary(values) → button text for the selection, or null for the default
 * rowAction(facetId, value) → HTMLElement | null, rendered at the end of each row
 * defaultValue: what Clear all goes back to (default: nothing picked); it hides there
 */
export function facetStrip(
  data,
  {
    facets = [],
    value = {},
    defaultValue = {},
    rowAction = null,
    limit = 50,
    header = "Among matching papers",
    clearAllLabel = "Clear all",
    sheetLabel = "Filters",
    phoneQuery = "(max-width: 639.98px)",
  } = {},
) {
  injectStyle();
  const uid = `fs${++instances}`;
  const rows = data.map((d) => facets.map((f) => valuesOf(f.accessor(d))));
  let state = normalize(value, facets);
  let openId = null;

  const sheetToggle = html`<button
    type="button"
    class="fs-sheet-toggle"
    aria-expanded="false"
  ></button>`;
  const sheetDone = html`<button type="button" class="fs-sheet-done">
    Done
  </button>`;
  const clearAll = html`<button type="button" class="fs-clear-all">
    ${clearAllLabel}
  </button>`;
  const strip = html`<div class="fs-strip">
    <div class="fs-sheet-header">
      <span class="fs-sheet-title">${sheetLabel}</span>${sheetDone}
    </div>
  </div>`;
  const root = html`<div class="facet-strip">${sheetToggle}${strip}</div>`;
  const views = facets.map((facet, i) => facetView(facet, i));
  for (const view of views) strip.append(view.el);
  strip.append(clearAll);

  function facetView(facet, index) {
    const format = facet.format ?? String;
    const listId = `${uid}-${facet.id}-list`;
    const el = html`<div class="fs-facet" data-facet="${facet.id}"></div>`;
    const button = html`<button
      type="button"
      class="fs-button"
      aria-haspopup="listbox"
      aria-expanded="false"
      aria-controls="${listId}"
    ></button>`;
    const clear = html`<button
      type="button"
      class="fs-clear"
      aria-label="${`Clear ${facet.label}`}"
    >
      ✕
    </button>`;
    const search =
      facet.search === false
        ? null
        : html`<input
            type="search"
            class="fs-search"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls="${listId}"
            placeholder="${`Search ${facet.label.toLowerCase()}`}"
            aria-label="${`Search ${facet.label}`}"
          />`;
    const list = html`<ul
      class="fs-list"
      id="${listId}"
      role="listbox"
      aria-multiselectable="true"
      aria-label="${facet.label}"
    ></ul>`;
    const showAll = html`<button type="button" class="fs-show-all"></button>`;
    const popover = html`<div class="fs-popover" hidden>
      ${search ?? ""}
      <div class="fs-header">${header}</div>
      ${list}
      <div class="fs-footer">${showAll}</div>
    </div>`;
    if (!search) list.tabIndex = 0;
    el.append(button, popover);

    let showingAll = false;
    let active = -1;
    let options = [];
    const focusTarget = () => search ?? list;

    const view = {
      el,
      button,
      popover,
      renderButton() {
        const values = state[facet.id];
        el.classList.toggle("active", values.length > 0);
        const text = values.length
          ? (facet.summary?.(values) ??
            `${format(values[0])}${values.length > 1 ? ` +${values.length - 1}` : ""}`)
          : null;
        button.replaceChildren(
          html`<span class="fs-label">${facet.label}${text ? ": " : ""}</span>`,
          ...(text ? [html`<span class="fs-value">${text}</span>`] : []),
          html`<span class="fs-caret" aria-hidden="true">▾</span>`,
        );
        if (values.length) {
          if (!clear.isConnected) button.after(clear);
        } else clear.remove();
      },
      renderList() {
        const selected = new Set(state[facet.id]);
        const query = fold(search?.value ?? "");
        const all = counts(index)
          .map(({ value, count }) => ({
            value,
            count,
            label: String(format(value)),
          }))
          .filter((d) => d.count > 0 || selected.has(d.value))
          .filter((d) => !query || fold(d.label).includes(query))
          .sort(comparator(facet.sort));
        options = showingAll ? all : all.slice(0, limit);
        active = Math.min(active, options.length - 1);
        const top = max(options, (d) => d.count) || 1;
        list.replaceChildren(
          ...options.map((d, i) => {
            const on = selected.has(d.value);
            const row = html`<li
              role="option"
              id="${`${listId}-${i}`}"
              class="fs-row"
              aria-selected="${String(on)}"
              data-label="${d.label}"
            >
              <span class="fs-check" aria-hidden="true"></span>
              <span class="fs-name">${d.label}</span>
              <span class="fs-scent" aria-hidden="true"
                ><span style="${`width:${(100 * d.count) / top}%`}"></span
              ></span>
              <span class="fs-count">${d.count}</span>
            </li>`;
            row.classList.toggle("fs-active", i === active);
            row.onclick = () => {
              active = i;
              toggle(facet.id, d.value);
            };
            const action = rowAction?.(facet.id, d.value);
            if (action) {
              const wrap = html`<span class="fs-row-action">${action}</span>`;
              wrap.onclick = (event) => event.stopPropagation();
              row.append(wrap);
            }
            return row;
          }),
        );
        if (!options.length)
          list.append(html`<li class="fs-empty">No matches</li>`);
        const target = focusTarget();
        if (active >= 0)
          target.setAttribute("aria-activedescendant", `${listId}-${active}`);
        else target.removeAttribute("aria-activedescendant");
        list.children[active]?.scrollIntoView?.({ block: "nearest" });
        showAll.hidden = showingAll || all.length <= options.length;
        showAll.textContent = `Show all ${all.length}`;
      },
      open() {
        showingAll = false;
        active = -1;
        if (search) search.value = "";
        popover.hidden = false;
        button.setAttribute("aria-expanded", "true");
        el.classList.add("open");
        view.renderList();
        const room =
          (root.ownerDocument.defaultView?.innerWidth ?? 0) -
          el.getBoundingClientRect().left;
        popover.classList.toggle("fs-align-right", room > 0 && room < 340);
        focusTarget().focus();
      },
      close() {
        popover.hidden = true;
        button.setAttribute("aria-expanded", "false");
        el.classList.remove("open");
      },
    };

    button.onclick = () => {
      if (isPhone() && !root.classList.contains("fs-sheet-open"))
        setSheet(true);
      setOpen(openId === facet.id ? null : facet.id);
    };
    clear.onclick = () => {
      state = { ...state, [facet.id]: [] };
      changed();
    };
    showAll.onclick = () => {
      showingAll = true;
      view.renderList();
      focusTarget().focus();
    };
    search?.addEventListener("input", (event) => {
      event.stopPropagation(); // typing is not a value change
      active = -1;
      view.renderList();
    });
    popover.addEventListener("keydown", (event) => {
      // Keys on a row action (e.g. Watch) belong to that button
      if (event.target.closest?.(".fs-row-action")) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        active = Math.max(0, Math.min(options.length - 1, active + step));
        view.renderList();
      } else if (event.key === "Enter" || (event.key === " " && !search)) {
        event.preventDefault();
        if (options[active]) toggle(facet.id, options[active].value);
      } else if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(null);
        button.focus();
      }
    });
    return view;
  }

  function counts(index) {
    const active = facets
      .map((f, j) => [j, new Set(state[f.id])])
      .filter(([j, set]) => j !== index && set.size);
    const tally = new Map(state[facets[index].id].map((v) => [v, 0]));
    for (const row of rows) {
      if (!active.every(([j, set]) => row[j].some((v) => set.has(v)))) continue;
      for (const v of row[index]) tally.set(v, (tally.get(v) ?? 0) + 1);
    }
    return [...tally].map(([value, count]) => ({ value, count }));
  }

  function toggle(id, v) {
    const values = state[id];
    state = {
      ...state,
      [id]: values.includes(v) ? values.filter((d) => d !== v) : [...values, v],
    };
    changed();
  }

  function changed() {
    render();
    root.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function render() {
    for (const view of views) view.renderButton();
    views.find((v) => v.el.dataset.facet === openId)?.renderList();
    const n = facets.filter((f) => state[f.id].length).length;
    sheetToggle.textContent = `${sheetLabel} (${n})`;
    root.classList.toggle("fs-has-active", n > 0);
    const initial = normalize(defaultValue, facets);
    clearAll.hidden = facets.every(
      (f) =>
        state[f.id].length === initial[f.id].length &&
        state[f.id].every((v) => initial[f.id].includes(v)),
    );
  }

  function setOpen(id) {
    if (openId === id) return;
    views.find((v) => v.el.dataset.facet === openId)?.close();
    openId = id;
    const view = views.find((v) => v.el.dataset.facet === id);
    if (view) {
      view.open();
      root.ownerDocument.addEventListener("click", onOutsideClick);
    } else root.ownerDocument.removeEventListener("click", onOutsideClick);
  }

  function onOutsideClick(event) {
    if (!root.isConnected)
      return root.ownerDocument.removeEventListener("click", onOutsideClick);
    if (event.composedPath().includes(root)) return;
    setOpen(null);
  }

  function setSheet(open) {
    root.classList.toggle("fs-sheet-open", open);
    sheetToggle.setAttribute("aria-expanded", String(open));
    if (!open) setOpen(null);
  }

  function isPhone() {
    return (
      root.ownerDocument.defaultView?.matchMedia?.(phoneQuery).matches ?? false
    );
  }

  sheetToggle.onclick = () =>
    setSheet(!root.classList.contains("fs-sheet-open"));
  sheetDone.onclick = () => setSheet(false);
  clearAll.onclick = () => {
    state = normalize(defaultValue, facets);
    changed();
  };
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && root.classList.contains("fs-sheet-open")) {
      setSheet(false);
      sheetToggle.focus();
    }
  });
  // Driven from outside: set .value, then dispatch input.
  root.addEventListener("input", (event) => {
    if (event.target === root) render();
  });

  Object.defineProperty(root, "value", {
    get: () => state,
    set: (v) => {
      state = normalize(v, facets);
      render();
    },
  });
  render();
  return root;
}

/** Data matching every facet's selection: AND across facets, OR within one. */
export function facetFilter(data, facets, value = {}) {
  const active = facets
    .filter((f) => value[f.id]?.length)
    .map((f) => [f.accessor, new Set(value[f.id])]);
  return data.filter((d) =>
    active.every(([accessor, set]) =>
      valuesOf(accessor(d)).some((v) => set.has(v)),
    ),
  );
}

let instances = 0;

function valuesOf(v) {
  const values = Array.isArray(v) ? v : [v];
  return [...new Set(values.filter((d) => d != null && d !== ""))];
}

function normalize(value, facets) {
  return Object.fromEntries(
    facets.map((f) => [f.id, [...(value?.[f.id] ?? [])]]),
  );
}

/** Lowercase without accents, for in-facet search. */
function fold(text) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

function comparator(sort = "count") {
  if (typeof sort === "function") return sort;
  const byLabel = (a, b) =>
    a.label.localeCompare(b.label) || ascending(a.label, b.label);
  if (sort === "alpha") return byLabel;
  return (a, b) => descending(a.count, b.count) || byLabel(a, b);
}

const STYLE_ID = "facet-strip-style";

function injectStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID))
    return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

// Tokens from docs/DESIGN.md, as CSS custom properties with fallbacks.
const CSS = `
.facet-strip {
  --fs-bg: var(--color-background, #fcf9f3);
  --fs-surface: var(--color-surface, #fffdfa);
  --fs-sunken: var(--color-surface-sunken, #f6efe1);
  --fs-hover: var(--color-surface-hover, #ece7df);
  --fs-ink: var(--color-on-surface, #241e1a);
  --fs-muted: var(--color-on-surface-muted, #605954);
  --fs-outline: var(--color-outline, #d8d3cc);
  --fs-primary: var(--color-primary, #903129);
  --fs-on-primary: var(--color-on-primary, #fbf8f1);
  --fs-focus: var(--color-focus, #1f74bf);
  --fs-shadow: var(--elevation-1, 0 12px 32px -12px rgb(36 30 26 / 0.28), 0 2px 6px -2px rgb(36 30 26 / 0.12));
  font-family: var(--font-sans, "Source Sans 3", system-ui, sans-serif);
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.2;
  color: var(--fs-ink);
  margin: 8px 0;
}
.facet-strip button { font: inherit; color: inherit; cursor: pointer; }
.facet-strip :focus-visible { outline: 2px solid var(--fs-focus); outline-offset: 2px; }
.fs-strip { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.fs-sheet-toggle, .fs-sheet-header { display: none; }
.fs-facet { position: relative; display: inline-flex; align-items: stretch; }
.fs-button, .fs-clear {
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--fs-muted);
  border-radius: var(--rounded-sm, 3px);
  background: var(--fs-bg);
  white-space: nowrap;
}
.fs-button { display: inline-flex; align-items: center; gap: 4px; }
.fs-label { color: var(--fs-muted); }
.fs-facet:not(.active) .fs-label { color: var(--fs-ink); }
.fs-value { max-width: 16em; overflow: hidden; text-overflow: ellipsis; }
.fs-caret { color: var(--fs-muted); font-size: 0.8em; }
.fs-facet.active .fs-button, .fs-facet.active .fs-clear { background: var(--fs-sunken); border-color: var(--fs-sunken); }
.fs-facet.active .fs-button { border-top-right-radius: 0; border-bottom-right-radius: 0; padding-right: 6px; }
.fs-clear { padding: 0 8px 0 4px; border-top-left-radius: 0; border-bottom-left-radius: 0; color: var(--fs-muted); }
.fs-clear:hover { color: var(--fs-ink); }
.fs-facet.open .fs-button { background: var(--fs-ink); border-color: var(--fs-ink); color: var(--fs-bg); }
.fs-facet.open .fs-button .fs-label, .fs-facet.open .fs-button .fs-caret { color: inherit; }
.fs-clear-all {
  border: none;
  background: none;
  color: var(--fs-primary);
  padding: 0 4px 0 12px;
  height: 30px;
  margin-left: 4px;
  border-left: 1px solid var(--fs-outline);
  border-radius: 0;
}
.fs-clear-all[hidden] { display: none; }
.fs-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 40;
  box-sizing: border-box;
  width: 320px;
  max-width: calc(100vw - 32px);
  padding: 12px 0 8px;
  background: var(--fs-surface);
  border: 1px solid var(--fs-outline);
  border-radius: var(--rounded-md, 6px);
  box-shadow: var(--fs-shadow);
  font-weight: 400;
}
.fs-popover[hidden] { display: none; }
.fs-popover.fs-align-right { left: auto; right: 0; }
.fs-search {
  box-sizing: border-box;
  width: calc(100% - 24px);
  margin: 0 12px 8px;
  padding: 4px 0;
  border: none;
  border-bottom: 1.5px solid var(--fs-ink);
  border-radius: 0;
  background: transparent;
  color: var(--fs-ink);
  font: inherit;
  font-size: 0.9375rem;
}
.fs-search:focus { outline: none; border-bottom-color: var(--fs-focus); }
.fs-header {
  margin: 4px 12px;
  color: var(--fs-muted);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.fs-list { list-style: none; margin: 0; padding: 0; max-height: 300px; overflow-y: auto; }
.fs-list:focus { outline: none; }
.fs-row {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) 40px 3.5em auto;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 2px 12px;
  cursor: pointer;
}
.fs-row:hover { background: var(--fs-hover); }
.fs-row.fs-active { background: var(--fs-sunken); box-shadow: inset 2px 0 0 var(--fs-focus); }
.fs-check {
  box-sizing: border-box;
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--fs-muted);
  border-radius: 2px;
}
.fs-row[aria-selected="true"] .fs-check { background: var(--fs-primary); border-color: var(--fs-primary); position: relative; }
.fs-row[aria-selected="true"] .fs-check::after {
  content: "";
  position: absolute;
  left: 3px;
  top: 0;
  width: 4px;
  height: 8px;
  border: solid var(--fs-on-primary);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.fs-name { overflow-wrap: anywhere; }
.fs-scent { display: block; height: 4px; background: var(--fs-outline); border-radius: 2px; overflow: hidden; }
.fs-scent > span { display: block; height: 100%; background: var(--fs-primary); }
.fs-count { text-align: right; color: var(--fs-muted); font-size: 0.78125rem; font-feature-settings: "tnum" 1; }
.fs-row-action:empty { display: none; }
.fs-empty { padding: 8px 12px; color: var(--fs-muted); }
.fs-footer { padding: 4px 12px 0; }
.fs-show-all { border: none; background: none; padding: 4px 0; color: var(--fs-primary); }
.fs-show-all[hidden] { display: none; }
@media (max-width: 639.98px) {
  .fs-sheet-toggle {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--fs-muted);
    border-radius: var(--rounded-sm, 3px);
    background: var(--fs-surface);
  }
  .facet-strip.fs-has-active .fs-sheet-toggle { background: var(--fs-sunken); border-color: var(--fs-sunken); }
  /* Closed sheet: only the active facets show, as chips next to "Filters (n)" */
  .facet-strip:not(.fs-sheet-open) { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .facet-strip:not(.fs-sheet-open) .fs-facet:not(.active),
  .facet-strip:not(.fs-sheet-open) .fs-clear-all { display: none; }
  .facet-strip:not(.fs-sheet-open) .fs-button,
  .facet-strip:not(.fs-sheet-open) .fs-clear { height: 44px; }
  .fs-sheet-open .fs-strip {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
    max-height: 85vh;
    overflow-y: auto;
    flex-direction: column;
    align-items: stretch;
    flex-wrap: nowrap;
    gap: 8px;
    padding: 0 16px 16px;
    background: var(--fs-surface);
    border-radius: var(--rounded-lg, 12px) var(--rounded-lg, 12px) 0 0;
    box-shadow: var(--fs-shadow), 0 0 0 100vmax rgb(36 30 26 / 0.3);
  }
  .fs-sheet-open .fs-sheet-header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    background: var(--fs-surface);
  }
  .fs-sheet-title { font-family: var(--font-serif, Newsreader, Georgia, serif); font-size: 1.25rem; font-style: italic; }
  .fs-sheet-done { min-height: 44px; padding: 0 14px; border: none; border-radius: var(--rounded-sm, 3px); background: var(--fs-primary); color: var(--fs-on-primary) !important; }
  .fs-sheet-open .fs-facet { flex-wrap: wrap; }
  .fs-sheet-open .fs-button { flex: 1; height: 44px; }
  .fs-sheet-open .fs-caret { margin-left: auto; }
  .fs-sheet-open .fs-clear { height: 44px; }
  .fs-sheet-open .fs-popover {
    position: static;
    flex-basis: 100%;
    width: 100%;
    max-width: none;
    box-shadow: none;
    border: none;
    border-bottom: 1px solid var(--fs-outline);
    border-radius: 0;
  }
  .fs-sheet-open .fs-row { min-height: 44px; }
  .fs-sheet-open .fs-clear-all { height: 44px; border-left: none; padding-left: 4px; margin: 0; align-self: flex-start; }
}
@media (prefers-reduced-motion: no-preference) {
  .fs-popover { animation: fs-in 150ms ease-out; }
  .fs-sheet-open .fs-strip { animation: fs-up 200ms ease-out; }
}
@keyframes fs-in { from { opacity: 0; transform: translateY(-4px); } }
@keyframes fs-up { from { transform: translateY(100%); } }
`;
