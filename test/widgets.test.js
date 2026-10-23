// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { scentedCheckbox } from "../src/widgets/scentedCheckbox.js";
import MultiAutoSelect from "multi-auto-select/dist/MultiAutoSelect.esm.js";

const counts = [
  { value: "full", count: 10 },
  { value: "short", count: 4 },
];

describe("scentedCheckbox", () => {
  it("starts with the given value", () => {
    expect(scentedCheckbox(counts, { label: "Type", value: ["short"] }).value).toEqual(["short"]);
  });

  it("emits input when a box is clicked", () => {
    const widget = scentedCheckbox(counts, { label: "Type", value: [] });
    document.body.append(widget); // Inputs only emits once connected
    let fired = 0;
    widget.addEventListener("input", () => fired++);
    widget.querySelector("input[type=checkbox]").click();
    expect(fired).toBe(1);
    expect(widget.value).toEqual(["full"]);
  });

  it("formats option labels", () => {
    const widget = scentedCheckbox(counts, { format: (v) => v.toUpperCase() });
    expect(widget.textContent).toContain("FULL");
  });

  it("reflects a value set from outside", () => {
    const widget = scentedCheckbox(counts, { label: "Type", value: [] });
    widget.value = ["short"];
    widget.dispatchEvent(new Event("input", { bubbles: true }));
    const checked = [...widget.querySelectorAll("input:checked")].map((d) => d.value);
    expect(checked).toHaveLength(1);
  });
});

describe("multi-auto-select (npm)", () => {
  const options = ["Ann", "Bo", "Cy"];
  const make = (opts) => {
    const widget = MultiAutoSelect(options, opts);
    document.body.append(widget);
    return widget;
  };
  const type = (widget, text) => {
    widget.querySelector("input").value = text;
    widget.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  };

  it("starts with the given value", () => {
    expect(make({ label: "Authors", value: ["Bo"] }).value).toEqual(["Bo"]);
  });

  it("adds a typed option on submit and emits input", () => {
    const widget = make({ label: "Authors" });
    let fired = 0;
    widget.addEventListener("input", () => fired++);
    type(widget, "Cy");
    expect(widget.value).toEqual(["Cy"]);
    expect(fired).toBeGreaterThan(0);
  });

  it("ignores text that is not an option", () => {
    const widget = make({ label: "Authors" });
    type(widget, "Zed");
    expect(widget.value).toEqual([]);
  });
});
