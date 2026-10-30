// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { THEME_KEY, applyTheme, getTheme, setTheme } from "../src/lib/theme.js";
import { themeControl } from "../src/components/themeControl.js";

const memory = () => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
};

describe("theme", () => {
  it("defaults to auto (follow the OS) and persists a choice", () => {
    const storage = memory();
    expect(getTheme(storage)).toBe("auto");
    setTheme("dark", storage);
    expect(storage.getItem(THEME_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    setTheme("auto", storage);
    expect(storage.getItem(THEME_KEY)).toBeNull();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
  it("ignores bad stored values", () => {
    const storage = memory();
    storage.setItem(THEME_KEY, "purple");
    expect(getTheme(storage)).toBe("auto");
    applyTheme("purple");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
  it("announces changes so charts can redraw with the new colors", () => {
    let seen;
    addEventListener("themechange", (e) => (seen = e.detail), { once: true });
    setTheme("light", memory());
    expect(seen).toBe("light");
  });
});

describe("themeControl", () => {
  it("offers Auto / Light / Dark and applies the choice", () => {
    const storage = memory();
    const el = themeControl({ storage });
    document.body.append(el);
    const labels = [...el.querySelectorAll("button")].map((b) =>
      b.textContent.trim(),
    );
    expect(labels).toEqual(["Auto", "Light", "Dark"]);
    expect(el.querySelector('[aria-pressed="true"]').textContent.trim()).toBe(
      "Auto",
    );
    [...el.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Dark")
      .click();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(el.querySelector('[aria-pressed="true"]').textContent.trim()).toBe(
      "Dark",
    );
    el.remove();
  });
});
