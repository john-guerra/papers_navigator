// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { toggletip } from "../src/components/toggletip.js";

afterEach(() => document.body.replaceChildren());

const make = () => {
  const el = toggletip({ label: "About this", content: () => "Some help" });
  const outside = document.createElement("button");
  document.body.append(el, outside);
  const button = el.querySelector("button");
  const status = el.querySelector('[role="status"]');
  return { el, outside, button, status };
};

describe("toggletip (#176)", () => {
  it("is a labelled button that controls a polite live region, closed and empty at first", () => {
    const { button, status } = make();
    expect(button.type).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("About this");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe(status.id);
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("");
  });

  it("opens on click, filling the live region so it's announced; a second click closes", () => {
    const { button, status } = make();
    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(status.textContent).toContain("Some help");
    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(status.textContent).toBe("");
  });

  it("closes on Escape and marks the event handled, so nothing else closes too", () => {
    const { button, status } = make();
    button.click();
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(status.textContent).toBe("");
    // Closed: Escape is left to the page
    const later = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });

  it("closes on a pointer press outside, not inside", () => {
    const { el, outside, button } = make();
    button.click();
    el.querySelector(".toggletip-bubble").dispatchEvent(
      new Event("pointerdown", { bubbles: true }),
    );
    expect(button.getAttribute("aria-expanded")).toBe("true");
    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes when keyboard focus moves elsewhere", () => {
    const { outside, button } = make();
    button.click();
    outside.focus();
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("stops listening once removed from the page while open (a re-render)", () => {
    const { el, button } = make();
    button.click();
    el.remove();
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
