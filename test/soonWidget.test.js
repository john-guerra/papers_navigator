// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { soonWidget } from "../src/components/soonWidget.js";
import { programDays } from "../src/lib/live.js";

const TZ = "US/Eastern";
const et = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 10, 11, h + 5, m)).toISOString();
};
const t = (id, s, room, from, extra = {}) => ({
  id,
  shortId: `s-${id}`,
  title: `Talk ${id}`,
  sessionId: s,
  sessionName: `Session ${s}`,
  room,
  sessionStart: et("10:30"),
  sessionEnd: et("12:00"),
  start: et(from),
  end: new Date(new Date(et(from)).getTime() + 12 * 60_000).toISOString(),
  typeShort: "Full",
  typeColor: "full",
  awardTier: null,
  ...extra,
});
const papers = [
  t("a1", "A", "Room 1", "10:30"),
  t("a2", "A", "Room 1", "10:42"),
  t("a3", "A", "Room 1", "10:54", { awardTier: "best", award: "best paper" }),
  t("c1", "C", "Room 3", "10:30"),
  t("c2", "C", "Room 3", "10:42"),
];
const [slot] = programDays(papers, TZ)[0].slots;
const C = slot.sessions.find((s) => s.sessionId === "C");
const mine = new Map([
  ["a2", { id: "a2", manual: true, reasons: ["★ Added by hand"] }],
  ["c2", { id: "c2", manual: true, reasons: ["★ Added by hand"] }],
]);

const setup = (options = {}) => {
  const handlers = { onSwitch: vi.fn(), onOpen: vi.fn() };
  const el = soonWidget({
    slot,
    session: C,
    at: new Date(et("10:40")),
    mine,
    tz: TZ,
    detailsHref: (p) => `?paper=${p.shortId}`,
    ...handlers,
    ...options,
  });
  document.body.append(el);
  return { el, ...handlers };
};
const button = (el) => el.querySelector(".soon-button");
const panel = (el) => el.querySelector(".soon-panel");

describe("soonWidget (#208)", () => {
  it("shows Soon with a badge counting talks worth moving for in other rooms", () => {
    const { el } = setup();
    expect(button(el).textContent).toContain("Soon");
    expect(el.querySelector(".soon-badge").textContent).toBe("2");
    expect(
      setup({ mine: new Map(), at: new Date(et("11:50")) }).el.querySelector(
        ".soon-badge",
      ),
    ).toBeNull();
    el.remove();
  });

  it("opens over the view and closes with ✕, Esc or the dim; focus returns to the button", () => {
    const { el } = setup();
    expect(panel(el).hidden).toBe(true);
    button(el).click();
    expect(panel(el).hidden).toBe(false);
    expect(button(el).getAttribute("aria-expanded")).toBe("true");
    expect(el.contains(document.activeElement)).toBe(true);
    panel(el).querySelector(".soon-close").click();
    expect(panel(el).hidden).toBe(true);
    expect(document.activeElement).toBe(button(el));
    button(el).click();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(panel(el).hidden).toBe(true);
    button(el).click();
    el.querySelector(".soon-dim").click();
    expect(panel(el).hidden).toBe(true);
    el.remove();
  });

  it("rows say when, where and why; Go there switches and closes; this room has no Go", () => {
    const { el, onSwitch } = setup();
    button(el).click();
    const rows = [...el.querySelectorAll(".soon-row")];
    expect(rows.map((r) => r.dataset.paperId)).toEqual(["a2", "c2", "a3"]);
    expect(rows[0].textContent).toContain("in 2 min");
    expect(rows[0].textContent).toContain("📍 Room 1");
    expect(rows[0].textContent).toContain("★ My Papers");
    expect(rows[1].textContent).toContain("this room");
    expect(rows[1].querySelector(".soon-go")).toBeNull();
    expect(rows[2].textContent).toContain("🏆 Best");
    rows[0].querySelector(".soon-go").click();
    expect(onSwitch).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "A" }),
    );
    expect(panel(el).hidden).toBe(true);
    el.remove();
  });

  it("On now: a line per other room with its talk, opening to its talks and Go there", () => {
    const { el, onSwitch } = setup();
    button(el).click();
    const lines = el.querySelectorAll(".soon-now");
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toContain("Room 1");
    expect(lines[0].textContent).toContain("Talk a1");
    lines[0].querySelector(".soon-go").click();
    expect(onSwitch).toHaveBeenCalled();
    el.remove();
  });

  it("says when nothing is worth moving for", () => {
    const { el } = setup({ mine: new Map(), at: new Date(et("11:50")) });
    button(el).click();
    expect(panel(el).textContent).toContain(
      "Nothing worth moving for in the next two talks",
    );
    el.remove();
  });

  it("update() refreshes rows and badge in place, keeping it open", () => {
    const { el } = setup();
    button(el).click();
    el.update(new Date(et("10:50")), mine);
    expect(panel(el).hidden).toBe(false);
    expect(
      [...el.querySelectorAll(".soon-row")].map((r) => r.dataset.paperId),
    ).toEqual(["a3"]);
    expect(el.querySelector(".soon-badge").textContent).toBe("1");
    el.remove();
  });
});

describe("Soon keeps your place when the clock ticks (#208 review)", () => {
  it("an expanded On now room stays open and focus stays on its Go there", () => {
    const { el } = setup();
    button(el).click();
    const line = el.querySelector(".soon-now");
    line.open = true;
    line.querySelector(".soon-go").focus();
    el.update(new Date(et("10:41")), mine);
    const again = el.querySelector(".soon-now");
    expect(again.open).toBe(true);
    expect(document.activeElement).toBe(again.querySelector(".soon-go"));
    el.remove();
  });
});
