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

  it("offers Add to My Papers only for papers not in it", () => {
    const { el, onAdd } = setup();
    const rows = el.querySelectorAll(".live-talk");
    expect(rows[0].querySelector(".live-add")).toBeNull();
    rows[1].querySelector(".live-add").click();
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: "b2" }));
    el.remove();
  });

  it("Add to My Papers updates its own row (no rebuild): the button goes away", () => {
    const { el, onAdd } = setup();
    const row = el.querySelectorAll(".live-talk")[1];
    row.querySelector(".live-add").click();
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(row.querySelector(".live-add")).toBeNull();
    expect(row.isConnected).toBe(true);
    el.remove();
  });

  it("Switch room lists the other rooms with their talk now and your next paper there", () => {
    const { el, onSwitch } = setup();
    const bar = el.querySelector(".live-switch");
    expect(bar.querySelector("summary").textContent).toContain(
      "Switch room · 2 others",
    );
    const options = [...bar.querySelectorAll(".live-switch-option")];
    expect(options.map((o) => o.dataset.sessionId)).toEqual(["A", "C"]);
    expect(options[0].textContent).toContain("Now: Paper a2");
    expect(options[0].textContent).toContain("1 of yours");
    expect(options[0].textContent).toContain("Yours next: Paper a3 · 11:00");
    options[0].click();
    expect(onSwitch).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "A" }),
    );
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

  it("picking a room closes the Switch room list first (#203 Stage B)", () => {
    const seen = [];
    const { el } = setup({
      onSwitch: () => seen.push(el.querySelector(".live-switch").open),
    });
    const bar = el.querySelector(".live-switch");
    bar.open = true;
    bar.querySelector(".live-switch-option").click();
    expect(seen).toEqual([false]);
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
