// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  myResearch,
  pauseResearchForLink,
  researchPausedToast,
} from "../src/components/myResearch.js";
import { topicWatch } from "../src/components/topicWatch.js";

/** A research store stand-in: `.value` and `set(partial)` like createResearchStore. */
const fakeStore = (value) => ({
  value,
  set(partial) {
    this.value = { ...this.value, ...partial };
  },
});

describe("a link with a search pauses My research (#104)", () => {
  it("pauses only when the link names a search and research was on", () => {
    const store = fakeStore({ text: "abs", active: true });
    expect(pauseResearchForLink(store, { explicitQuery: false })).toBe(false);
    expect(store.value.active).toBe(true);
    expect(pauseResearchForLink(store, { explicitQuery: true })).toBe(true);
    expect(store.value).toEqual({ text: "abs", active: false });
    expect(pauseResearchForLink(store, { explicitQuery: true })).toBe(false);
  });

  it("says so in a toast whose Resume ranks by the saved abstracts again", () => {
    const store = fakeStore({ text: "abs", active: false });
    const toast = vi.fn();
    const onResume = vi.fn();
    researchPausedToast(store, { toast, onResume });
    expect(toast).toHaveBeenCalledWith(
      "My research paused",
      expect.objectContaining({ actionLabel: "Resume" }),
    );
    toast.mock.calls[0][1].onAction();
    expect(onResume).toHaveBeenCalledOnce();
    expect(store.value).toEqual({ text: "abs", active: true });
  });
});

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
    expect(onForget).toHaveBeenCalledWith({ topics: [] });
    expect(el.querySelector("textarea").value).toBe("");
    el.remove();
  });

  it("with research topics saved from the abstracts, asks inline whether to delete them too", () => {
    const onForget = vi.fn();
    const el = myResearch(
      {
        text: "Saved.",
        open: true,
        savedTopics: () => [{ id: "research:mine", name: "Mine" }],
      },
      { onRank: vi.fn(), onForget },
    );
    document.body.append(el);
    el.querySelector(".my-research-forget").click();
    expect(onForget).not.toHaveBeenCalled();
    const confirm = el.querySelector(".my-research-confirm");
    expect(confirm.textContent.replace(/\s+/g, " ")).toContain(
      "“Mine” keeps its own copy",
    );
    confirm.querySelector(".my-research-forget-cancel").click();
    expect(el.querySelector(".my-research-confirm")).toBeNull();
    expect(el.querySelector("textarea").value).toBe("Saved.");

    el.querySelector(".my-research-forget").click();
    el.querySelector(".my-research-forget-only").click();
    expect(onForget).toHaveBeenLastCalledWith({ topics: [] });

    el.querySelector(".my-research-forget").click();
    el.querySelector(".my-research-forget-all").click();
    expect(onForget).toHaveBeenLastCalledWith({ topics: ["research:mine"] });
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
    const open = el.querySelector(".topic-watch-open");
    expect(open.textContent).toBe("🔍 Watch topic");
    expect(open.title).toBe("Watch as a research topic");
    open.click();
    expect(el.textContent).toContain("not in share links");
    const name = el.querySelector(".topic-watch-name");
    expect(name.value).toBe("My research");
    name.value = "  Uncertainty vis ";
    el.querySelector(".topic-watch-save").click();
    expect(onSave).toHaveBeenCalledWith("good", "Uncertainty vis");
    el.remove();
  });
});
