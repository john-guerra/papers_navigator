// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { topicWatch } from "../src/components/topicWatch.js";

const preview = (count, extra = {}) => ({
  count,
  out: 100 - count,
  joining: count - 1,
  already: 1,
  lastIn: [{ id: "a", title: "Last in" }],
  firstOut: [{ id: "b", title: "First out" }],
  ...extra,
});

describe("topicWatch", () => {
  it("previews each level and saves the chosen one", () => {
    const onSave = vi.fn();
    const el = topicWatch(
      {
        query: "llm",
        previews: { strong: preview(5), good: preview(20) },
        level: "all",
      },
      { onSave },
    );
    document.body.append(el);
    const open = el.querySelector(".topic-watch-open");
    expect(el.querySelector(".topic-watch-panel").hidden).toBe(true);
    open.click();
    expect(open.getAttribute("aria-expanded")).toBe("true");
    expect(el.querySelector(".topic-watch-summary").textContent).toContain(
      "20 papers in the program at Good",
    );
    expect(el.textContent).toContain("Just in:");
    expect(el.textContent).toContain("First out");
    el.querySelector('[data-level="strong"]').click();
    expect(el.querySelector(".topic-watch-summary").textContent).toContain(
      "5 papers",
    );
    el.querySelector(".topic-watch-save").click();
    expect(onSave).toHaveBeenCalledWith("strong");
    expect(el.querySelector(".topic-watch-panel").hidden).toBe(true);
    el.remove();
  });

  it("for a watched topic, shows its level and what changing it would add and drop", () => {
    const el = topicWatch(
      {
        query: "llm",
        previews: {
          strong: preview(5, { added: 0, dropped: 15 }),
          good: preview(20, { added: 0, dropped: 0 }),
        },
        current: { level: "good" },
      },
      { onSave: vi.fn() },
    );
    expect(el.querySelector(".topic-watch-open").textContent).toContain(
      "Watching",
    );
    const save = el.querySelector(".topic-watch-save");
    expect(save.disabled).toBe(true);
    el.querySelector('[data-level="strong"]').click();
    expect(save.disabled).toBe(false);
    expect(el.querySelector(".topic-watch-summary").textContent).toContain(
      "+0, −15",
    );
  });
});
