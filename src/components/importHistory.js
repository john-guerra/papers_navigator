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

const isRestore = (from) => from === "backup" || from === "snapshot";
/** "before the import from iPhone" from a snapshot's label "Before the import from iPhone" */
const lowerFirst = (s) =>
  s ? s[0].toLowerCase() + s.slice(1) : "before an import";

function fromText(from) {
  if (from === "backup") return "Last restore of a backup";
  if (from === "snapshot") return "Last restore of saved data";
  return `Last import${from ? ` from ${from}` : ""}`;
}

export function renderImportHistory(
  ctx,
  { tz, papers = [], onChange = () => {} } = {},
) {
  const titles = new Map(papers.map((p) => [p.id, p.title]));
  const nameOf = (key) => {
    const id = key.slice(key.indexOf("/") + 1);
    return titles.get(id) ?? id;
  };
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
    const what = isRestore(lastImport(ctx)?.from) ? "restore" : "import";
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
      `Undid the ${what}: ${n} ${n === 1 ? "change" : "changes"} put back.` +
        (r.skipped.length
          ? ` ${r.skipped.length} edited since ${r.skipped.length === 1 ? "was" : "were"} left as ${r.skipped.length === 1 ? "it is" : "they are"}.`
          : ""),
    );
    onChange();
    refresh();
  }

  // By its time, not its place: another tab may have saved a newer copy meanwhile
  function restore(snap) {
    const i = listSnapshots(ctx).findIndex((s) => s.at === snap.at);
    if (i < 0) {
      say("That copy of your data is no longer saved.");
      refresh();
      return;
    }
    let undo;
    let failed;
    try {
      ({ undo, failed } = restoreSnapshot(ctx, i));
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
    const lost = failed.length
      ? ` Some changes couldn't be saved because this browser's storage is full: ${failed.map(nameOf).join(", ")}. Those stay as they were here.`
      : "";
    say(
      `Restored your data from ${lowerFirst(snap.label)}, ${when(snap.at)}.${lost}`,
      undoButton,
    );
    undoButton.focus?.();
  }

  function snapshotItem(snap) {
    const li = html`<li></li>`;
    const ask = () => {
      const cancel = button("Cancel", () => (draw(), open.focus?.()));
      li.replaceChildren(
        html`<span role="group" aria-label="Restore saved data"
          ><span
            >Replace your current data with this? It's saved first, so you can
            undo.</span
          >
          ${button("Restore", () => restore(snap), "btn-primary")}
          ${cancel}</span
        >`,
      );
      cancel.focus?.();
    };
    const open = button(
      `Restore data from ${lowerFirst(snap.label)}, ${when(snap.at)}`,
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
            button(
              isRestore(last.from) ? "Undo this restore" : "Undo this import",
              undoImport,
            ),
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
