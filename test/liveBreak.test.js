// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderBreakView } from "../src/components/liveBreak.js";
import { liveClockControl } from "../src/components/liveClockControl.js";
import { fromZonedInput, zonedInput } from "../src/lib/time.js";
import { programDays, slotsAt } from "../src/lib/live.js";

const TZ = "US/Eastern";
const et = (hhmm, day = 11) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 10, day, h + 5, m)).toISOString();
};
const paper = (id, sessionId, room, start, extra = {}) => ({
  id,
  shortId: `s-${id}`,
  title: `Paper ${id}`,
  authors: [{ name: `Author ${id}` }],
  sessionId,
  sessionName: `Session ${sessionId}`,
  room,
  sessionStart: start,
  sessionEnd: new Date(new Date(start).getTime() + 90 * 60_000).toISOString(),
  start,
  end: new Date(new Date(start).getTime() + 15 * 60_000).toISOString(),
  typeShort: "Full",
  typeColor: "full",
  clusterLabel: "Perception",
  ...extra,
});
const papers = [
  paper("a1", "A", "Room 2", et("10:30")),
  ...Array.from({ length: 12 }, (_, i) =>
    paper(`b${i}`, "B", "Room 3", et("10:30")),
  ),
  paper("c1", "C", "Room 1", et("10:30")),
  paper("d1", "D", "Room 1", et("14:00")),
  paper("e1", "E", "Room 1", et("09:00", 12)),
];
const days = programDays(papers, TZ);

const setup = (at, options = {}) => {
  const handlers = {
    onGoing: vi.fn(),
    onPickSlot: vi.fn(),
    onOpen: vi.fn(),
  };
  const el = renderBreakView(slotsAt(days, new Date(at), TZ), {
    tz: TZ,
    mineIds: new Set(["b0", "b1"]),
    detailsHref: (p) => `?paper=${p.shortId}`,
    ...handlers,
    ...options,
  });
  document.body.append(el);
  return { el, ...handlers };
};

describe("renderBreakView (#203)", () => {
  it("lists the next slot's sessions, most of yours first, the first recommended", () => {
    const { el } = setup(et("09:00"));
    const cards = [...el.querySelectorAll(".live-session")];
    expect(cards.map((c) => c.dataset.sessionId)).toEqual(["B", "C", "A"]);
    expect(cards[0].querySelector(".live-recommended")).toBeTruthy();
    expect(cards[1].querySelector(".live-recommended")).toBeNull();
    expect(cards[0].querySelector(".live-mine").textContent).toContain(
      "2 of yours",
    );
    expect(cards[0].textContent).toContain("Session B");
    expect(cards[0].textContent).toContain("📍 Room 3");
    expect(cards[0].querySelector(".live-summary").textContent).toContain(
      "12 papers",
    );
    el.remove();
  });

  it("expands a session into 10 rows, then Show all", () => {
    const { el } = setup(et("09:00"));
    const card = el.querySelector('[data-session-id="B"]');
    expect(card.querySelectorAll(".live-paper")).toHaveLength(10);
    const all = card.querySelector(".live-show-all");
    expect(all.textContent).toContain("Show all 12");
    all.click();
    expect(card.querySelectorAll(".live-paper")).toHaveLength(12);
    // your papers are marked
    expect(card.querySelectorAll(".live-paper.is-mine").length).toBe(2);
    el.remove();
  });

  it("rows have the type pill, title link and authors; a title opens the details", () => {
    const { el, onOpen } = setup(et("09:00"));
    const row = el.querySelector('[data-session-id="A"] .live-paper');
    expect(row.querySelector(".type-pill")).toBeTruthy();
    expect(row.textContent).toContain("Author a1");
    expect(row.textContent).toContain("Perception");
    const link = row.querySelector("a.live-title");
    expect(link.getAttribute("href")).toBe("?paper=s-a1");
    link.click();
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }));
    el.remove();
  });

  it("Going here commits to that session", () => {
    const { el, onGoing } = setup(et("09:00"));
    el.querySelector('[data-session-id="C"] .live-going').click();
    expect(onGoing).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "C" }),
    );
    el.remove();
  });

  it("Later today moves the time to another slot", () => {
    const { el, onPickSlot } = setup(et("09:00"));
    const later = el.querySelectorAll(".live-later button");
    expect(later).toHaveLength(1);
    expect(later[0].textContent).toContain("14:00");
    expect(later[0].textContent).toContain("1 session");
    later[0].click();
    expect(onPickSlot).toHaveBeenCalledWith(
      expect.objectContaining({ start: new Date(et("14:00")).getTime() }),
    );
    el.remove();
  });

  it("with nothing left today, says so and offers tomorrow's first slot", () => {
    const { el, onPickSlot } = setup(et("18:00"));
    expect(el.textContent).toContain("No more sessions today");
    const next = el.querySelector(".live-next-day");
    expect(next.textContent).toContain("Thu Nov 12");
    next.click();
    expect(onPickSlot).toHaveBeenCalled();
    el.remove();
  });

  it("shows a Now section while a slot runs", () => {
    const { el } = setup(et("10:40"));
    expect(el.querySelector(".live-now")).toBeTruthy();
    expect(el.querySelector(".live-now").textContent).toContain("Session B");
    el.remove();
  });
});

describe("zonedInput / fromZonedInput", () => {
  it("round-trips a time in the conference timezone", () => {
    const at = fromZonedInput("2026-11-11T14:05", TZ);
    expect(at.toISOString()).toBe("2026-11-11T19:05:00.000Z");
    expect(zonedInput(at, TZ)).toBe("2026-11-11T14:05");
  });
});

describe("liveClockControl (#203)", () => {
  const fakeClock = (override) => {
    const clock = new EventTarget();
    clock.value = { at: new Date(et("10:40")), override };
    clock.setTo = vi.fn();
    clock.reset = vi.fn();
    return clock;
  };

  it("sets the time from the input, in the conference timezone", () => {
    const clock = fakeClock(false);
    const el = liveClockControl(clock, { tz: TZ });
    const input = el.querySelector("input");
    expect(input.value).toBe("2026-11-11T10:40");
    input.value = "2026-11-11T14:00";
    input.dispatchEvent(new Event("change"));
    expect(clock.setTo).toHaveBeenCalledWith(new Date(et("14:00")));
    expect(el.querySelector(".live-back-to-now")).toBeNull();
  });

  it("shows the set time and Back to now while overridden", () => {
    const clock = fakeClock(true);
    const el = liveClockControl(clock, { tz: TZ });
    expect(el.textContent).toContain("Set time: Wed Nov 11 10:40");
    el.querySelector(".live-back-to-now").click();
    expect(clock.reset).toHaveBeenCalled();
  });
});

describe("renderBreakView in the day's last slot (#203 Stage B)", () => {
  it("says Nothing after this today under a running last slot", () => {
    const { el } = setup(et("14:10"));
    expect(el.querySelector(".live-now")).toBeTruthy();
    expect(el.textContent).toContain("Nothing after this today");
    expect(el.textContent).not.toContain("No more sessions today");
    el.remove();
  });
});

describe("break view: My Papers toggle on each paper (John)", () => {
  it("each paper row has Add to My Papers / In My Papers; setMine updates rows and counts in place", () => {
    const onToggle = vi.fn();
    let mineSet = new Set(["b0", "b1"]);
    const { el } = setup(et("09:00"), {
      inMyPapers: (id) => mineSet.has(id),
      onToggle,
    });
    const card = el.querySelector('[data-session-id="A"]');
    card.querySelector("details").open = true;
    const toggle = card.querySelector(".live-paper .follow-toggle");
    expect(toggle.textContent).toContain("Add to My Papers");
    toggle.click();
    expect(onToggle).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a1" }),
    );
    mineSet = new Set(["b0", "b1", "a1"]);
    el.setMine(mineSet);
    expect(toggle.textContent).toContain("In My Papers");
    expect(card.querySelector("details").open).toBe(true);
    expect(card.querySelector(".live-mine strong").textContent).toBe("1");
    el.remove();
  });
});

describe("break view: sessions without papers (plenaries, panels)", () => {
  const awards = {
    sessionId: "awards",
    type: "plenary",
    typeLabel: "Plenary",
    title: "Awards",
    room: "Hall America",
    start: et("17:00"),
    end: et("18:30"),
    url: "https://ieeevis.org/year/2026/program/session/awards",
    paperIds: [],
  };
  const withAwards = programDays(papers, TZ, [awards]);

  it("shows the event with its type, room and VIS link, and Going here", () => {
    const onGoing = vi.fn();
    const el = renderBreakView(slotsAt(withAwards, new Date(et("16:00")), TZ), {
      tz: TZ,
      mineIds: new Set(),
      detailsHref: () => "#",
      onGoing,
      onPickSlot: vi.fn(),
      onOpen: vi.fn(),
    });
    const card = el.querySelector('.live-session[data-session-id="awards"]');
    expect(card.textContent).toContain("Awards");
    expect(card.textContent).toContain("📍 Hall America");
    expect(card.querySelector(".live-summary").textContent).toBe("Plenary");
    expect(card.querySelector(".live-mine")).toBeNull();
    expect(card.querySelector(".live-expand")).toBeNull();
    expect(card.querySelector("a.live-event-link").href).toBe(awards.url);
    card.querySelector(".live-going").click();
    expect(onGoing).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "awards" }),
    );
  });

  it('follows My Papers changes without an "of yours" box on the event', () => {
    const el = renderBreakView(slotsAt(withAwards, new Date(et("16:00")), TZ), {
      tz: TZ,
      mineIds: new Set(),
      detailsHref: () => "#",
      onGoing: vi.fn(),
      onPickSlot: vi.fn(),
      onOpen: vi.fn(),
    });
    expect(() => el.setMine(new Set(["d1"]))).not.toThrow();
  });
});

describe("event links (security review)", () => {
  it("links only http(s) addresses", async () => {
    const { eventLink } = await import("../src/components/liveBreak.js");
    expect(eventLink({ event: { url: "javascript:alert(1)" } })).toBe("");
    expect(
      eventLink({ event: { url: "https://ieeevis.org/s/x" } }).querySelector(
        "a",
      ).href,
    ).toBe("https://ieeevis.org/s/x");
  });
});
