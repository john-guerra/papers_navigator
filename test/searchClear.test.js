// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { addSearchClear } from "../src/components/searchClear.js";

const field = (value = "") => {
  const form = document.createElement("form");
  form.innerHTML = `<input type="text" value="${value}">`;
  document.body.append(form);
  return form;
};

describe("addSearchClear", () => {
  it("shows ✕ only while the field has text, and clears it", () => {
    const form = field("llm agents");
    const onClear = vi.fn();
    const button = addSearchClear(form, onClear);
    expect(button.getAttribute("aria-label")).toBe("Clear search");
    expect(button.hidden).toBe(false);
    button.click();
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(form.querySelector("input"));
    const input = form.querySelector("input");
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(button.hidden).toBe(true);
    input.value = "x";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(button.hidden).toBe(false);
    form.remove();
  });

  it("follows programmatic changes through sync()", () => {
    const form = field("");
    const button = addSearchClear(form, () => {});
    expect(button.hidden).toBe(true);
    form.querySelector("input").value = "set by a link";
    button.sync();
    expect(button.hidden).toBe(false);
    form.remove();
  });
});
