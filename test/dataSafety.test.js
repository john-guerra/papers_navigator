// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { dataNote, storageBanner } from "../src/components/dataSafety.js";
import {
  reportStorageFailure,
  resetStorageHealth,
} from "../src/lib/storageHealth.js";

afterEach(() => resetStorageHealth());

describe("storageBanner (Stage E)", () => {
  it("is hidden until a save fails, then offers Export; ✕ hides it", () => {
    const onExport = vi.fn();
    const el = storageBanner({ onExport });
    expect(el.hidden).toBe(true);
    reportStorageFailure();
    expect(el.hidden).toBe(false);
    expect(el.getAttribute("role")).toBe("alert");
    expect(el.textContent).toContain("This browser isn't saving your changes");
    el.querySelector(".storage-export").click();
    expect(onExport).toHaveBeenCalled();
    el.querySelector(".storage-dismiss").click();
    expect(el.hidden).toBe(true);
    el.dispose();
  });

  it("elsewhere it links to My Papers to export", () => {
    const el = storageBanner({ exportHref: "my-papers.html#export" });
    reportStorageFailure();
    const a = el.querySelector("a.storage-export");
    expect(a.textContent).toContain("Open My Papers to export");
    expect(a.getAttribute("href")).toBe("my-papers.html#export");
    el.dispose();
  });

  it("shows at once when a save already failed before it was made", () => {
    reportStorageFailure();
    const el = storageBanner({ onExport: () => {} });
    expect(el.hidden).toBe(false);
    el.dispose();
  });
});

describe("dataNote (Stage E)", () => {
  it("always says the data stays in this browser, with Export JSON", () => {
    const onExport = vi.fn();
    const el = dataNote({ onExport });
    expect(el.textContent).toContain("Saved only in this browser.");
    expect(el.textContent).toContain("aren't sent anywhere");
    el.querySelector(".data-export").click();
    expect(onExport).toHaveBeenCalled();
    expect(el.querySelector(".backup-nudge")).toBeNull();
  });

  it("with a nudge: Back up … Export JSON, dismissible; on iPhone the 7-day line", () => {
    const onDismiss = vi.fn();
    const el = dataNote({
      exportHref: "my-papers.html#export",
      nudge: true,
      ios: true,
      onDismiss,
    });
    const nudge = el.querySelector(".backup-nudge");
    expect(nudge.textContent).toContain("Back up your notes and ratings");
    expect(nudge.textContent).toContain(
      "Safari may delete this site's data after 7 days",
    );
    // the Home Screen app keeps its own data: adding it alone opens an empty list
    expect(nudge.textContent).toContain(
      "Add it to your Home Screen, then Export here and Import the file there",
    );
    nudge.querySelector(".backup-dismiss").click();
    expect(onDismiss).toHaveBeenCalled();
    expect(el.querySelector(".backup-nudge")).toBeNull();
  });
});
