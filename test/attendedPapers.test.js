// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  attendedToggle,
  renderAttendedPapers,
} from "../src/components/attendedPapers.js";

const attendedStore = (initial = {}) => {
  const s = new EventTarget();
  let v = { ...initial };
  s.isAttended = (id) => Boolean(v[id] && !v[id].off);
  s.set = vi.fn((id, on) => {
    v = { ...v, [id]: on ? { at: "x", how: "manual" } : { off: true } };
    s.dispatchEvent(new Event("input"));
  });
  s.replace = (next) => {
    v = next;
    s.dispatchEvent(new Event("input"));
  };
  return s;
};

describe("attendedToggle (#208)", () => {
  it("in details it reads I was there / ✓ I was there", () => {
    const attended = attendedStore();
    const b = attendedToggle({ id: "p" }, attended, [
      "I was there",
      "✓ I was there",
    ]);
    expect(b.textContent.trim()).toBe("I was there");
    b.click();
    expect(b.textContent.trim()).toBe("✓ I was there");
  });

  it("toggles attended and follows the store", () => {
    const attended = attendedStore();
    const b = attendedToggle({ id: "p" }, attended);
    // the two states read differently, not just by weight
    expect(b.textContent.trim()).toBe("Mark attended");
    expect(b.getAttribute("aria-pressed")).toBe("false");
    b.click();
    expect(attended.set).toHaveBeenLastCalledWith("p", true);
    expect(b.getAttribute("aria-pressed")).toBe("true");
    expect(b.textContent.trim()).toBe("✓ Attended");
    b.click();
    expect(attended.set).toHaveBeenLastCalledWith("p", false);
    attended.replace({ p: { at: "x", how: "auto" } });
    expect(b.getAttribute("aria-pressed")).toBe("true");
    b.dispose();
  });
});

describe("renderAttendedPapers (#208)", () => {
  const p = (id, day, start) => ({
    id,
    shortId: `s-${id}`,
    title: `Paper ${id}`,
    day,
    start,
    typeShort: "Full",
    typeColor: "full",
  });
  const papers = [
    p("a", "2026-11-11", "2026-11-11T16:00:00Z"),
    p("b", "2026-11-10", "2026-11-10T15:00:00Z"),
    p("c", "2026-11-11", "2026-11-11T15:00:00Z"),
    p("d", "2026-11-11", "2026-11-11T14:00:00Z"),
  ];
  const render = (options = {}) =>
    renderAttendedPapers(papers, {
      attended: {
        a: { how: "auto", at: "x" },
        b: { how: "manual", at: "x" },
        c: { how: "auto", at: "x" },
        d: { off: true },
      },
      ratings: { a: 4 },
      disliked: { c: true },
      notes: { a: "nice" },
      tz: "US/Eastern",
      onOpen: vi.fn(),
      detailsHref: (x) => `?paper=${x.shortId}`,
      ...options,
    });

  it("groups attended papers by day, in time order; unticked ones are left out", () => {
    const el = render();
    const days = [...el.querySelectorAll(".attended-day")].map((d) =>
      d.querySelector("h3").textContent.trim(),
    );
    expect(days).toEqual(["Tue Nov 10", "Wed Nov 11"]);
    expect(
      [...el.querySelectorAll(".attended-paper")].map((r) => r.dataset.paperId),
    ).toEqual(["b", "c", "a"]);
  });

  it("shows your rating, Not for me, or Rate it?, and the note", () => {
    const el = render();
    const row = (id) => el.querySelector(`[data-paper-id="${id}"]`);
    expect(row("a").textContent).toContain("★4");
    expect(row("a").textContent).toContain("nice");
    expect(row("c").textContent).toContain("👎");
    const rate = row("b").querySelector(".attended-rate");
    expect(rate.textContent).toContain("Rate it?");
    expect(rate.getAttribute("href")).toBe("?paper=s-b");
  });

  it("has an empty state", () => {
    expect(render({ attended: {} }).textContent).toContain(
      "Papers you attend show up here",
    );
  });
});

describe("Papers I attended → My Papers (Stage E)", () => {
  it("links to review attended papers in My Papers, with the My Papers toggle on rows", () => {
    const onToggle = vi.fn();
    const el = renderAttendedPapers(
      [
        {
          id: "a",
          shortId: "s-a",
          title: "A",
          day: "2026-11-11",
          start: "2026-11-11T15:00:00Z",
          typeShort: "Full",
        },
      ],
      {
        attended: { a: { at: "x", how: "auto" } },
        tz: "US/Eastern",
        onOpen: vi.fn(),
        detailsHref: () => "#",
        inMyPapers: () => false,
        onToggle,
      },
    );
    expect(el.querySelector("a.review-all").getAttribute("href")).toBe(
      "my-papers.html#review=attended",
    );
    el.querySelector(".follow-toggle").click();
    expect(onToggle).toHaveBeenCalled();
  });
});
