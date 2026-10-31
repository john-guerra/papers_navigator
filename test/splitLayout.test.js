// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { watchSplitMap } from "../src/lib/splitLayout.js";

/** A layout with the controls before the map section; jsdom has no layout, so boxes are given. */
function fakeLayout() {
  const layout = document.createElement("div");
  layout.innerHTML =
    '<section class="explore-controls"></section><section id="explore-map"><div class="map-stage"><div class="map-controls"></div></div></section>';
  const [controls, section] = layout.children;
  let controlsBottom = 500;
  controls.getBoundingClientRect = () => ({ bottom: controlsBottom });
  section.getBoundingClientRect = () => ({ height: 420 });
  section.querySelector(".map-controls").getBoundingClientRect = () => ({
    height: 52,
  });
  document.body.append(layout);
  return { layout, section, scrollTo: (y) => (controlsBottom = 500 - y) };
}

describe("watchSplitMap (#144)", () => {
  it("publishes the controls row's height and what stays visible of the stuck map", () => {
    const { layout, section } = fakeLayout();
    const root = document.createElement("div");
    const stop = watchSplitMap(section, { layout, root, ResizeObserver: null });
    expect(root.style.getPropertyValue("--map-controls-height")).toBe("52px");
    expect(root.style.getPropertyValue("--split-map-height")).toBe("368px");
    stop();
    expect(root.style.getPropertyValue("--split-map-height")).toBe("");
    layout.remove();
  });

  it("marks the map stuck once its place in the flow reaches the nav, and unsticks it back (#145 review)", () => {
    const { layout, section, scrollTo } = fakeLayout();
    const stop = watchSplitMap(section, {
      layout,
      nav: () => 56,
      root: document.createElement("div"),
      frame: (cb) => cb(),
      ResizeObserver: null,
    });
    expect(layout.classList.contains("map-stuck")).toBe(false);
    scrollTo(444); // the controls end at 56: the map's place is at the nav
    window.dispatchEvent(new Event("scroll"));
    expect(layout.classList.contains("map-stuck")).toBe(true);
    scrollTo(400);
    window.dispatchEvent(new Event("scroll"));
    expect(layout.classList.contains("map-stuck")).toBe(false);
    stop();
    layout.remove();
  });
});
