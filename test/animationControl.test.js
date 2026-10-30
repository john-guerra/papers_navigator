// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { animationControl } from "../src/components/animationControl.js";
import { createAnimationSettings } from "../src/lib/animationSettings.js";

const memoryStorage = () => {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => (data[k] = String(v)),
  };
};

const setup = (opts) => {
  const store = createAnimationSettings({
    storage: memoryStorage(),
    reducedMotion: false,
  });
  const el = animationControl(store, opts);
  document.body.append(el);
  return { store, el };
};
const pressed = (el) =>
  [...el.querySelectorAll("button[aria-pressed=true]")].map(
    (b) => b.textContent,
  );

describe("animationControl", () => {
  it("shows the settings with the store's values", () => {
    const { el } = setup();
    expect(el.textContent).toContain("Animate the map");
    expect(el.textContent).toContain("Align projections");
    expect(el.textContent).toContain("Animate filter changes");
    expect(pressed(el)).toEqual(["By topic", "Normal"]);
    expect(el.querySelector("[data-setting=enabled]").checked).toBe(true);
    el.remove();
  });

  it("updates the store, and disables the dependent options when animation is off", () => {
    const { store, el } = setup();
    el.querySelector("button[data-value=fast]").click();
    expect(store.value.speed).toBe("fast");
    expect(pressed(el)).toContain("Fast");
    const enabled = el.querySelector("[data-setting=enabled]");
    enabled.checked = false;
    enabled.dispatchEvent(new Event("change"));
    expect(store.value.enabled).toBe(false);
    expect(el.querySelector("[data-setting=filters]").disabled).toBe(true);
    expect(el.querySelector("button[data-value=topic]").disabled).toBe(true);
    // Alignment also applies without animation
    expect(el.querySelector("[data-setting=align]").disabled).toBe(false);
    el.remove();
  });

  it("hides Motion without topics to stage by", () => {
    const { el } = setup({ hasTopics: false });
    expect(el.textContent).not.toContain("By topic");
    el.remove();
  });

  it("dispose stops following the store (no listener left per re-render)", () => {
    const { store, el } = setup();
    el.dispose();
    store.set({ speed: "fast" });
    expect(pressed(el)).toEqual(["By topic", "Normal"]);
    el.remove();
  });
});
