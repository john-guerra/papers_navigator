// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  QUERY_MARKER_KEY,
  createQueryMarkerSettings,
} from "../src/lib/placeQuery.js";
import { queryMarkerControl } from "../src/components/queryMarkerControl.js";

const memoryStorage = (items = {}) => ({
  items,
  getItem: (k) => items[k] ?? null,
  setItem: (k, v) => (items[k] = v),
});

describe("createQueryMarkerSettings", () => {
  it("shows the marker by default and remembers hiding it", () => {
    const storage = memoryStorage();
    const store = createQueryMarkerSettings({ storage });
    expect(store.value).toBe(true);
    let events = 0;
    store.addEventListener("input", () => events++);
    store.set(false);
    expect(events).toBe(1);
    expect(storage.items[QUERY_MARKER_KEY]).toBe("false");
    expect(createQueryMarkerSettings({ storage }).value).toBe(false);
  });

  it("ignores an invalid stored value", () => {
    const storage = memoryStorage({ [QUERY_MARKER_KEY]: '"no"' });
    expect(createQueryMarkerSettings({ storage }).value).toBe(true);
  });
});

describe("queryMarkerControl", () => {
  it("is a checkbox bound to the store, both ways", () => {
    const store = createQueryMarkerSettings({ storage: memoryStorage() });
    const el = queryMarkerControl(store);
    document.body.append(el);
    const input = el.querySelector("input[type=checkbox]");
    expect(input.checked).toBe(true);
    expect(el.textContent).toContain("Your search");
    input.checked = false;
    input.dispatchEvent(new Event("change"));
    expect(store.value).toBe(false);
    store.set(true);
    expect(input.checked).toBe(true);
    el.dispose();
    store.set(false);
    expect(input.checked).toBe(true);
    el.remove();
  });
});
