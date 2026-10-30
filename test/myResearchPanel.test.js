// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { myResearch } from "../src/components/myResearch.js";
import { topicWatch } from "../src/components/topicWatch.js";

describe("myResearch panel", () => {
  it("counts the pasted abstracts and ranks with the text", () => {
    const onRank = vi.fn();
    const el = myResearch({ text: "" }, { onRank, onForget: vi.fn() });
    document.body.append(el);
    el.querySelector(".my-research-open").click();
    const panel = el.querySelector(".my-research-panel");
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain("Stays on this device");
    const rank = el.querySelector(".my-research-rank");
    expect(rank.disabled).toBe(true);
    const textarea = el.querySelector("textarea");
    textarea.value = "First abstract.\n\nSecond abstract.";
    textarea.dispatchEvent(new Event("input"));
    expect(el.querySelector(".my-research-count").textContent).toBe(
      "2 abstracts",
    );
    rank.click();
    expect(onRank).toHaveBeenCalledWith("First abstract.\n\nSecond abstract.");
    expect(panel.hidden).toBe(true);
    el.remove();
  });

  it("can't rank until the model is ready; deletes saved abstracts on request", () => {
    const onForget = vi.fn();
    const el = myResearch(
      { text: "Saved.", ready: false, open: true },
      { onRank: vi.fn(), onForget },
    );
    document.body.append(el);
    expect(el.querySelector("textarea").value).toBe("Saved.");
    expect(el.querySelector(".my-research-rank").disabled).toBe(true);
    el.querySelector(".my-research-forget").click();
    expect(onForget).toHaveBeenCalled();
    expect(el.querySelector("textarea").value).toBe("");
    el.remove();
  });
});

describe("topicWatch for My research", () => {
  const preview = {
    count: 3,
    out: 7,
    joining: 3,
    already: 0,
    lastIn: [],
    firstOut: [],
  };
  it("asks for a short name and saves with it", () => {
    const onSave = vi.fn();
    const el = topicWatch(
      {
        query: "My research (2 abstracts)",
        previews: { strong: preview, good: preview },
        level: "good",
        research: { name: "My research" },
      },
      { onSave },
    );
    document.body.append(el);
    el.querySelector(".topic-watch-open").click();
    expect(el.textContent).toContain("not in share links");
    const name = el.querySelector(".topic-watch-name");
    expect(name.value).toBe("My research");
    name.value = "  Uncertainty vis ";
    el.querySelector(".topic-watch-save").click();
    expect(onSave).toHaveBeenCalledWith("good", "Uncertainty vis");
    el.remove();
  });
});
