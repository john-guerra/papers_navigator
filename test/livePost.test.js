// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { postToggle } from "../src/components/livePost.js";

describe("postToggle (#203 Stage C review)", () => {
  const panel = () => {
    const el = document.createElement("section");
    el.className = "post-panel";
    el.dispose = vi.fn();
    return el;
  };

  it("can start open (a panel kept across a list redraw) and reports closing", () => {
    const kept = panel();
    const onClose = vi.fn();
    const { button, slot } = postToggle({ id: "p" }, () => kept, {
      open: true,
      onClose,
    });
    expect(slot.firstChild).toBe(kept);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    button.click();
    expect(slot.firstChild).toBeNull();
    expect(onClose).toHaveBeenCalledWith({ id: "p" });
  });
});
