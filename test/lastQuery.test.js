// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  lastQueryKey,
  readLastQuery,
  rememberQuery,
} from "../src/lib/lastQuery.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    data,
  };
}

describe("the last search, remembered on this device (#174)", () => {
  it("is kept per conference", () => {
    expect(lastQueryKey("ieeevis2026")).toBe(
      "papersNavigator:ieeevis2026:lastQuery",
    );
  });

  it("reads nothing (null) on a first visit, and an empty search as one", () => {
    expect(readLastQuery("c", memoryStorage())).toBeNull();
    expect(readLastQuery("c", null)).toBeNull();
    const storage = memoryStorage({ [lastQueryKey("c")]: '""' });
    expect(readLastQuery("c", storage)).toBe("");
    storage.setItem(lastQueryKey("c"), '"graphs"');
    expect(readLastQuery("c", storage)).toBe("graphs");
  });

  it("ignores what it can't read", () => {
    for (const bad of ["not json", "42", "null", '{"q":1}'])
      expect(
        readLastQuery("c", memoryStorage({ [lastQueryKey("c")]: bad })),
      ).toBeNull();
    const throwing = {
      getItem() {
        throw new Error("SecurityError");
      },
    };
    expect(readLastQuery("c", throwing)).toBeNull();
  });

  it("caps a stored search like a link's", () => {
    const long = "a".repeat(2000);
    const storage = memoryStorage({
      [lastQueryKey("c")]: JSON.stringify(long),
    });
    expect(readLastQuery("c", storage).length).toBeLessThan(2000);
  });

  it("saves what the person types, chooses or clears, not the start value", () => {
    const storage = memoryStorage();
    const input = document.createElement("form");
    input.value = "Data literacy";
    const stop = rememberQuery(input, "c", { storage });
    expect(storage.data.size).toBe(0);
    input.value = "graphs";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(readLastQuery("c", storage)).toBe("graphs");
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(readLastQuery("c", storage)).toBe("");
    stop();
    input.value = "after";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(readLastQuery("c", storage)).toBe("");
  });

  it("skips a clear the page makes itself (My research takes over, #174 review)", () => {
    const storage = memoryStorage({ [lastQueryKey("c")]: '"graphs"' });
    const input = document.createElement("form");
    rememberQuery(input, "c", { storage });
    input.value = "";
    input.dispatchEvent(
      new CustomEvent("input", { bubbles: true, detail: { remember: false } }),
    );
    expect(readLastQuery("c", storage)).toBe("graphs");
  });

  it("keeps going when storage refuses (private mode)", () => {
    const input = document.createElement("form");
    const storage = {
      getItem: () => null,
      setItem() {
        throw new Error("QuotaExceededError");
      },
    };
    rememberQuery(input, "c", { storage });
    input.value = "x";
    expect(() => input.dispatchEvent(new Event("input"))).not.toThrow();
  });
});
