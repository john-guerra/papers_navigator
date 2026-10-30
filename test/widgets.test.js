// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import MultiAutoSelect from "multi-auto-select/dist/MultiAutoSelect.esm.js";

describe("multi-auto-select (npm)", () => {
  const options = ["Ann", "Bo", "Cy"];
  const make = (opts) => {
    const widget = MultiAutoSelect(options, opts);
    document.body.append(widget);
    return widget;
  };
  const type = (widget, text) => {
    widget.querySelector("input").value = text;
    widget
      .querySelector("form")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
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
