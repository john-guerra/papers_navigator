// @vitest-environment jsdom
// Notes on sessions without papers stay reachable after their slot (#223 review): a list on Live
import { describe, expect, it, vi } from "vitest";
import { renderSessionNotes } from "../src/components/sessionNotes.js";

const TZ = "US/Eastern";
const sessions = [
  {
    sessionId: "panel",
    title: "Industry Meets Academia",
    typeLabel: "VIS Panels",
    room: "Hall America south",
    start: "2026-11-11T18:00:00+00:00",
    end: "2026-11-11T19:30:00+00:00",
  },
  {
    sessionId: "awards",
    title: "Awards",
    typeLabel: "Plenary",
    room: "Hall America",
    start: "2026-11-10T22:00:00+00:00",
    end: "2026-11-10T23:30:00+00:00",
  },
  {
    sessionId: "meetup",
    title: "Vega meetup",
    typeLabel: "Meetups",
    room: "Empire",
    start: "2026-11-11T17:30:00+00:00",
    end: "2026-11-11T18:00:00+00:00",
  },
];
const fakeNotes = (value) => {
  const store = new EventTarget();
  store.value = value;
  store.get = (id) => value[id] ?? "";
  store.set = vi.fn();
  return store;
};

describe("renderSessionNotes", () => {
  it("lists the sessions you noted, by time, each with its note to edit", () => {
    const notes = fakeNotes({
      "session:panel": "Ask about hiring",
      "session:awards": "Congratulate Lace",
      "paper-1": "a paper note, not listed here",
    });
    const el = renderSessionNotes(sessions, { notes, tz: TZ });
    document.body.append(el);
    const rows = [...el.querySelectorAll(".session-note")];
    expect(
      rows.map((r) => r.querySelector(".session-note-name").textContent),
    ).toEqual(["Awards", "Industry Meets Academia"]);
    expect(rows[0].textContent).toContain("Plenary");
    expect(rows[0].textContent).toContain("Hall America");
    expect(rows[0].textContent).toContain("Tue Nov 10");
    const field = rows[1].querySelector(".quick-note");
    expect(field.value).toBe("Ask about hiring");
    expect(field.getAttribute("aria-label")).toBe(
      "Quick note on Industry Meets Academia",
    );
    el.dispose();
    el.remove();
  });

  it("keeps a note whose session left the program, under its id", () => {
    const el = renderSessionNotes(sessions, {
      notes: fakeNotes({ "session:gone": "Still mine" }),
      tz: TZ,
    });
    const row = el.querySelector(".session-note");
    expect(row.querySelector(".session-note-name").textContent).toBe("gone");
    expect(row.querySelector(".quick-note").value).toBe("Still mine");
  });

  it("says where they come from when there are none", () => {
    const el = renderSessionNotes(sessions, { notes: fakeNotes({}), tz: TZ });
    expect(el.querySelector(".session-note")).toBeNull();
    expect(el.textContent).toContain("plenaries, panels and meetups");
  });
});
