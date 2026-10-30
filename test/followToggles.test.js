// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { followToggles } from "../src/components/followToggles.js";
import { PapersList } from "../src/widgets/papersList.js";

describe("followToggles", () => {
  it("renders a pressed/unpressed My Papers toggle per paper", () => {
    const mine = new Set(["a"]);
    const toggles = followToggles({
      inMyPapers: (id) => mine.has(id),
      onToggle: () => {},
    });
    const a = toggles.toggle({ id: "a" });
    const b = toggles.toggle({ id: "b" });
    expect(a.getAttribute("aria-pressed")).toBe("true");
    expect(a.textContent).toContain("In My Papers");
    expect(a.title).toBe("In My Papers — remove");
    expect(b.getAttribute("aria-pressed")).toBe("false");
    expect(b.textContent).toContain("Add to My Papers");
    expect(b.title).toBe("Add to My Papers");
  });

  it("calls onToggle with the paper", () => {
    const clicked = [];
    const toggles = followToggles({
      inMyPapers: () => false,
      onToggle: (p) => clicked.push(p.id),
    });
    toggles.toggle({ id: "b" }).click();
    expect(clicked).toEqual(["b"]);
  });

  it("keeps a PapersList's rows and 'Show more' expansion when My Papers changes (#21)", () => {
    const papers = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      title: `Paper ${i}`,
    }));
    const mine = new Set();
    const toggles = followToggles({
      inMyPapers: (id) => mine.has(id),
      onToggle: (p) => mine.add(p.id),
    });
    const list = PapersList(papers, {
      max: 2,
      actions: (p) => toggles.toggle(p),
    });
    list.querySelector(".papers-more button").click(); // 4 rows shown
    const rows = [...list.querySelectorAll(".paper")];
    expect(rows).toHaveLength(4);
    rows[3].querySelector(".follow-toggle").click();
    toggles.update();
    expect([...list.querySelectorAll(".paper")]).toEqual(rows);
    expect(
      rows.map((r) =>
        r.querySelector(".follow-toggle").getAttribute("aria-pressed"),
      ),
    ).toEqual(["false", "false", "false", "true"]);
    // rows revealed later get the current state too
    list.querySelector(".papers-more button").click();
    mine.add("p4");
    toggles.update();
    expect(
      list
        .querySelector('[data-paper-id="p4"] .follow-toggle')
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("update() refreshes every toggle in place (same nodes)", () => {
    const mine = new Set();
    const toggles = followToggles({
      inMyPapers: (id) => mine.has(id),
      onToggle: () => {},
    });
    const a = toggles.toggle({ id: "a" });
    const b = toggles.toggle({ id: "b" });
    mine.add("b");
    toggles.update();
    expect(a.getAttribute("aria-pressed")).toBe("false");
    expect(b.getAttribute("aria-pressed")).toBe("true");
    expect(b.textContent).toContain("In My Papers");
    expect(b.querySelector(".ring")).not.toBeNull();
  });
});
