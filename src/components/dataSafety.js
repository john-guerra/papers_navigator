import { html } from "htl";
import { storageHealth } from "../lib/storageHealth.js";

/** "Export JSON" as a button (`onExport`, My Papers) or a link (`exportHref`, other pages). */
function exportControl({ onExport, exportHref, cls, label }) {
  if (onExport) {
    const b = html`<button type="button" class=${`btn-text ${cls}`}>
      ${label}
    </button>`;
    b.onclick = onExport;
    return b;
  }
  return html`<a class=${cls} href=${exportHref}>${label}</a>`;
}

/**
 * The banner when this browser stops saving (Stage E): hidden until `storageHealth` reports a
 * failure (also one that happened before it was made), then "This browser isn't saving your
 * changes…" with Export (My Papers: `onExport`) or "Open My Papers to export" (`exportHref`) and
 * ✕. `el.dispose()` stops listening.
 */
export function storageBanner({
  onExport,
  exportHref = "my-papers.html#export",
} = {}) {
  const dismiss = html`<button
    type="button"
    class="btn-text storage-dismiss"
    aria-label="Dismiss"
  >
    ✕
  </button>`;
  const el = html`<div class="storage-banner" role="alert" hidden>
    <p>
      <strong>This browser isn't saving your changes</strong> (storage full or
      blocked, e.g. private browsing). Export JSON now to keep them.
      ${exportControl({
        onExport,
        exportHref: onExport ? null : exportHref,
        cls: "storage-export",
        label: onExport ? "Export JSON" : "Open My Papers to export",
      })}
    </p>
    ${dismiss}
  </div>`;
  let dismissed = false;
  dismiss.onclick = () => {
    dismissed = true;
    el.hidden = true;
  };
  const show = () => {
    if (!dismissed) el.hidden = false;
  };
  if (storageHealth.failed) show();
  storageHealth.addEventListener("failure", show);
  el.dispose = () => storageHealth.removeEventListener("failure", show);
  return el;
}

/**
 * "Saved only in this browser." (Stage E): the standing note on My Papers and Live, with Export
 * JSON; with `nudge`, a dismissible "Back up your notes and ratings: Export JSON" above it (on
 * iPhone, `ios`, also Safari's 7-day rule). `onDismiss` records the dismissal.
 */
export function dataNote({
  onExport,
  exportHref,
  nudge = false,
  ios = false,
  onDismiss,
} = {}) {
  const exportLink = (cls) =>
    exportControl({ onExport, exportHref, cls, label: "Export JSON" });
  const el = html`<div class="data-note muted">
    <p>
      <strong>Saved only in this browser.</strong> Your list, notes, ratings and
      attended papers aren't sent anywhere. ${exportLink("data-export")} to keep
      a copy or move them to another device.
    </p>
  </div>`;
  if (nudge) {
    const dismiss = html`<button
      type="button"
      class="btn-text backup-dismiss"
      aria-label="Not now"
    >
      ✕
    </button>`;
    const line = html`<p class="backup-nudge">
      Back up your notes and ratings: ${exportLink("backup-export")}
      ${ios ? html`<span class="backup-ios">On iPhone, Safari may delete this site's data after 7 days without a visit. Add it to your Home Screen, then use Send to my other device here and Import the file there: the Home Screen app keeps its own copy.</span>` : ""}
      ${dismiss}
    </p>`;
    dismiss.onclick = () => {
      line.remove();
      onDismiss?.();
    };
    el.prepend(line);
  }
  return el;
}
