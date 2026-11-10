// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { bindRatingMarkers } from "../src/components/ratingMarkers.js";

const fakeRatings = (initial = {}) => {
  const store = new EventTarget();
  let value = { ...initial };
  store.get = (id) => value[id] ?? 0;
  store.set = (id, n) => {
    value = { ...value, [id]: n };
    if (!n) delete value[id];
    store.dispatchEvent(new Event("input"));
  };
  return store;
};
const listRow = (id) => {
  const row = document.createElement("div");
  row.className = "paper";
  row.dataset.paperId = id;
  row.innerHTML = `<div class="paper-title paper-head"><span class="type-pill">Full</span><a class="title">Paper ${id}</a> <button>Add</button></div><div class="paper-where">Session</div>`;
  return row;
};
const tick = () => new Promise((r) => setTimeout(r));

describe("bindRatingMarkers (#203 Stage B)", () => {
  it("marks rated rows with ★n after the title", () => {
    const root = document.createElement("div");
    root.append(listRow("a"), listRow("b"));
    document.body.append(root);
    const stop = bindRatingMarkers(root, fakeRatings({ a: 4 }));
    const marker = root.querySelector('[data-paper-id="a"] .rating-marker');
    expect(marker.textContent).toBe("★4");
    expect(marker.title).toBe("Your rating: 4 of 5");
    expect(marker.previousElementSibling.classList).toContain("title");
    expect(root.querySelector('[data-paper-id="b"] .rating-marker')).toBeNull();
    stop();
    root.remove();
  });

  it("marks rows rendered later", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const stop = bindRatingMarkers(root, fakeRatings({ c: 2 }));
    root.append(listRow("c"));
    await tick();
    expect(root.querySelector(".rating-marker").textContent).toBe("★2");
    stop();
    root.remove();
  });

  it("follows the store: updates and removes", () => {
    const root = document.createElement("div");
    root.append(listRow("a"));
    const ratings = fakeRatings({ a: 4 });
    const stop = bindRatingMarkers(root, ratings);
    ratings.set("a", 2);
    expect(root.querySelector(".rating-marker").textContent).toBe("★2");
    ratings.set("a", 0);
    expect(root.querySelector(".rating-marker")).toBeNull();
    stop();
    ratings.set("a", 5);
    expect(root.querySelector(".rating-marker")).toBeNull();
  });

  it("marks itinerary items after their title link", () => {
    const root = document.createElement("ul");
    root.innerHTML = `<li class="itinerary-item" data-paper-id="i"><span class="time">10:00</span><a class="paper-details-open">Paper i</a> <button class="unfollow">✕</button></li>`;
    bindRatingMarkers(root, fakeRatings({ i: 5 }));
    const marker = root.querySelector(".rating-marker");
    expect(marker.textContent).toBe("★5");
    expect(marker.previousElementSibling.classList).toContain(
      "paper-details-open",
    );
  });
});

describe("markers for Not for me and attended (#208)", () => {
  const keyed = (initial) => {
    const s = new EventTarget();
    let v = { ...initial };
    s.has = (id) => v[id] === true;
    s.isAttended = (id) => Boolean(v[id]);
    s.replace = (next) => {
      v = next;
      s.dispatchEvent(new Event("input"));
    };
    return s;
  };
  it("shows 👎 instead of stars, and ✓ for attended papers; follows the stores", () => {
    const root = document.createElement("div");
    root.append(listRow("a"), listRow("b"));
    const disliked = keyed({ a: true });
    const attended = keyed({ b: true });
    bindRatingMarkers(root, fakeRatings({}), { disliked, attended });
    expect(
      root.querySelector('[data-paper-id="a"] .rating-marker').textContent,
    ).toBe("👎");
    expect(root.querySelector('[data-paper-id="a"] .rating-marker').title).toBe(
      "Not for me",
    );
    const tick = root.querySelector('[data-paper-id="b"] .attended-marker');
    expect(tick.textContent).toBe("✓");
    expect(tick.title).toBe("You attended");
    attended.replace({});
    expect(root.querySelector(".attended-marker")).toBeNull();
    disliked.replace({});
    expect(root.querySelector(".rating-marker")).toBeNull();
  });
});
