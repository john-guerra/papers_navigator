import { html } from "htl";
import { isIosSafariTab } from "../lib/storageHealth.js";

/**
 * "Send, copy or paste everything to the other device" (two-way transfer). The payload (the v3
 * file text) only ever goes into a file, the share sheet or the clipboard, never into a URL.
 * `onPaste(text, name)` is the page's import path; `onSent()` records the backup. `share`,
 * `clipboard`, `download` and `nav` are injectable for tests.
 */
export function renderSendToDevice({
  payload,
  fileName,
  title = "My Papers",
  share = globalThis.navigator,
  clipboard = globalThis.navigator?.clipboard,
  download,
  onPaste,
  onSent = () => {},
  nav = globalThis.navigator,
}) {
  const status = html`<div
    class="send-status"
    role="status"
    aria-live="polite"
  ></div>`;
  const say = (text) => (status.textContent = text);
  const makeFile = () =>
    new File([payload()], fileName, { type: "application/json" });

  const send = html`<button>Send to my other device</button>`;
  send.onclick = async () => {
    say("");
    const file = makeFile();
    try {
      if (share?.share && share.canShare?.({ files: [file] }))
        await share.share({ files: [file], title });
      else download(file);
      onSent();
    } catch (error) {
      if (error?.name === "AbortError") return;
      say("Couldn't send the file. Use Export instead.");
    }
  };

  const copy = html`<button>Copy for my other device</button>`;
  copy.onclick = async () => {
    say("");
    try {
      await clipboard.writeText(payload());
      say("Copied: paste it in My Papers on the other device");
      onSent();
    } catch {
      say("Your browser didn't allow copying here. Use Export instead.");
    }
  };

  const paste = html`<button>Paste from my other device</button>`;
  paste.onclick = async () => {
    say("");
    let text;
    try {
      text = await clipboard.readText();
    } catch {
      return say("Your browser didn't allow pasting here. Use Import instead.");
    }
    onPaste(text, "pasted text");
  };

  return html`<div class="send-to-device">
    <div class="my-papers-tools">${send} ${copy} ${paste}</div>
    ${isIosSafariTab(nav) ? html`<p class="send-hint">Using the Home Screen app? Import the file there.</p>` : ""}
    ${status}
  </div>`;
}

/**
 * Drop a .json file on `area` (laptop) to import it: `onText(text, name)`. Adds `.drop-target`
 * while a file is dragged over; anything that isn't a file is ignored.
 */
export function enableFileDrop(area, onText) {
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");
  const off = () => area.classList.remove("drop-target");
  area.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    area.classList.add("drop-target");
  });
  area.addEventListener("dragleave", (e) => {
    if (!area.contains(e.relatedTarget)) off();
  });
  area.addEventListener("drop", async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    off();
    const file = [...e.dataTransfer.files].find((f) => /\.json$/i.test(f.name));
    if (file) onText(await file.text(), file.name);
  });
}
