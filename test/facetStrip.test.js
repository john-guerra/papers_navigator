// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { facetStrip, facetFilter } from "../src/widgets/facetStrip.js";

const papers = [
  { id: 1, type: "full", authors: ["Ann", "Bo"] },
  { id: 2, type: "full", authors: ["Ann"] },
  { id: 3, type: "short", authors: ["Bo", "Cy"] },
  { id: 4, type: "poster", authors: ["Dee"] },
  { id: 5, type: "full", authors: ["Éva"] },
];

const facets = [
  {
    id: "type",
    label: "Type",
    accessor: (p) => p.type,
    format: (v) => v.toUpperCase(),
  },
  { id: "author", label: "Author", accessor: (p) => p.authors },
];

const make = (options = {}) => {
  const widget = facetStrip(papers, { facets, ...options });
  document.body.append(widget);
  return widget;
};

const facetEl = (widget, id) => widget.querySelector(`[data-facet="${id}"]`);
const open = (widget, id) => {
  facetEl(widget, id).querySelector(".fs-button").click();
  return facetEl(widget, id).querySelector(".fs-popover");
};
const rows = (popover) => [...popover.querySelectorAll("[role=option]")];
const rowData = (popover) =>
  rows(popover).map((r) => [
    r.dataset.label,
    Number(r.querySelector(".fs-count").textContent),
  ]);
const key = (target, k) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));

afterEach(() => (document.body.innerHTML = ""));

describe("facetStrip value/input contract", () => {
  it("starts with the given value, filling missing facets with []", () => {
    expect(make({ value: { type: ["full"] } }).value).toEqual({
      type: ["full"],
      author: [],
    });
  });

  it("emits input with the new value when a row is clicked", () => {
    const widget = make();
    const events = [];
    widget.addEventListener("input", () => events.push(widget.value));
    const popover = open(widget, "author");
    rows(popover)
      .find((r) => r.dataset.label === "Bo")
      .click();
    expect(events).toEqual([{ type: [], author: ["Bo"] }]);
    rows(popover)
      .find((r) => r.dataset.label === "Bo")
      .click();
    expect(widget.value.author).toEqual([]);
  });

  it("updates its buttons when .value is set from outside and input is dispatched", () => {
    const widget = make();
    widget.value = { author: ["Ann", "Cy"] };
    widget.dispatchEvent(new Event("input", { bubbles: true }));
    const button = facetEl(widget, "author").querySelector(".fs-button");
    expect(button.textContent).toContain("Author: Ann +1");
    expect(facetEl(widget, "author").classList.contains("active")).toBe(true);
    expect(widget.value).toEqual({ type: [], author: ["Ann", "Cy"] });
  });

  it("shows the value with format and a ✕ that clears that facet", () => {
    const widget = make({ value: { type: ["full"] } });
    expect(
      facetEl(widget, "type").querySelector(".fs-button").textContent,
    ).toContain("Type: FULL");
    let fired = 0;
    widget.addEventListener("input", () => fired++);
    facetEl(widget, "type").querySelector(".fs-clear").click();
    expect(fired).toBe(1);
    expect(widget.value.type).toEqual([]);
    expect(facetEl(widget, "type").querySelector(".fs-clear")).toBeNull();
  });

  it("uses a facet summary for the button label when given", () => {
    const widget = make({
      facets: [
        {
          ...facets[0],
          summary: (values) => (values.length === 2 ? "Main tracks" : null),
        },
        facets[1],
      ],
      value: { type: ["full", "short"] },
    });
    expect(
      facetEl(widget, "type").querySelector(".fs-button").textContent,
    ).toContain("Type: Main tracks");
  });

  it("Clear all empties every facet", () => {
    const widget = make({ value: { type: ["full"], author: ["Ann"] } });
    widget.querySelector(".fs-clear-all").click();
    expect(widget.value).toEqual({ type: [], author: [] });
    expect(widget.querySelector(".fs-clear-all").hidden).toBe(true);
  });
});

describe("facetStrip counts", () => {
  it("counts each facet with all the other facets applied (crossfilter)", () => {
    const widget = make({ value: { type: ["full"] } });
    // Author counts only full papers
    expect(rowData(open(widget, "author"))).toEqual([
      ["Ann", 2],
      ["Bo", 1],
      ["Éva", 1],
    ]);
    // Type counts ignore the type selection itself
    expect(rowData(open(widget, "type"))).toEqual([
      ["FULL", 3],
      ["POSTER", 1],
      ["SHORT", 1],
    ]);
  });

  it("keeps selected values listed even when another facet zeroes them", () => {
    const widget = make({ value: { type: ["poster"], author: ["Ann"] } });
    expect(rowData(open(widget, "author"))).toContainEqual(["Ann", 0]);
  });

  it("facetFilter applies AND across facets and OR within one", () => {
    const value = { type: ["full", "short"], author: ["Bo"] };
    expect(facetFilter(papers, facets, value).map((p) => p.id)).toEqual([1, 3]);
  });
});

describe("facetStrip popover", () => {
  it("filters rows with the in-facet search, ignoring case and accents", () => {
    const widget = make();
    const popover = open(widget, "author");
    const input = popover.querySelector("input");
    input.value = "eva";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(rowData(popover)).toEqual([["Éva", 1]]);
  });

  it("does not leak the search box's input event as a value change", () => {
    const widget = make();
    let fired = 0;
    widget.addEventListener("input", () => fired++);
    const input = open(widget, "author").querySelector("input");
    input.value = "a";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(fired).toBe(0);
  });

  it("renders rowAction per row and clicking it does not toggle the row", () => {
    const calls = [];
    const widget = make({
      rowAction: (facetId, value) => {
        calls.push([facetId, value]);
        if (facetId !== "author") return null;
        const b = document.createElement("button");
        b.className = "watch";
        b.textContent = "Watch";
        return b;
      },
    });
    const authorRows = rows(open(widget, "author"));
    expect(authorRows.every((r) => r.querySelector(".watch"))).toBe(true);
    expect(calls).toContainEqual(["author", "Ann"]);
    authorRows[0].querySelector(".watch").click();
    expect(widget.value.author).toEqual([]);
    expect(
      rows(open(widget, "type")).some((r) => r.querySelector(".watch")),
    ).toBe(false);
  });

  it("shows only `limit` rows with a Show all footer", () => {
    const widget = make({ limit: 2 });
    const popover = open(widget, "author");
    expect(rows(popover)).toHaveLength(2);
    const more = popover.querySelector(".fs-show-all");
    expect(more.textContent).toContain("Show all 5");
    more.click();
    expect(rows(popover)).toHaveLength(5);
  });

  it("opens one popover at a time and sets aria-expanded", () => {
    const widget = make();
    const typeButton = facetEl(widget, "type").querySelector(".fs-button");
    const authorButton = facetEl(widget, "author").querySelector(".fs-button");
    expect(typeButton.getAttribute("aria-expanded")).toBe("false");
    typeButton.click();
    expect(typeButton.getAttribute("aria-expanded")).toBe("true");
    authorButton.click();
    expect(typeButton.getAttribute("aria-expanded")).toBe("false");
    expect(authorButton.getAttribute("aria-expanded")).toBe("true");
    expect(widget.querySelectorAll(".fs-popover:not([hidden])")).toHaveLength(
      1,
    );
  });

  it("supports the listbox keyboard pattern: arrows, Enter, Escape", () => {
    const widget = make();
    const popover = open(widget, "author");
    const input = popover.querySelector("input");
    expect(input.getAttribute("role")).toBe("combobox");
    key(input, "ArrowDown");
    key(input, "ArrowDown");
    const active = popover.querySelector(
      `#${input.getAttribute("aria-activedescendant")}`,
    );
    expect(active.dataset.label).toBe("Bo");
    key(input, "Enter");
    expect(widget.value.author).toEqual(["Bo"]);
    expect(
      rows(popover)
        .find((r) => r.dataset.label === "Bo")
        .getAttribute("aria-selected"),
    ).toBe("true");
    key(input, "ArrowUp");
    key(input, "Enter");
    expect(widget.value.author).toEqual(["Bo", "Ann"]);
    key(input, "Escape");
    expect(popover.hidden).toBe(true);
    expect(document.activeElement).toBe(
      facetEl(widget, "author").querySelector(".fs-button"),
    );
  });

  it("closes when clicking outside", () => {
    const widget = make();
    const popover = open(widget, "type");
    document.body.click();
    expect(popover.hidden).toBe(true);
  });
});

describe("facetStrip phone sheet", () => {
  it("has a Filters (n) button counting active facets that toggles the sheet", () => {
    const widget = make({ value: { type: ["full"], author: ["Ann", "Bo"] } });
    const button = widget.querySelector(".fs-sheet-toggle");
    expect(button.textContent).toBe("Filters (2)");
    button.click();
    expect(widget.classList.contains("fs-sheet-open")).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    widget.querySelector(".fs-sheet-done").click();
    expect(widget.classList.contains("fs-sheet-open")).toBe(false);
  });
});

describe("facetStrip row actions and the keyboard", () => {
  it("leaves Enter/Space on a row action to the action (no row toggle, no preventDefault)", () => {
    const widget = make({
      rowAction: () =>
        Object.assign(document.createElement("button"), { className: "act" }),
    });
    const popover = open(widget, "author");
    const input = popover.querySelector("input");
    key(input, "ArrowDown"); // a row is active, so a stray Enter would toggle it
    const action = popover.querySelector(".act");
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    action.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(widget.value.author ?? []).toEqual([]);
  });
});
