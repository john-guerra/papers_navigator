import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backupNudge,
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
