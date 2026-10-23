import { html } from "htl";
import QRCode from "qrcode";

/** Link + copy button + QR code for sending the followed list to another device. */
export function renderShareDialog(url) {
  const canvas = document.createElement("canvas");
  QRCode.toCanvas(canvas, url, { width: 240, margin: 1, errorCorrectionLevel: "L" });
  const copy = html`<button>📋 Copy link</button>`;
  copy.onclick = async () => {
    await navigator.clipboard.writeText(url);
    copy.textContent = "✅ Copied";
  };
  return html`<div class="share-dialog">
    <p>Scan with your phone, or copy the link. Reasons stay on this device; use Export for those.</p>
    ${canvas}
    <div><input readonly value=${url} style="width: 100%"> ${copy}</div>
  </div>`;
}

/** Banner offering to merge or replace the local list with papers from a share link. */
export function renderShareBanner({ ids, unknown }, { onMerge, onReplace, onIgnore }) {
  const button = (label, fn) => {
    const b = html`<button>${label}</button>`;
    b.onclick = fn;
    return b;
  };
  return html`<div class="share-banner">
    📱 <strong>${ids.length} ${ids.length === 1 ? "paper" : "papers"} shared with you</strong>${unknown.length ? ` (${unknown.length} not in the program)` : ""}.
    ${button("Merge", onMerge)} ${button("Replace", onReplace)} ${button("Ignore", onIgnore)}
  </div>`;
}
