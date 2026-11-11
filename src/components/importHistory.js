import { html } from "htl";
import {
  lastImport,
  listSnapshots,
  restoreSnapshot,
  undoLastImport,
} from "../lib/sync/apply.js";
import { formatWhen } from "../lib/time.js";

/**
 * My Papers' data area after a transfer: "Undo this import" while the last import's undo record
 * is under 7 days old (also after a reload), and, folded, the saved copies of the data from
 * before each import, each restored after an inline confirm (no native dialog) and undoable.
 * `ctx` is apply.js's; `refresh({showUndo})` redraws it (the page hides its Undo while the
 * import panel offers its own). Hidden when there is nothing to show.
 */

const STORAGE_FULL = "this browser's storage is full. Nothing was changed.";

function button(label, onclick, kind = "btn-text") {
  const b = html`<button type="button" class=${kind}>${label}</button>`;
  b.onclick = onclick;
  return b;
}

function fromText(from) {
  if (from === "backup") return "Last restore of a backup";
  if (from === "snapshot") return "Last restore of saved data";
  return `Last import${from ? ` from ${from}` : ""}`;
}

export function renderImportHistory(ctx, { tz, onChange = () => {} } = {}) {
  const status = html`<p
    class="import-history-status"
    role="status"
    aria-live="polite"
  ></p>`;
  const undoLine = html`<p class="import-history-undo"></p>`;
  const result = html`<span></span>`;
  const copies = html`<details class="import-history-copies"></details>`;
  const root = html`<div class="import-history">
    ${undoLine}${copies}${status}${result}
  </div>`;
  const when = (iso) => formatWhen(iso, tz);
  let showUndo = true;

  const say = (msg, ...actions) => {
    status.textContent = msg;
    result.replaceChildren(...actions);
  };

  function undoImport() {
    let r;
    try {
      r = undoLastImport(ctx);
    } catch (err) {
      say(
        err?.code === "storage"
          ? `Couldn't undo: ${STORAGE_FULL}`
          : `Couldn't undo: ${err?.message ?? err}`,
      );
      return;
    }
    const n = r.reverted.length;
    say(
      `Undid the import: ${n} ${n === 1 ? "change" : "changes"} put back.` +
        (r.skipped.length
          ? ` ${r.skipped.length} edited since ${r.skipped.length === 1 ? "was" : "were"} left as ${r.skipped.length === 1 ? "it is" : "they are"}.`
          : ""),
    );
    onChange();
    refresh();
  }

  function restore(i, at) {
    let undo;
    try {
      undo = restoreSnapshot(ctx, i);
    } catch (err) {
      say(
        err?.code === "storage"
          ? `Couldn't restore: ${STORAGE_FULL}`
          : `Couldn't restore: ${err?.message ?? err}`,
      );
      return;
    }
    onChange();
    refresh();
    const undoButton = button("Undo", () => {
      let r;
      try {
        r = undo();
      } catch (err) {
        say(
          err?.code === "storage"
            ? `Couldn't undo: ${STORAGE_FULL}`
            : `Couldn't undo: ${err?.message ?? err}`,
        );
        return;
      }
      say(
        `Put your data back${r.skipped.length ? `, except ${r.skipped.length} edited since` : ""}.`,
      );
      onChange();
      refresh();
    });
    say(
      `Restored your data from before the import of ${when(at)}.`,
      undoButton,
    );
    undoButton.focus?.();
  }

  function snapshotItem(snap, i) {
    const li = html`<li></li>`;
    const ask = () => {
      const cancel = button("Cancel", () => (draw(), open.focus?.()));
      li.replaceChildren(
        html`<span role="group" aria-label="Restore saved data"
          ><span
            >Replace your current data with this? It's saved first, so you can
            undo.</span
          >
          ${button("Restore", () => restore(i, snap.at), "btn-primary")}
          ${cancel}</span
        >`,
      );
      cancel.focus?.();
    };
    const open = button(
      `Restore data from before the import of ${when(snap.at)}`,
      ask,
    );
    const draw = () => li.replaceChildren(open);
    draw();
    return li;
  }

  function refresh(options = {}) {
    showUndo = options.showUndo ?? true;
    const last = showUndo ? lastImport(ctx) : null;
    undoLine.replaceChildren(
      ...(last
        ? [
            `${fromText(last.from)}, ${when(last.at)}. `,
            button("Undo this import", undoImport),
          ]
        : []),
    );
    undoLine.hidden = !last;
    const snaps = listSnapshots(ctx);
    const wasOpen = copies.open;
    copies.replaceChildren(
      html`<summary>Saved copies of your data (${snaps.length})</summary>`,
      html`<p class="muted">
        Saved before each import, the last 3. Restoring one replaces your
        current data.
      </p>`,
      html`<ul>
        ${snaps.map(snapshotItem)}
      </ul>`,
    );
    copies.open = wasOpen;
    copies.hidden = !snaps.length;
    root.hidden = !last && !snaps.length && !status.textContent;
  }

  root.refresh = refresh;
  refresh();
  return root;
}
