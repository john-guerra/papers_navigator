// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderImportHistory } from "../src/components/importHistory.js";
import { renderTransferImport } from "../src/components/transferImport.js";
import { createAttendedStore } from "../src/lib/attended.js";
import { createDislikedStore } from "../src/lib/disliked.js";
import { createFollowedStore } from "../src/lib/followed.js";
import { exportMyPapers, parseMyPapersFile } from "../src/lib/myPapersFile.js";
import { createNotesStore } from "../src/lib/notes.js";
import { createRatingsStore } from "../src/lib/ratings.js";
import { createRulesStore } from "../src/lib/rules.js";
import { resetStorageHealth } from "../src/lib/storageHealth.js";
import { applyTransfer, listSnapshots } from "../src/lib/sync/apply.js";
import { toEntries } from "../src/lib/sync/entries.js";
import { createSyncMeta } from "../src/lib/sync/meta.js";
import { readState } from "../src/lib/sync/state.js";

const T0 = new Date("2026-10-01T00:00:00Z");
const T1 = new Date("2026-10-02T00:00:00Z");
const t = "2026-10-01T12:00:00.000Z";
const TZ = "America/New_York";

function fakeStorage() {
  const m = new Map();
  const s = {
    m,
    fail: () => false,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (s.fail(k, String(v))) throw new Error("QuotaExceededError");
      m.set(k, String(v));
    },
    removeItem: (k) => m.delete(k),
  };
  return s;
}

/**
 * This device ("me", a Mac): papers a and b, a note, rating r1 = 2 recorded at T0, then the
 * rating changed to 5 here (v {me: 2}).
 */
function laptop() {
  const storage = fakeStorage();
  const stores = {
    followed: createFollowedStore("conf", storage, null),
    rules: createRulesStore("conf", storage, null),
    notes: createNotesStore("conf", storage, null),
    ratings: createRatingsStore("conf", storage, null),
    disliked: createDislikedStore("conf", storage, null),
    attended: createAttendedStore("conf", storage, null),
  };
  stores.followed.add([{ id: "a" }, { id: "b" }], "r", T0);
  stores.notes.set("n1", "laptop note");
  stores.ratings.set("r1", 2);
  const meta = createSyncMeta("conf", storage, () => "me");
  const reconcile = () =>
    meta.reconcile(toEntries(readState("conf", storage)), T0);
  reconcile();
  stores.ratings.set("r1", 5);
  reconcile();
  return { stores, meta, conferenceId: "conf", storage, now: T1 };
}

/** The phone's file: b removed, c added, r1 rated 3 (concurrent with the laptop's 5). */
function phoneFile({ notes = {}, sync = {}, device = "ph" } = {}) {
  return parseMyPapersFile(
    JSON.stringify({
      version: 3,
      device,
      deviceName: "iPhone",
      followed: [
        { id: "a", reason: "r", addedOn: T0.toISOString() },
        { id: "c", reason: "📱 Shared", addedOn: t },
      ],
      rules: [],
      exceptions: [],
      notes: { n1: "laptop note", ...notes },
      ratings: { r1: 3 },
      disliked: {},
      attended: {},
      sync: {
        "followed/a": { v: { me: 1 }, t },
        "followed/b": { v: { me: 1, ph: 1 }, t, deleted: true },
        "followed/c": { v: { ph: 1 }, t },
        "note/n1": { v: { me: 1 }, t },
        "rating/r1": { v: { me: 1, ph: 1 }, t },
        ...sync,
      },
    }),
  );
}

const papers = [
  { id: "a", title: "Paper A" },
  { id: "b", title: "Paper B" },
  { id: "c", title: "Paper C" },
  { id: "r1", title: "The rated paper" },
  { id: "n1", title: "The noted paper" },
];
const sessions = [{ sessionId: "s1", title: "Opening keynote" }];

const mount = (el) => (document.body.append(el), el);
const buttonNamed = (el, name) =>
  [...el.querySelectorAll("button")].find((b) => b.textContent.trim() === name);
const text = (el) => el.textContent.replace(/\s+/g, " ");
const state = (ctx) => readState("conf", ctx.storage);
const ids = (ctx) =>
  state(ctx)
    .followed.map((d) => d.id)
    .sort();

const render = (parsed, ctx, extra = {}) =>
  mount(
    renderTransferImport(parsed, {
      ctx,
      papers,
      sessions,
      fileName: "phone.json",
      deviceName: "Mac",
      tz: TZ,
      ...extra,
    }),
  );

beforeEach(() => resetStorageHealth());
afterEach(() => document.body.replaceChildren());

describe("renderTransferImport", () => {
  it("leaves v2 and older files to today's Merge / Replace choices", () => {
    const v2 = parseMyPapersFile(exportMyPapers({ followed: [{ id: "a" }] }));
    expect(
      renderTransferImport(v2, { ctx: laptop(), papers, sessions }),
    ).toBeNull();
    expect(
      renderTransferImport(parseMyPapersFile('[{"id":"a"}]'), {
        ctx: laptop(),
        papers,
        sessions,
      }),
    ).toBeNull();
  });

  it("summarizes the file, removals included, and lists one row per clash", () => {
    const ctx = laptop();
    const el = render(phoneFile(), ctx);
    expect(text(el)).toContain("From iPhone: 1 added, 1 removed");
    expect(text(el)).toContain("1 paper needs a choice");
    const rows = el.querySelectorAll(".transfer-clashes > li");
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector("h4").textContent).toBe("The rated paper");
    expect(text(rows[0])).toContain("iPhone: ★★★☆☆ · Mac: ★★★★★");
    expect(buttonNamed(rows[0], "Keep iPhone's")).toBeTruthy();
    expect(buttonNamed(rows[0], "Keep Mac's")).toBeTruthy();
    // "Keep both" is for two note texts only
    expect(buttonNamed(rows[0], "Keep both")).toBeUndefined();
  });

  it("changes nothing until Apply, which waits for every choice", () => {
    const ctx = laptop();
    const before = [...ctx.storage.m];
    const el = render(phoneFile(), ctx);
    const apply = buttonNamed(el, "Apply");
    expect(apply.disabled).toBe(true);
    const keep = buttonNamed(el, "Keep iPhone's");
    keep.click();
    expect(keep.getAttribute("aria-pressed")).toBe("true");
    expect(apply.disabled).toBe(false);
    expect([...ctx.storage.m]).toEqual(before);
    apply.click();
    expect(ids(ctx)).toEqual(["a", "c"]);
    expect(state(ctx).ratings.r1).toBe(3);
    expect(ctx.stores.ratings.get("r1")).toBe(3);
    expect(text(el.querySelector("[aria-live]"))).toContain(
      "Imported from iPhone",
    );
  });

  it("Undo this import puts both keys back", () => {
    const ctx = laptop();
    let changes = 0;
    const el = render(phoneFile(), ctx, { onChange: () => changes++ });
    buttonNamed(el, "Keep iPhone's").click();
    buttonNamed(el, "Apply").click();
    expect(changes).toBe(1);
    buttonNamed(el, "Undo this import").click();
    expect(ids(ctx)).toEqual(["a", "b"]);
    expect(state(ctx).ratings.r1).toBe(5);
    expect(changes).toBe(2);
    expect(text(el.querySelector("[aria-live]"))).toMatch(/undid the import/i);
    expect(buttonNamed(el, "Undo this import")).toBeUndefined();
  });

  it("keeping this device's value applies the rest and keeps the rating", () => {
    const ctx = laptop();
    const el = render(phoneFile(), ctx);
    buttonNamed(el, "Keep Mac's").click();
    buttonNamed(el, "Apply").click();
    expect(ids(ctx)).toEqual(["a", "c"]);
    expect(state(ctx).ratings.r1).toBe(5);
    // the choice is a new version here: the phone's 3 no longer clashes
    expect(ctx.meta.read()["rating/r1"].v).toEqual({ me: 3, ph: 1 });
  });

  it("Skip these for now applies the rest and keeps the clashes to answer later", () => {
    const ctx = laptop();
    const el = render(phoneFile(), ctx);
    buttonNamed(el, "Skip these for now").click();
    expect(ids(ctx)).toEqual(["a", "c"]);
    expect(state(ctx).ratings.r1).toBe(5);
    expect(text(el)).toContain("1 paper needs a choice");
    expect(text(el)).toMatch(/until you press Done or leave this page/);
    // answering later applies just that choice
    buttonNamed(el, "Keep iPhone's").click();
    expect(state(ctx).ratings.r1).toBe(3);
    expect(el.querySelectorAll(".transfer-clashes > li")).toHaveLength(0);
    // and Undo this import takes back both parts
    buttonNamed(el, "Undo this import").click();
    expect(ids(ctx)).toEqual(["a", "b"]);
    expect(state(ctx).ratings.r1).toBe(5);
  });

  it("answers given later join the import: one undo after a reload, one snapshot", () => {
    const ctx = laptop();
    ctx.stores.notes.set("n1", "laptop note, edited");
    ctx.meta.reconcile(toEntries(state(ctx)), T0);
    const el = render(
      phoneFile({
        notes: { n1: "phone note" },
        sync: { "note/n1": { v: { me: 1, ph: 1 }, t } },
      }),
      ctx,
    );
    buttonNamed(el, "Skip these for now").click();
    buttonNamed(el, "Keep iPhone's").click();
    buttonNamed(el, "Keep iPhone's").click();
    expect(el.querySelectorAll(".transfer-clashes > li")).toHaveLength(0);
    expect(state(ctx).ratings.r1).toBe(3);
    expect(state(ctx).notes.n1).toBe("phone note");
    buttonNamed(el, "Done").click();
    expect(listSnapshots(ctx)).toHaveLength(1);
    expect(listSnapshots(ctx)[0].label).toBe("Before the import from iPhone");
    // a new page
    const history = mount(
      renderImportHistory({ ...ctx, stores: undefined }, { tz: TZ }),
    );
    buttonNamed(history, "Undo this import").click();
    expect(ids(ctx)).toEqual(["a", "b"]);
    expect(state(ctx).ratings.r1).toBe(5);
    expect(state(ctx).notes.n1).toBe("laptop note, edited");
  });

  it("names what a restored backup couldn't save", () => {
    const ctx = laptop();
    const backup = parseMyPapersFile(
      exportMyPapers(state(ctx), { device: "me", sync: ctx.meta.read() }),
    );
    ctx.stores.notes.set("n1", "edited");
    ctx.stores.followed.remove(["a"]);
    const el = render(backup, ctx);
    buttonNamed(el, "Restore this backup").click();
    ctx.storage.fail = (k) => k === "papersNavigator:conf:notes";
    buttonNamed(el, "Restore").click();
    const status = text(el.querySelector("[aria-live]"));
    expect(status).toContain("couldn't be saved");
    expect(status).toContain("The noted paper");
    expect(ids(ctx)).toEqual(["a", "b"]);
  });

  it("a later answer that writes nothing keeps Undo this import working", () => {
    const ctx = laptop();
    ctx.stores.rules.add({ type: "author", value: "Bob" }, T0);
    ctx.meta.reconcile(toEntries(state(ctx)), T0);
    const parsed = phoneFile();
    // a rule no store can hold: its id isn't its value's
    parsed.rules = [{ id: "author:bob", type: "author", value: "Carl" }];
    parsed.sync["rule/author:bob"] = { v: { ph: 1 }, t };
    const el = render(parsed, ctx);
    buttonNamed(el, "Skip these for now").click();
    expect(ids(ctx)).toEqual(["a", "c"]);
    const row = [...el.querySelectorAll(".transfer-clashes > li")].find((li) =>
      li.textContent.includes("Bob"),
    );
    buttonNamed(row, "Keep iPhone's").click();
    buttonNamed(el, "Undo this import").click();
    expect(ids(ctx)).toEqual(["a", "b"]);
  });

  it("Undo this import clears the open clash list", () => {
    const ctx = laptop();
    const el = render(phoneFile(), ctx);
    buttonNamed(el, "Skip these for now").click();
    buttonNamed(el, "Undo this import").click();
    expect(el.querySelectorAll(".transfer-clashes > li")).toHaveLength(0);
    expect(text(el)).not.toContain("needs a choice");
    expect(state(ctx).ratings.r1).toBe(5);
  });

  it("Dismiss leaves the clashes as they are here", () => {
    const ctx = laptop();
    const el = render(phoneFile(), ctx);
    buttonNamed(el, "Skip these for now").click();
    buttonNamed(el, "Dismiss").click();
    expect(el.querySelectorAll(".transfer-clashes > li")).toHaveLength(0);
    expect(state(ctx).ratings.r1).toBe(5);
  });

  it("note clashes show both texts, clamped, and Use the newest for all keeps both", () => {
    const ctx = laptop();
    ctx.stores.notes.set("n1", "laptop note, edited");
    ctx.stores.notes.set("session:s1", "keynote: laptop");
    ctx.meta.reconcile(toEntries(state(ctx)), T0);
    const long = "phone ".repeat(60).trim();
    const el = render(
      phoneFile({
        notes: { n1: long, "session:s1": "keynote: phone" },
        sync: {
          "note/n1": { v: { me: 1, ph: 1 }, t },
          "note/session:s1": { v: { ph: 1 }, t },
        },
      }),
      ctx,
    );
    const rows = [...el.querySelectorAll(".transfer-clashes > li")];
    expect(rows.map((r) => r.querySelector("h4").textContent)).toEqual([
      "The noted paper",
      "The rated paper",
      "Opening keynote",
    ]);
    // a long note is clamped with Show all
    expect(text(rows[0])).not.toContain(long);
    buttonNamed(rows[0], "Show all").click();
    expect(text(rows[0])).toContain(long);
    expect(text(rows[0])).toContain("laptop note, edited");
    expect(buttonNamed(rows[0], "Keep both")).toBeTruthy();
    expect(text(el)).toContain("3 changes need a choice");
    buttonNamed(el, "Use the newest for all").click();
    expect(buttonNamed(rows[0], "Keep both").getAttribute("aria-pressed")).toBe(
      "true",
    );
    buttonNamed(el, "Apply").click();
    expect(state(ctx).notes.n1).toBe(`laptop note, edited\n\n${long}`);
    expect(state(ctx).notes["session:s1"]).toBe(
      "keynote: laptop\n\nkeynote: phone",
    );
  });

  it("describes removals in plain words", () => {
    const ctx = laptop();
    ctx.stores.notes.set("n1", "laptop note, edited");
    ctx.meta.reconcile(toEntries(state(ctx)), T0);
    const parsed = phoneFile({
      sync: { "note/n1": { v: { me: 1, ph: 1 }, t, deleted: true } },
    });
    delete parsed.notes.n1;
    const el = render(parsed, ctx);
    const row = el.querySelector(".transfer-clashes > li");
    expect(text(row)).toContain(
      "iPhone: note removed · Mac: laptop note, edited",
    );
  });

  it("says when the file has nothing new", () => {
    const ctx = laptop();
    const parsed = parseMyPapersFile(
      exportMyPapers(state(ctx), {
        device: "ph",
        deviceName: "iPhone",
        sync: ctx.meta.read(),
      }),
    );
    const el = render(parsed, ctx);
    expect(text(el)).toMatch(/nothing new/i);
    expect(buttonNamed(el, "Apply")).toBeUndefined();
  });

  it("changes nothing and says so when storage is full", () => {
    const ctx = laptop();
    const before = state(ctx);
    const el = render(phoneFile(), ctx);
    buttonNamed(el, "Keep iPhone's").click();
    ctx.storage.fail = (k) => k === "papersNavigator:conf:syncSnapshots";
    buttonNamed(el, "Apply").click();
    expect(text(el.querySelector("[aria-live]"))).toContain(
      "Couldn't import: this browser's storage is full. Nothing was changed.",
    );
    expect(state(ctx)).toEqual(before);
    // and Apply can be tried again
    ctx.storage.fail = () => false;
    buttonNamed(el, "Apply").click();
    expect(state(ctx).ratings.r1).toBe(3);
  });

  it("says which part didn't save", () => {
    const ctx = laptop();
    const el = render(phoneFile(), ctx);
    buttonNamed(el, "Keep iPhone's").click();
    ctx.storage.fail = (k) => k === "papersNavigator:conf:ratings";
    buttonNamed(el, "Apply").click();
    const status = text(el.querySelector("[aria-live]"));
    expect(status).toContain("couldn't be saved");
    expect(status).toContain("The rated paper");
    expect(ids(ctx)).toEqual(["a", "c"]);
  });

  it("shows the summary again instead of applying when the data here changed meanwhile", () => {
    const ctx = laptop();
    const el = render(phoneFile(), ctx);
    // the phone removed b; meanwhile b's reason changes here, so it is now a clash too
    ctx.stores.followed.remove(["b"]);
    ctx.stores.followed.add([{ id: "b" }], "again", T1);
    ctx.meta.reconcile(toEntries(state(ctx)), T1);
    buttonNamed(el, "Keep iPhone's").click();
    buttonNamed(el, "Apply").click();
    expect(ids(ctx)).toEqual(["a", "b"]);
    expect(text(el.querySelector("[aria-live]"))).toMatch(/changed meanwhile/);
    expect(el.querySelectorAll(".transfer-clashes > li")).toHaveLength(2);
  });

  it("a later answer checks the value here again first", () => {
    const ctx = laptop();
    const el = render(phoneFile(), ctx);
    buttonNamed(el, "Skip these for now").click();
    ctx.stores.ratings.set("r1", 1);
    ctx.meta.reconcile(toEntries(state(ctx)), T1);
    buttonNamed(el, "Keep iPhone's").click();
    expect(state(ctx).ratings.r1).toBe(1);
    expect(text(el.querySelector("[aria-live]"))).toMatch(/changed here since/);
    expect(text(el)).toContain("iPhone: ★★★☆☆ · Mac: ★☆☆☆☆");
    buttonNamed(el, "Keep iPhone's").click();
    expect(state(ctx).ratings.r1).toBe(3);
  });

  it("names two devices of the same kind apart", () => {
    const el = render(phoneFile(), laptop(), { deviceName: "iPhone" });
    expect(text(el)).toContain("Other iPhone: ★★★☆☆ · This iPhone: ★★★★★");
    expect(buttonNamed(el, "Keep other iPhone's")).toBeTruthy();
    expect(buttonNamed(el, "Keep this iPhone's")).toBeTruthy();
  });

  it("a backup from this device offers Restore this backup or Merge", () => {
    const ctx = laptop();
    const backup = parseMyPapersFile(
      exportMyPapers(state(ctx), { device: "me", sync: ctx.meta.read() }),
    );
    ctx.stores.followed.remove(["a"]);
    const el = render(backup, ctx);
    expect(text(el)).toContain("This is a backup from this device");
    expect(buttonNamed(el, "Merge")).toBeTruthy();
    buttonNamed(el, "Restore this backup").click();
    // inline confirm, nothing changed yet
    expect(text(el)).toContain(
      "Replace your current data with this backup? It's saved first, so you can undo.",
    );
    expect(ids(ctx)).toEqual(["b"]);
    buttonNamed(el, "Restore").click();
    expect(ids(ctx)).toEqual(["a", "b"]);
    expect(listSnapshots(ctx)[0].label).toMatch(/before restoring/i);
    buttonNamed(el, "Undo this import").click();
    expect(ids(ctx)).toEqual(["b"]);
  });

  it("Merge on a backup goes through the normal summary", () => {
    const ctx = laptop();
    const el = render(phoneFile({ device: "me" }), ctx);
    buttonNamed(el, "Merge").click();
    expect(text(el)).toContain("1 added, 1 removed");
    expect(buttonNamed(el, "Apply")).toBeTruthy();
  });

  it("buttons are real buttons and the clash list has headings", () => {
    const el = render(phoneFile(), laptop());
    expect(el.querySelector("ul.transfer-clashes")).toBeTruthy();
    expect(el.querySelector("h3")).toBeTruthy();
    for (const b of el.querySelectorAll("button"))
      expect(b.getAttribute("type")).toBe("button");
  });
});

describe("renderImportHistory", () => {
  it("is empty with no import to undo and no saved copies", () => {
    const el = mount(renderImportHistory(laptop(), { tz: TZ }));
    expect(el.hidden).toBe(true);
  });

  it("offers Undo this import after a reload, for 7 days", () => {
    const ctx = laptop();
    applyTransfer(ctx, [{ key: "rating/r1", value: 4, v: { ph: 9 }, t }], {
      from: "iPhone",
      label: "x",
    });
    // a new page: only storage remembers the import
    const el = mount(renderImportHistory(ctx, { tz: TZ }));
    expect(el.hidden).toBe(false);
    expect(text(el)).toContain("Last import from iPhone, Thu Oct 1 20:00");
    buttonNamed(el, "Undo this import").click();
    expect(state(ctx).ratings.r1).toBe(5);
    expect(buttonNamed(el, "Undo this import")).toBeUndefined();
    expect(text(el.querySelector("[aria-live]"))).toMatch(/undid/i);
    const later = mount(
      renderImportHistory(
        { ...ctx, now: new Date(T1.getTime() + 8 * 24 * 3600_000) },
        { tz: TZ },
      ),
    );
    expect(buttonNamed(later, "Undo this import")).toBeUndefined();
  });

  it("hides its Undo while the import screen offers one", () => {
    const ctx = laptop();
    applyTransfer(ctx, [{ key: "rating/r1", value: 4, v: { ph: 9 }, t }], {
      from: "iPhone",
      label: "x",
    });
    const el = mount(renderImportHistory(ctx, { tz: TZ }));
    el.refresh({ showUndo: false });
    expect(buttonNamed(el, "Undo this import")).toBeUndefined();
    el.refresh();
    expect(buttonNamed(el, "Undo this import")).toBeTruthy();
  });

  it("restores a saved copy after an inline confirm, with Undo", () => {
    const ctx = laptop();
    applyTransfer(
      ctx,
      [{ key: "followed/b", deleted: true, v: { ph: 9 }, t }],
      {
        from: "iPhone",
        label: "Before the import from iPhone",
      },
    );
    expect(ids(ctx)).toEqual(["a"]);
    const el = mount(renderImportHistory(ctx, { tz: TZ }));
    const details = el.querySelector("details");
    expect(details.open).toBe(false);
    const name =
      "Restore data from before the import from iPhone, Thu Oct 1 20:00 ET";
    buttonNamed(el, name).click();
    expect(text(el)).toContain(
      "Replace your current data with this? It's saved first, so you can undo.",
    );
    expect(ids(ctx)).toEqual(["a"]);
    buttonNamed(el, "Cancel").click();
    expect(ids(ctx)).toEqual(["a"]);
    buttonNamed(el, name).click();
    buttonNamed(el, "Restore").click();
    expect(ids(ctx)).toEqual(["a", "b"]);
    // the restore is what Undo now takes back
    expect(buttonNamed(el, "Undo this restore")).toBeTruthy();
    expect(
      buttonNamed(
        el,
        "Restore data from before restoring a saved copy, Thu Oct 1 20:00 ET",
      ),
    ).toBeTruthy();
    buttonNamed(el, "Undo").click();
    expect(ids(ctx)).toEqual(["a"]);
  });

  it("restores the copy that was chosen even if another one was saved meanwhile", () => {
    const ctx = laptop();
    applyTransfer(
      ctx,
      [{ key: "followed/b", deleted: true, v: { ph: 9 }, t }],
      {
        from: "iPhone",
        label: "Before the import from iPhone",
      },
    );
    const el = mount(renderImportHistory(ctx, { tz: TZ }));
    buttonNamed(
      el,
      "Restore data from before the import from iPhone, Thu Oct 1 20:00 ET",
    ).click();
    // another tab imports meanwhile: a new snapshot comes first
    applyTransfer(
      { ...ctx, now: new Date(T1.getTime() + 3600_000) },
      [
        {
          key: "followed/c",
          value: { reason: "x", addedOn: t },
          v: { pd: 1 },
          t,
        },
      ],
      { from: "iPad", label: "Before the import from iPad" },
    );
    buttonNamed(el, "Restore").click();
    expect(ids(ctx)).toEqual(["a", "b"]);
  });

  it("says when a restore couldn't save part of the data", () => {
    const ctx = laptop();
    applyTransfer(
      ctx,
      [{ key: "note/n1", value: "from the phone", v: { me: 1, ph: 1 }, t }],
      { from: "iPhone", label: "Before the import from iPhone" },
    );
    const el = mount(renderImportHistory(ctx, { tz: TZ, papers }));
    buttonNamed(
      el,
      "Restore data from before the import from iPhone, Thu Oct 1 20:00 ET",
    ).click();
    ctx.storage.fail = (k) => k === "papersNavigator:conf:notes";
    buttonNamed(el, "Restore").click();
    expect(text(el.querySelector("[aria-live]"))).toContain(
      "couldn't be saved",
    );
    expect(text(el.querySelector("[aria-live]"))).toContain("The noted paper");
  });
});
