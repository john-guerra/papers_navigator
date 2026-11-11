// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  enableFileDrop,
  renderSendToDevice,
} from "../src/components/sendToDevice.js";

const flush = () => new Promise((r) => setTimeout(r, 0));
const button = (el, label) =>
  [...el.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === label,
  );

function setup(extra = {}) {
  const opts = {
    payload: () => '{"version":3}',
    fileName: "ieeevis2026-my-papers.json",
    share: { canShare: () => true, share: vi.fn(async () => {}) },
    clipboard: {
      writeText: vi.fn(async () => {}),
      readText: vi.fn(async () => '{"version":3}'),
    },
    download: vi.fn(),
    onPaste: vi.fn(),
    onSent: vi.fn(),
    nav: { userAgent: "Mac", standalone: false },
    ...extra,
  };
  const el = renderSendToDevice(opts);
  document.body.append(el);
  return { el, opts };
}

describe("send to my other device", () => {
  it("shares the file when the browser can share files", async () => {
    const { el, opts } = setup();
    button(el, "Send to my other device").click();
    await flush();
    const { files, title } = opts.share.share.mock.calls[0][0];
    expect(files[0].name).toBe("ieeevis2026-my-papers.json");
    expect(files[0].type).toBe("application/json");
    expect(title).toBeTruthy();
    expect(opts.download).not.toHaveBeenCalled();
    expect(opts.onSent).toHaveBeenCalled();
  });

  it("downloads the file when it can't share files", async () => {
    const { el, opts } = setup({
      share: { canShare: () => false, share: vi.fn() },
    });
    button(el, "Send to my other device").click();
    await flush();
    expect(opts.download).toHaveBeenCalledOnce();
    expect(opts.download.mock.calls[0][0].name).toBe(
      "ieeevis2026-my-papers.json",
    );
    expect(opts.share.share).not.toHaveBeenCalled();
    expect(opts.onSent).toHaveBeenCalledOnce();
  });

  it("downloads when share is missing altogether", async () => {
    const { el, opts } = setup({ share: {} });
    button(el, "Send to my other device").click();
    await flush();
    expect(opts.download).toHaveBeenCalledOnce();
  });

  it("is silent when the share sheet is dismissed", async () => {
    const abort = Object.assign(new Error("x"), { name: "AbortError" });
    const { el, opts } = setup({
      share: {
        canShare: () => true,
        share: vi.fn(async () => {
          throw abort;
        }),
      },
    });
    button(el, "Send to my other device").click();
    await flush();
    expect(el.querySelector("[aria-live]").textContent).toBe("");
    expect(opts.onSent).not.toHaveBeenCalled();
  });

  it("copies the payload", async () => {
    const { el, opts } = setup();
    button(el, "Copy for my other device").click();
    await flush();
    expect(opts.clipboard.writeText).toHaveBeenCalledWith('{"version":3}');
    expect(el.querySelector("[aria-live]").textContent).toBe(
      "Copied: paste it in My Papers on the other device",
    );
    // the clipboard isn't a backup: the backup reminder keeps counting
    expect(opts.onSent).not.toHaveBeenCalled();
  });

  it("hands pasted text to onPaste", async () => {
    const { el, opts } = setup();
    button(el, "Paste from my other device").click();
    await flush();
    expect(opts.onPaste).toHaveBeenCalledWith('{"version":3}', "pasted text");
  });

  it("explains when pasting is blocked", async () => {
    const { el, opts } = setup({
      clipboard: {
        readText: vi.fn(async () => {
          throw new Error("denied");
        }),
      },
    });
    button(el, "Paste from my other device").click();
    await flush();
    expect(opts.onPaste).not.toHaveBeenCalled();
    expect(el.querySelector("[aria-live]").textContent).toBe(
      "Your browser didn't allow pasting here. Use Import instead.",
    );
  });

  it("shows the Home Screen hint only in an iOS Safari tab", () => {
    const hint = "Using the Home Screen app? Use Import JSON there.";
    expect(
      setup({ nav: { userAgent: "iPhone", standalone: false } }).el.textContent,
    ).toContain(hint);
    expect(
      setup({ nav: { userAgent: "iPhone", standalone: true } }).el.textContent,
    ).not.toContain(hint);
    expect(setup().el.textContent).not.toContain(hint);
  });
});

describe("drop a file on the data area", () => {
  const dropEvent = (type, files, types = ["Files"]) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    e.dataTransfer = { files, types };
    return e;
  };
  const file = (name, text) => ({ name, text: async () => text });

  it("imports a dropped .json file and shows the drop state while dragging", async () => {
    const area = document.createElement("div");
    const onText = vi.fn();
    enableFileDrop(area, onText);
    area.dispatchEvent(dropEvent("dragover", []));
    expect(area.classList.contains("drop-target")).toBe(true);
    area.dispatchEvent(dropEvent("drop", [file("a.json", "{}")]));
    await flush();
    expect(onText).toHaveBeenCalledWith("{}", "a.json");
    expect(area.classList.contains("drop-target")).toBe(false);
  });

  it("ignores things that are not files, and non-json files", async () => {
    const area = document.createElement("div");
    const onText = vi.fn();
    enableFileDrop(area, onText);
    const e = dropEvent("dragover", [], ["text/plain"]);
    area.dispatchEvent(e);
    expect(area.classList.contains("drop-target")).toBe(false);
    expect(e.defaultPrevented).toBe(false);
    area.dispatchEvent(dropEvent("drop", [file("a.png", "x")]));
    await flush();
    expect(onText).not.toHaveBeenCalled();
  });
});

describe("a file dropped outside the data area", () => {
  const dragEvent = (type, types = ["Files"], files = []) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    e.dataTransfer = { files, types };
    return e;
  };

  function page() {
    const area = document.createElement("div");
    const elsewhere = document.createElement("p");
    document.body.append(area, elsewhere);
    const onText = vi.fn();
    const onStray = vi.fn();
    const stop = enableFileDrop(area, onText, { doc: document, onStray });
    return { area, elsewhere, onText, onStray, stop };
  }

  it("doesn't let the browser open the file, and points to the data area", () => {
    const { elsewhere, onText, onStray, stop } = page();
    const over = dragEvent("dragover");
    elsewhere.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    const drop = dragEvent(
      "drop",
      ["Files"],
      [{ name: "a.json", text: async () => "{}" }],
    );
    elsewhere.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(onStray).toHaveBeenCalledOnce();
    expect(onText).not.toHaveBeenCalled();
    stop();
  });

  it("leaves drags that carry no files, and drops on the data area, alone", async () => {
    const { area, elsewhere, onText, onStray, stop } = page();
    const text = dragEvent("dragover", ["text/plain"]);
    elsewhere.dispatchEvent(text);
    expect(text.defaultPrevented).toBe(false);
    area.dispatchEvent(
      dragEvent(
        "drop",
        ["Files"],
        [{ name: "a.json", text: async () => "{}" }],
      ),
    );
    await flush();
    expect(onText).toHaveBeenCalledOnce();
    expect(onStray).not.toHaveBeenCalled();
    stop();
  });

  it("stop() removes the page-wide guard", () => {
    const { elsewhere, stop } = page();
    stop();
    const over = dragEvent("dragover");
    elsewhere.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(false);
  });
});

describe("My Papers wiring", () => {
  // jsdom's import.meta.url isn't a file URL: tests run from the repo root
  const page = readFileSync("src/my-papers.md", "utf-8");
  it("guards the whole page against stray file drops", () => {
    expect(page).toMatch(/enableFileDrop\([^\n]*doc: document[^\n]*onStray/);
    expect(page).toContain("Drop the file on the My Papers data area");
  });
  it("versions the exported file from the values themselves", () => {
    expect(page).toMatch(/const exportText = \(\) => exportTransfer\(/);
  });
});
