// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { addOnRate, verdict } from "../src/components/verdict.js";

const keyed = (initial = {}) => {
  const s = new EventTarget();
  let v = { ...initial };
  s.get = (id) => v[id] ?? 0;
  s.has = (id) => Boolean(v[id]);
  s.set = vi.fn((id, x) => {
    v = { ...v, [id]: x };
    if (!x) delete v[id];
    s.dispatchEvent(new Event("input"));
  });
  s.replace = (next) => {
    v = next;
    s.dispatchEvent(new Event("input"));
  };
  return s;
};
const paper = { id: "p", title: "Paper P" };
const stars = (el) => [...el.querySelectorAll(".star")];
const pressed = (el) =>
  stars(el).filter((b) => b.getAttribute("aria-pressed") === "true").length;

describe("verdict: stars or Not for me (#208)", () => {
  it("a star clears Not for me; Not for me clears the stars", () => {
    const ratings = keyed({ p: 3 });
    const disliked = keyed();
    const onRated = vi.fn();
    const el = verdict(paper, { ratings, disliked, onRated });
    const nope = el.querySelector(".not-for-me");
    expect(nope.getAttribute("aria-label")).toBe("Not for me");
    expect(nope.getAttribute("aria-pressed")).toBe("false");
    nope.click();
    expect(disliked.set).toHaveBeenLastCalledWith("p", true);
    expect(ratings.set).toHaveBeenLastCalledWith("p", 0);
    expect(nope.getAttribute("aria-pressed")).toBe("true");
    expect(pressed(el)).toBe(0);
    stars(el)[4].click();
    expect(ratings.set).toHaveBeenLastCalledWith("p", 5);
    expect(disliked.set).toHaveBeenLastCalledWith("p", false);
    expect(nope.getAttribute("aria-pressed")).toBe("false");
    expect(onRated).toHaveBeenCalledWith(paper, 5);
    // a second tap on 👎 clears it
    nope.click();
    nope.click();
    expect(disliked.set).toHaveBeenLastCalledWith("p", false);
  });

  it("follows both stores (another page, another tab); dispose stops it", () => {
    const ratings = keyed();
    const disliked = keyed();
    const el = verdict(paper, { ratings, disliked });
    disliked.replace({ p: true });
    expect(el.querySelector(".not-for-me").getAttribute("aria-pressed")).toBe(
      "true",
    );
    ratings.replace({ p: 2 });
    expect(pressed(el)).toBe(2);
    el.dispose();
    ratings.replace({ p: 4 });
    expect(pressed(el)).toBe(2);
  });

  it("onRated isn't called for Not for me or clearing", () => {
    const ratings = keyed({ p: 4 });
    const onRated = vi.fn();
    const el = verdict(paper, { ratings, disliked: keyed(), onRated });
    stars(el)[3].click(); // tap the current star: clears
    el.querySelector(".not-for-me").click();
    expect(onRated).not.toHaveBeenCalled();
  });
});

describe("addOnRate: rated with stars → My Papers (#208)", () => {
  it("adds a paper not in My Papers with reason ★ Rated and an Undo toast; never twice", () => {
    const ids = new Set(["already"]);
    const store = { value: [...ids].map((id) => ({ id })) };
    const addWithUndo = vi.fn((s, list) => {
      list.forEach((p) => ids.add(p.id));
      store.value = [...ids].map((id) => ({ id }));
      return () => {};
    });
    const toast = vi.fn();
    const onRated = addOnRate({ store, addWithUndo, toast });
    onRated({ id: "new" }, 4);
    expect(addWithUndo).toHaveBeenCalledWith(store, [{ id: "new" }], "★ Rated");
    expect(toast).toHaveBeenCalledWith(
      "Rated and added to My Papers",
      expect.objectContaining({ actionLabel: "Undo" }),
    );
    onRated({ id: "new" }, 5);
    onRated({ id: "already" }, 3);
    expect(addWithUndo).toHaveBeenCalledTimes(1);
  });
});
