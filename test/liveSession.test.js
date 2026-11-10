// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderSessionView } from "../src/components/liveSession.js";
import { programDays } from "../src/lib/live.js";

const TZ = "US/Eastern";
const et = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 10, 11, h + 5, m)).toISOString();
};
const talk = (id, sessionId, room, from, to) => ({
  id,
  shortId: `s-${id}`,
  title: `Paper ${id}`,
  authors: [{ name: `Author ${id}` }],
  sessionId,
  sessionName: `Session ${sessionId}`,
  room,
  sessionStart: et("10:30"),
  sessionEnd: et("12:00"),
  start: et(from),
  end: et(to),
  typeShort: "Full",
  typeColor: "full",
  typeLabel: "Full VIS Paper",
  abstract: `Abstract of ${id}`,
  url: `https://ieeevis.org/${id}`,
});
const papers = [
  talk("b1", "B", "Room 3", "10:30", "10:45"),
  talk("b2", "B", "Room 3", "10:45", "11:00"),
  talk("b3", "B", "Room 3", "11:00", "11:15"),
  talk("a1", "A", "Room 2", "10:30", "10:45"),
  talk("a2", "A", "Room 2", "10:45", "11:00"),
  talk("a3", "A", "Room 2", "11:00", "11:15"),
  talk("c1", "C", "Room 1", "10:30", "10:45"),
];
const [slot] = programDays(papers, TZ)[0].slots;
const B = slot.sessions.find((s) => s.sessionId === "B");

const fakeRatings = (initial = {}) => {
  const store = new EventTarget();
  let value = { ...initial };
  store.get = (id) => value[id] ?? 0;
  store.set = vi.fn((id, n) => {
    value = { ...value, [id]: n };
    store.dispatchEvent(new Event("input"));
  });
  return store;
};
const fakeNotes = () => {
  const store = new EventTarget();
  store.get = () => "";
  store.set = vi.fn();
  return store;
};

const setup = (options = {}) => {
  const handlers = {
    onSwitch: vi.fn(),
    onLeave: vi.fn(),
    onAdd: vi.fn(),
    onOpen: vi.fn(),
  };
  const ratings = fakeRatings({ b1: 3 });
  const el = renderSessionView(B, {
    slot,
    at: new Date(et("10:50")),
    tz: TZ,
    mineIds: new Set(["b1", "a3"]),
    mine: new Map([
      ["b1", { id: "b1", manual: true, reasons: ["★ Added by hand"] }],
      ["a3", { id: "a3", manual: true, reasons: ["★ Added by hand"] }],
    ]),
    ratings,
    notes: fakeNotes(),
    detailsHref: (p) => `?paper=${p.shortId}`,
    ...handlers,
    ...options,
  });
  document.body.append(el);
  return { el, ratings, ...handlers };
};

describe("renderSessionView (#203)", () => {
  it("shows the session's papers in talk order, the talk now highlighted", () => {
    const { el } = setup();
    const rows = [...el.querySelectorAll(".live-talk")];
    expect(rows.map((r) => r.dataset.paperId)).toEqual(["b1", "b2", "b3"]);
    expect(rows[1].classList).toContain("is-now");
    expect(el.querySelectorAll(".is-now")).toHaveLength(1);
    expect(el.querySelector(".live-session-name").textContent).toContain(
      "Session B",
    );
    el.remove();
  });

  it("rates a paper with the stars", () => {
    const { el, ratings } = setup();
    const rows = el.querySelectorAll(".live-talk");
    expect(rows[0].querySelector(".star-rating").value).toBe(3);
    rows[1].querySelectorAll(".star")[4].click();
    expect(ratings.set).toHaveBeenCalledWith("b2", 5);
    el.remove();
  });

  it("each row has a quick note", () => {
    const { el } = setup();
    expect(el.querySelectorAll(".live-talk .quick-note")).toHaveLength(3);
    el.remove();
  });

  it("setNow moves the highlight without rebuilding the rows (keeps typing)", () => {
    const { el } = setup();
    const rows = [...el.querySelectorAll(".live-talk")];
    el.setNow(new Date(et("11:05")));
    expect(rows[2].classList).toContain("is-now");
    expect(rows[1].classList).not.toContain("is-now");
    expect([...el.querySelectorAll(".live-talk")]).toEqual(rows);
    el.remove();
  });

  it("each talk has Details in place (collapsed) and a jump to the full details", () => {
    const { el, onOpen } = setup();
    const row = el.querySelectorAll(".live-talk")[1];
    const toggle = row.querySelector(".compact-details-toggle");
    const panel = row.querySelector(".compact-details");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(panel.hidden).toBe(true);
    toggle.click();
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain("Abstract of b2");
    expect(panel.textContent).toContain("Full VIS Paper");
    expect(panel.textContent).toContain("Author b2");
    expect(
      panel.querySelector('a[href="https://ieeevis.org/b2"]'),
    ).toBeTruthy();
    panel.querySelector(".compact-details-open").click();
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "b2" }));
    // the stars and the note stay in the row, next to the details
    expect(row.querySelector(".star-rating")).toBeTruthy();
    expect(row.querySelector(".quick-note")).toBeTruthy();
    el.remove();
  });

  it("Post toggles a Bluesky panel under the talk (#203 Stage C)", () => {
    const postPanel = vi.fn((p) => {
      const el = document.createElement("section");
      el.className = "post-panel";
      el.dataset.for = p.id;
      return el;
    });
    const { el } = setup({ postPanel });
    const row = el.querySelectorAll(".live-talk")[1];
    const post = row.querySelector(".live-post");
    expect(post.getAttribute("aria-expanded")).toBe("false");
    post.click();
    expect(row.querySelector(".post-panel").dataset.for).toBe("b2");
    expect(post.getAttribute("aria-expanded")).toBe("true");
    post.click();
    expect(row.querySelector(".post-panel")).toBeNull();
    el.remove();
  });

  it("setDiscussion links a talk's Bluesky discussion in place", () => {
    const { el } = setup();
    el.setDiscussion(new Map([["b3", "https://bsky.app/profile/x/post/1"]]));
    const links = el.querySelectorAll("a.live-discussion");
    expect(links).toHaveLength(1);
    expect(links[0].closest(".live-talk").dataset.paperId).toBe("b3");
    expect(links[0].getAttribute("href")).toBe(
      "https://bsky.app/profile/x/post/1",
    );
    // idempotent
    el.setDiscussion(new Map([["b3", "https://bsky.app/profile/x/post/1"]]));
    expect(el.querySelectorAll("a.live-discussion")).toHaveLength(1);
    el.remove();
  });

  it("Soon replaces Switch room: worth moving for, and Go there switches (#208)", () => {
    const { el, onSwitch } = setup();
    expect(el.querySelector(".live-switch")).toBeNull();
    const soon = el.querySelector(".soon-widget");
    // a3 (yours) starts at 11:00 in Room 2, within the next two talks
    expect(soon.querySelector(".soon-badge").textContent).toBe("1");
    soon.querySelector(".soon-button").click();
    soon.querySelector('.soon-row[data-paper-id="a3"] .soon-go').click();
    expect(onSwitch).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "A" }),
    );
    el.remove();
  });

  it("setMine updates Soon's reasons in place (My Papers changed)", () => {
    const { el } = setup();
    el.setMine(new Map());
    expect(el.querySelector(".soon-badge")).toBeNull();
    el.remove();
  });

  it("setNow updates Soon in place", () => {
    const { el } = setup();
    el.setNow(new Date(et("11:05")));
    // a3 is now 5 min in: no longer upcoming
    expect(el.querySelector(".soon-badge")).toBeNull();
    el.remove();
  });

  it("each talk has ✓ Attended (#208)", () => {
    const store = new EventTarget();
    let v = { b2: { at: "x", how: "auto" } };
    store.isAttended = (id) => Boolean(v[id] && !v[id].off);
    store.set = vi.fn((id, on) => {
      v = { ...v, [id]: on ? { at: "x", how: "manual" } : { off: true } };
      store.dispatchEvent(new Event("input"));
    });
    const { el } = setup({ attended: store });
    const rows = el.querySelectorAll(".live-talk");
    expect(
      rows[1].querySelector(".attended-toggle").getAttribute("aria-pressed"),
    ).toBe("true");
    rows[1].querySelector(".attended-toggle").click();
    expect(store.set).toHaveBeenCalledWith("b2", false);
    el.remove();
  });

  it("every talk has the My Papers toggle: Add to My Papers / In My Papers (John)", () => {
    const onToggle = vi.fn();
    let mine = new Set(["b1"]);
    const { el } = setup({ inMyPapers: (id) => mine.has(id), onToggle });
    const rows = el.querySelectorAll(".live-talk");
    const t = (i) => rows[i].querySelector(".follow-toggle");
    expect(t(0).textContent).toContain("In My Papers");
    expect(t(1).textContent).toContain("Add to My Papers");
    expect(el.querySelector(".live-add")).toBeNull();
    t(1).click();
    expect(onToggle).toHaveBeenCalledWith(
      expect.objectContaining({ id: "b2" }),
    );
    mine = new Set(["b1", "b2"]);
    el.setMine(
      new Map([
        ["b1", {}],
        ["b2", {}],
      ]),
    );
    expect(t(1).textContent).toContain("In My Papers");
    el.remove();
  });

  it("Leave session goes back to the break view", () => {
    const { el, onLeave } = setup();
    el.querySelector(".live-leave").click();
    expect(onLeave).toHaveBeenCalled();
    el.remove();
  });

  it("dispose flushes the quick notes", () => {
    const { el } = setup();
    expect(() => el.dispose()).not.toThrow();
    el.remove();
  });
});
