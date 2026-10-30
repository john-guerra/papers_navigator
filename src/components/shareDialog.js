import { html } from "htl";
import QRCode from "qrcode";

/** Above this many papers a QR code gets too dense for phones to scan (~1 KB). */
export const QR_MAX_PAPERS = 100;

/** Link + copy button + QR code for sending the followed list to another device. */
export function renderShareDialog(url, { count = 0 } = {}) {
  const qr = html`<div class="share-qr"></div>`;
  if (count > QR_MAX_PAPERS) {
    qr.textContent = `You follow ${count} papers, too many papers for a QR code. Copy the link instead, or use Export JSON.`;
  } else {
    const canvas = document.createElement("canvas");
    qr.append(canvas);
    QRCode.toCanvas(canvas, url, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: "L",
    }).catch(() => {
      qr.textContent =
        "Could not draw a QR code for this list. Copy the link instead, or use Export JSON.";
    });
  }
  const copy = html`<button>📋 Copy link</button>`;
  copy.onclick = async () => {
    await navigator.clipboard.writeText(url);
    copy.textContent = "✅ Copied";
  };
  return html`<div class="share-dialog">
    <p>
      Scan with your phone, or copy the link. Reasons stay on this device; use
      Export for those.
    </p>
    ${qr}
    <div><input readonly value=${url} style="width: 100%" /> ${copy}</div>
  </div>`;
}

/** Banner offering to merge or replace the local list with papers from a share link. */
export function renderShareBanner(
  { ids, unknown, already = 0, current = 0 },
  { onMerge, onReplace, onIgnore },
) {
  const button = (label, fn) => {
    const b = html`<button>${label}</button>`;
    b.onclick = fn;
    return b;
  };
  const papers = (n) => `${n} ${n === 1 ? "paper" : "papers"}`;
  if (!ids.length) {
    // Never offer Replace here: it would wipe the list with nothing
    return html`<div class="share-banner">
      📱 This link shares ${papers(unknown.length)}, but none of them are in the
      current program. ${button("Dismiss", onIgnore)}
    </div>`;
  }
  const banner = html`<div class="share-banner"></div>`;
  const summary = () =>
    html`📱
      <strong>${papers(ids.length)} shared with you</strong
      >${unknown.length ? ` (${unknown.length} not in the program)` : ""}${already ? `; you already have ${already}` : ""}. `;
  const showChoices = () =>
    banner.replaceChildren(
      summary(),
      button("Merge", onMerge),
      " ",
      button("Replace", showConfirm),
      " ",
      button("Ignore", onIgnore),
    );
  // Inline confirm (DESIGN.md): say what will be lost before replacing
  const showConfirm = () => {
    const yes = button("Yes, replace", onReplace);
    banner.replaceChildren(
      html`📱 Replace your ${papers(current)} with these ${ids.length}? `,
      yes,
      " ",
      button("Cancel", showChoices),
    );
    yes.focus?.();
  };
  showChoices();
  return banner;
}
