// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { segmentedControl } from "../src/widgets/segmentedControl.js";

const pressed = (el) =>
  [...el.querySelectorAll("button")]
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.textContent.trim());

describe("segmentedControl (DESIGN.md → segmented control, reactive widget)", () => {
  it("renders one pressed button per option, in a labelled group", () => {
    const el = segmentedControl(["Now / Next", "Itinerary"], {
      value: "Itinerary",
      label: "View",
    });
    expect(el.getAttribute("role")).toBe("group");
    expect(el.getAttribute("aria-label")).toBe("View");
    expect(el.classList.contains("segmented-control")).toBe(true);
    expect([...el.querySelectorAll("button")].map((b) => b.type)).toEqual([
      "button",
      "button",
    ]);
    expect(el.value).toBe("Itinerary");
    expect(pressed(el)).toEqual(["Itinerary"]);
  });

  it("takes [value, label] pairs and defaults to the first option", () => {
    const el = segmentedControl([
      ["now", "Now / Next"],
      ["itinerary", "Itinerary"],
    ]);
    expect(el.value).toBe("now");
    expect(pressed(el)).toEqual(["Now / Next"]);
  });

  it("emits input with the new value when the user picks an option", () => {
    const el = segmentedControl(["A", "B", "C"], { value: "A" });
    document.body.append(el);
    const seen = [];
    el.addEventListener("input", () => seen.push(el.value));
    el.querySelectorAll("button")[2].click();
    expect(seen).toEqual(["C"]);
    expect(pressed(el)).toEqual(["C"]);
    // picking the current option again doesn't emit
    el.querySelectorAll("button")[2].click();
    expect(seen).toEqual(["C"]);
    el.remove();
  });

  it("updates itself when .value is set and input is dispatched", () => {
    const el = segmentedControl(["A", "B"], { value: "A" });
    el.value = "B";
    el.dispatchEvent(new Event("input"));
    expect(pressed(el)).toEqual(["B"]);
  });
});
