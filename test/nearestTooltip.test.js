// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  attachNearestTooltip,
  tooltipValue,
} from "../src/widgets/nearestTooltip.js";

const entries = [
  "id",
  { field: "title", title: "Title" },
  { field: "score", title: "Similarity", format: ".0%" },
];

describe("tooltipValue", () => {
  it("labels and formats fields like Vega-Lite tooltip entries, skipping empty ones", () => {
    expect(
      tooltipValue({ id: "a", title: "T", score: 0.187 }, entries),
    ).toEqual({ id: "a", Title: "T", Similarity: "19%" });
    expect(tooltipValue({ id: "a", title: "T", score: null }, entries)).toEqual(
      { id: "a", Title: "T" },
    );
  });
});

describe("attachNearestTooltip", () => {
  const setup = (near) => {
    const el = document.createElement("div");
    const handler = vi.fn();
    const view = { tooltip: () => handler };
    attachNearestTooltip(el, { view, pointAt: () => near, entries });
    return { el, handler, view };
  };
  const move = (el, init = {}) =>
    el.dispatchEvent(
      Object.assign(new Event("pointermove"), {
        clientX: 1,
        clientY: 2,
        buttons: 0,
        pointerType: "mouse",
        ...init,
      }),
    );
  it("shows the nearest point's tooltip, and hides it when nothing is near or the pointer leaves", () => {
    const d = { id: "a", title: "T", score: 0.5 };
    const { el, handler, view } = setup(d);
    move(el);
    expect(handler).toHaveBeenLastCalledWith(
      handler,
      expect.any(Event),
      { datum: d },
      { id: "a", Title: "T", Similarity: "50%" },
    );
    el.dispatchEvent(new Event("pointerleave"));
    expect(handler.mock.lastCall[3]).toBeNull();
    expect(handler.mock.contexts.at(-1)).toBe(view);
  });
  it("stays quiet while dragging a brush and for touch", () => {
    const { el, handler } = setup({ id: "a" });
    move(el, { buttons: 1 });
    move(el, { pointerType: "touch" });
    expect(handler.mock.calls.every((c) => c[3] === null)).toBe(true);
  });
});
