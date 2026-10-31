// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { watchSplitMap } from "../src/lib/splitLayout.js";

describe("watchSplitMap (#144)", () => {
  it("publishes the controls row's height and what stays visible of the stuck map", () => {
    const section = document.createElement("section");
    section.innerHTML =
      '<div class="map-stage"><div class="map-controls"></div></div>';
    section.getBoundingClientRect = () => ({ height: 420 });
    section.querySelector(".map-controls").getBoundingClientRect = () => ({
      height: 52,
    });
    const root = document.createElement("div");
    const stop = watchSplitMap(section, { root, ResizeObserver: null });
    expect(root.style.getPropertyValue("--map-controls-height")).toBe("52px");
    expect(root.style.getPropertyValue("--split-map-height")).toBe("368px");
    stop();
    expect(root.style.getPropertyValue("--split-map-height")).toBe("");
  });
});
