import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backupDue,
  backupNudge,
  dataTotal,
  dismissBackup,
  isIosSafariTab,
  requestPersistence,
  resetStorageHealth,
  storageHealth,
} from "../src/lib/storageHealth.js";
import { createRatingsStore } from "../src/lib/ratings.js";
import { createNotesStore } from "../src/lib/notes.js";
import { createFollowedStore } from "../src/lib/followed.js";
import { createDislikedStore } from "../src/lib/disliked.js";

const throwing = () => ({
  getItem: () => null,
  setItem: () => {
    throw new DOMException("full", "QuotaExceededError");
  },
  removeItem: () => {},
});
afterEach(() => resetStorageHealth());

describe("storageHealth (Stage E)", () => {
  it("your data stores report a failed save once per page view", () => {
    const onFailure = vi.fn();
    storageHealth.addEventListener("failure", onFailure);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    createRatingsStore("c", throwing(), new EventTarget()).set("p", 4);
    createNotesStore("c", throwing(), new EventTarget()).set("p", "hi");
    createDislikedStore("c", throwing(), new EventTarget()).set("p", true);
    const followed = createFollowedStore("c", throwing(), new EventTarget());
    followed.add([{ id: "p" }], "★");
    expect(storageHealth.failed).toBe(true);
    expect(onFailure).toHaveBeenCalledTimes(1);
    storageHealth.removeEventListener("failure", onFailure);
  });
});

describe("backupNudge (Stage E)", () => {
  const tz = "US/Eastern";
  const now = new Date("2026-11-11T15:00:00Z");
  const base = {
    total: 0,
    lastExport: null,
    dismissedAt: null,
    now,
    lastDay: "2026-11-13",
    tz,
  };
  it("asks after 10 changes since the last export", () => {
    expect(backupNudge({ ...base, total: 9 })).toBe(false);
    expect(backupNudge({ ...base, total: 10 })).toBe(true);
    expect(
      backupNudge({
        ...base,
        total: 25,
        lastExport: { at: "2026-11-10T10:00:00Z", count: 20 },
      }),
    ).toBe(false);
  });
  it("asks on the conference's last day (and after)", () => {
    expect(
      backupNudge({ ...base, total: 1, now: new Date("2026-11-13T15:00:00Z") }),
    ).toBe(true);
    // nothing to back up: never
    expect(
      backupNudge({ ...base, total: 0, now: new Date("2026-11-13T15:00:00Z") }),
    ).toBe(false);
  });
  it("stays quiet for 24 h after an export or a dismissal", () => {
    expect(
      backupNudge({ ...base, total: 30, dismissedAt: "2026-11-11T05:00:00Z" }),
    ).toBe(false);
    expect(
      backupNudge({ ...base, total: 30, dismissedAt: "2026-11-10T05:00:00Z" }),
    ).toBe(true);
    expect(
      backupNudge({
        ...base,
        total: 30,
        lastExport: { at: "2026-11-11T10:00:00Z", count: 0 },
      }),
    ).toBe(false);
  });
});

describe("helpers (Stage E)", () => {
  it("isIosSafariTab: iPhone/iPad Safari, not from the Home Screen", () => {
    expect(
      isIosSafariTab({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
        standalone: false,
      }),
    ).toBe(true);
    expect(
      isIosSafariTab({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
        standalone: true,
      }),
    ).toBe(false);
    expect(isIosSafariTab({ userAgent: "Mozilla/5.0 (Macintosh)" })).toBe(
      false,
    );
  });
  it("requestPersistence asks once and swallows errors", async () => {
    const storage = { persist: vi.fn(async () => true) };
    await requestPersistence(storage);
    await requestPersistence(storage);
    expect(storage.persist).toHaveBeenCalledTimes(1);
    resetStorageHealth();
    await expect(
      requestPersistence({
        persist: async () => {
          throw new Error("no");
        },
      }),
    ).resolves.toBeUndefined();
    await expect(requestPersistence(undefined)).resolves.toBeUndefined();
  });
});

describe("backupNudge counts your list too (review fix)", () => {
  it("a list with no ratings or notes still gets the last-day reminder", () => {
    expect(
      backupNudge({
        total: 80,
        lastExport: null,
        dismissedAt: null,
        now: new Date("2026-11-13T15:00:00Z"),
        lastDay: "2026-11-13",
        tz: "US/Eastern",
      }),
    ).toBe(true);
  });
});

describe("shared backup reminder for My Papers and Live (minor 1)", () => {
  const memory = () => {
    const m = new Map();
    return {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
    };
  };
  const stores = (n) => ({
    followed: { value: [] },
    ratings: {
      value: Object.fromEntries(
        Array.from({ length: n }, (_, i) => [`p${i}`, 4]),
      ),
    },
    notes: { value: {} },
    disliked: { value: {} },
    attended: { value: { x: { off: true } } },
  });
  const base = {
    conferenceId: "c",
    now: new Date("2026-11-11T15:00:00Z"),
    lastDay: "2026-11-13",
    tz: "US/Eastern",
  };
  it("dataTotal counts your list, ratings, notes, 👎 and attended (not unticked ones)", () => {
    const s = stores(3);
    s.followed.value = [{ id: "a" }];
    s.attended.value.y = { at: "x", how: "auto" };
    expect(dataTotal(s)).toBe(5);
  });
  it("backupDue reads the last export and dismissal; dismissBackup quiets it", () => {
    const storage = memory();
    expect(backupDue({ ...base, total: 12, storage })).toBe(true);
    storage.setItem(
      "papersNavigator:c:lastExport",
      JSON.stringify({ at: "2026-11-10T10:00:00Z", count: 5 }),
    );
    expect(backupDue({ ...base, total: 12, storage })).toBe(false);
    expect(backupDue({ ...base, total: 15, storage })).toBe(true);
    dismissBackup("c", base.now, storage);
    expect(backupDue({ ...base, total: 15, storage })).toBe(false);
    // unreadable storage: still decides, quietly
    expect(
      backupDue({
        ...base,
        total: 15,
        storage: {
          getItem: () => {
            throw new Error("blocked");
          },
        },
      }),
    ).toBe(true);
  });
});
