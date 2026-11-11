import { html } from "htl";
import { deviceLabel } from "../lib/myPapersFile.js";
import { ruleReason } from "../lib/rules.js";
import { applyTransfer, restorePayload } from "../lib/sync/apply.js";
import { stableHash } from "../lib/sync/clock.js";
import { splitKey, toEntries } from "../lib/sync/entries.js";
import {
  mergeTransfer,
  newestForAll,
  resolveClash,
} from "../lib/sync/merge.js";
import { readState } from "../lib/sync/state.js";
import { formatWhen } from "../lib/time.js";

/**
 * Import of a v3 file from another device (two-way transfer): a summary of what the file
 * changes, the clashes the person decides, Apply, and "Undo this import". Nothing changes
 * until Apply (or "Skip these for now", or Restore for a backup made on this device).
 * Returns null for v2 and older files, which keep the page's Merge / Replace choices.
 *
 * `ctx` is apply.js's `{stores, meta, conferenceId, storage?, now?}`. `onChange()` runs after
 * every write (apply, a later answer, undo), `onDone()` when the person closes the panel.
 */

const NOTE_CLAMP = 140;
const STORAGE_FULL =
  "Couldn't import: this browser's storage is full. Nothing was changed.";
let ids = 0;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function button(label, onclick, kind = "btn-secondary") {
  const b = html`<button type="button" class=${kind}>${label}</button>`;
  b.onclick = onclick;
  return b;
}

/** "1 added, 2 changed, 1 removed" (only what is there). */
function countsText({ added, changed, removed }) {
  return [
    added && `${added} added`,
    changed && `${changed} changed`,
    removed && `${removed} removed`,
  ]
    .filter(Boolean)
    .join(", ");
}

function stars(n) {
  const k = Math.max(0, Math.min(5, Number(n) || 0));
  return html`<span role="img" aria-label=${`${k} of 5 stars`}
    >${"★".repeat(k)}${"☆".repeat(5 - k)}</span
  >`;
}

/** A note's text, clamped with "Show all". */
function noteText(text) {
  const full = html`<span class="clash-note">${text}</span>`;
  if (text.length <= NOTE_CLAMP) return full;
  const short = html`<span class="clash-note"
    >${text.slice(0, NOTE_CLAMP).trimEnd()}…</span
  >`;
  const more = button(
    "Show all",
    () => {
      short.replaceWith(full);
      more.remove();
    },
    "btn-text",
  );
  return html`<span>${short} ${more}</span>`;
}

function ruleText(rule) {
  const parts = [];
  if (rule?.level) parts.push(`${rule.level} matches`);
  if (rule?.research?.length)
    parts.push(plural(rule.research.length, "abstract", "abstracts"));
  return `watching${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

/** One side of a clash in plain words; `detail` adds what tells two similar values apart. */
function sideText(key, s, { tz, detail }) {
  const [store] = splitKey(key);
  const v = s.value;
  const when = (iso) => (iso && tz ? formatWhen(iso, tz) : iso || "");
  switch (store) {
    case "followed":
      if (s.deleted) return "removed from My Papers";
      return detail
        ? `in My Papers (${v?.reason || "added by hand"}, ${when(v?.addedOn)})`
        : "in My Papers";
    case "rating":
      return s.deleted ? "rating removed" : stars(v);
    case "note":
      return s.deleted ? "note removed" : noteText(String(v));
    case "disliked":
      return s.deleted ? "not marked 👎" : "👎 not for me";
    case "attended":
      if (s.deleted) return "not marked attended";
      if (v?.off) return "unmarked as attended";
      return detail ? `attended (${when(v?.at)})` : "attended";
    case "exception":
      return s.deleted
        ? "back in My Papers by its watch"
        : "removed from My Papers";
    case "rule":
      return s.deleted ? "watch stopped" : ruleText(v);
    default:
      return s.deleted ? "removed" : String(v);
  }
}

const plainText = (x) => (typeof x === "string" ? x : x.textContent);

export function renderTransferImport(
  parsed,
  {
    ctx,
    papers = [],
    sessions = [],
    fileName = "",
    deviceName = deviceLabel(),
    tz,
    onChange = () => {},
    onDone = () => {},
  } = {},
) {
  if (parsed?.version !== 3 || !parsed.sync) return null;

  const byId = new Map(papers.map((p) => [p.id, p]));
  const sessionTitle = (sid) =>
    sessions.find((s) => s.sessionId === sid)?.title ??
    papers.find((p) => p.sessionId === sid)?.sessionName;
  // Two devices of the same kind: "this Mac" / "other Mac"
  const theirs = parsed.deviceName || "other device";
  const same = theirs === deviceName;
  const other = same ? `other ${theirs}` : theirs;
  const mine = same ? `this ${deviceName}` : deviceName;
  // Sentence case for "this Mac" / "other Mac"; a device name ("iPhone") stays as it is
  const cap = (s) => (same ? s[0].toUpperCase() + s.slice(1) : s);

  const isPaperKey = (key) => {
    const [store, id] = splitKey(key);
    return store !== "rule" && !id.startsWith("session:");
  };
  function titleOf(clash) {
    const [store, id] = splitKey(clash.key);
    if (store === "rule") {
      const rule = clash.local.value ?? clash.incoming.value;
      return rule?.type ? ruleReason(rule) : id;
    }
    if (id.startsWith("session:"))
      return sessionTitle(id.slice("session:".length)) ?? id;
    return byId.get(id)?.title ?? id;
  }
  /** "1 paper needs a choice", "3 changes still need a choice" */
  const needChoice = (list, still = "") => {
    const n = list.length;
    const noun = list.every((c) => isPaperKey(c.key))
      ? plural(n, "paper", "papers")
      : plural(n, "change", "changes");
    return `${noun} ${still}${n === 1 ? "needs" : "need"} a choice`;
  };

  const storage = ctx.storage ?? globalThis.localStorage;
  const incoming = {
    entries: toEntries(parsed),
    sync: parsed.sync,
    device: parsed.device,
  };
  const merge = () =>
    mergeTransfer(
      {
        entries: toEntries(readState(ctx.conferenceId, storage)),
        meta: ctx.meta.read(),
      },
      incoming,
    );
  const label = `Before the import from ${theirs}`;

  const headingId = `transfer-import-${++ids}`;
  const body = html`<div class="transfer-body"></div>`;
  const status = html`<p
    class="transfer-status"
    role="status"
    aria-live="polite"
  ></p>`;
  const root = html`<section
    class="transfer-import"
    aria-labelledby=${headingId}
  >
    <h3 id=${headingId}>Import “${fileName}” from ${theirs}</h3>
    ${body}${status}
  </section>`;
  const say = (msg) => (status.textContent = msg);
  const show = (...nodes) => {
    body.replaceChildren(...nodes);
    body.querySelector("button")?.focus?.();
  };

  let merged;
  const choices = new Map(); // key → "local" | "incoming" | "both"
  let open = []; // clashes left for later ("Skip these for now")
  const undos = []; // this import's writes, in order
  let importId = null; // its undo record: answers given later join it

  /** applyTransfer, saying what went wrong; null when nothing was changed. */
  function write(resolutions) {
    let result;
    try {
      result = applyTransfer(ctx, resolutions, {
        from: theirs,
        label,
        continueImport: importId,
      });
    } catch (err) {
      say(
        err?.code === "storage"
          ? STORAGE_FULL
          : `Couldn't import: ${err?.message ?? err}. Nothing was changed.`,
      );
      return null;
    }
    // A later answer that joined the import's record: its undo now covers the whole import
    if (importId && result.undoId === importId)
      undos[undos.length - 1] = result.undo;
    else undos.push(result.undo);
    importId = result.undoId ?? importId;
    onChange();
    return result;
  }

  /** What didn't save, for the status line ("" when everything did). */
  function problems(result) {
    const out = [];
    if (result.failed.length) {
      const names = result.failed.map((key) =>
        titleOf({ key, local: {}, incoming: {} }),
      );
      out.push(
        ` Some changes couldn't be saved because this browser's storage is full: ${names.join(", ")}. Those stay as they were here.`,
      );
      if (result.rollbackFailed)
        out.push(
          " Their change history couldn't be put back either, so this device will count them as changed here.",
        );
    }
    if (result.skipped?.length)
      out.push(
        ` ${plural(result.skipped.length, "entry", "entries")} in the file couldn't be read and ${result.skipped.length === 1 ? "was" : "were"} left out.`,
      );
    return out.join("");
  }

  // --- A clash row -------------------------------------------------------------------------

  function clashRow(clash, onChoose) {
    const title = titleOf(clash);
    const plainIn = plainText(sideText(clash.key, clash.incoming, { tz }));
    const plainMine = plainText(sideText(clash.key, clash.local, { tz }));
    const detail = plainIn === plainMine;
    const options = [
      ["incoming", `Keep ${other}'s`],
      ["local", `Keep ${mine}'s`],
    ];
    const notes =
      splitKey(clash.key)[0] === "note" &&
      !clash.local.deleted &&
      !clash.incoming.deleted;
    if (notes) options.push(["both", "Keep both"]);
    const buttons = options.map(([choice, text]) => {
      const b = button(text, () => onChoose(clash, choice));
      b.dataset.choice = choice;
      b.dataset.key = clash.key;
      b.setAttribute("aria-pressed", String(choices.get(clash.key) === choice));
      return b;
    });
    return html`<li class="transfer-clash">
      <h4>${title}</h4>
      <p class="clash-sides">
        ${cap(other)}: ${sideText(clash.key, clash.incoming, { tz, detail })} ·
        ${cap(mine)}: ${sideText(clash.key, clash.local, { tz, detail })}
      </p>
      <div
        class="clash-choices"
        role="group"
        aria-label=${`Choose for ${title}`}
      >
        ${buttons}
      </div>
    </li>`;
  }

  const clashList = (list, onChoose) =>
    html`<ul class="transfer-clashes">
      ${list.map((c) => clashRow(c, onChoose))}
    </ul>`;

  // --- Before Apply ------------------------------------------------------------------------

  function review(note = "") {
    merged = merge();
    const { counts, clashes } = merged;
    const changes = countsText(counts);
    for (const key of [...choices.keys()])
      if (!clashes.some((c) => c.key === key)) choices.delete(key);
    say(note);
    if (!changes && !clashes.length) {
      show(
        html`<p>
          From ${theirs}: nothing new. Your data here already has everything in
          this file.
        </p>`,
        html`<div class="transfer-actions">
          ${button("Close", onDone, "btn-text")}
        </div>`,
      );
      return;
    }
    const apply = button("Apply", applyAll, "btn-primary");
    const answered = () => clashes.every((c) => choices.has(c.key));
    apply.disabled = !answered();
    // Choices only mark the buttons: nothing is written before Apply
    const mark = () => {
      for (const b of list.querySelectorAll("button[data-choice]"))
        b.setAttribute(
          "aria-pressed",
          String(choices.get(b.dataset.key) === b.dataset.choice),
        );
      apply.disabled = !answered();
    };
    const list = clashList(clashes, (clash, choice) => {
      choices.set(clash.key, choice);
      mark();
    });
    const newest = () => {
      for (const r of newestForAll(clashes, ctx.meta.device))
        choices.set(
          r.key,
          choiceOf(
            clashes.find((c) => c.key === r.key),
            r,
          ),
        );
      mark();
      apply.focus?.();
    };
    show(
      html`<p class="transfer-summary">
        From ${theirs}: ${changes || "no other changes"}.
      </p>`,
      ...(clashes.length
        ? [
            html`<h3 class="transfer-clash-heading">
              ${needChoice(clashes)}
            </h3>`,
            html`<p class="muted">
              Both devices changed these since your last transfer. Choose which
              to keep; nothing changes here until you apply.
            </p>`,
            list,
          ]
        : []),
      html`<div class="transfer-actions">
        ${apply}
        ${clashes.length > 1 ? button("Use the newest for all", newest) : ""}
        ${clashes.length ? button("Skip these for now", skip) : ""}
        ${button("Cancel", onDone, "btn-text")}
      </div>`,
    );
  }

  /** Which choice a `newestForAll` resolution of `c` is. */
  function choiceOf(c, r) {
    const hash = (x) => (x.deleted ? "" : stableHash(x.value));
    if (hash(r) === hash(c.local) && !!r.deleted === !!c.local.deleted)
      return "local";
    if (hash(r) === hash(c.incoming) && !!r.deleted === !!c.incoming.deleted)
      return "incoming";
    return "both";
  }

  /** The data here changed since the summary: show it again instead of applying it. */
  function stale() {
    const now = merge();
    const key = (m) =>
      stableHash({ apply: m.apply, clashes: m.clashes, counts: m.counts });
    if (key(now) === key(merged)) return false;
    review(
      "Your data here changed meanwhile, so this summary was updated. Check it and apply again.",
    );
    return true;
  }

  const baseResolutions = () =>
    Object.entries(merged.apply).map(([key, r]) => ({ key, ...r }));

  function applyAll() {
    if (stale()) return;
    const resolutions = [
      ...baseResolutions(),
      ...merged.clashes.map((c) =>
        resolveClash(c, choices.get(c.key), ctx.meta.device),
      ),
    ];
    const result = write(resolutions);
    if (!result) return;
    open = [];
    after(`Imported from ${theirs}${summaryTail()}.${problems(result)}`);
  }

  function skip() {
    if (stale()) return;
    const result = write(baseResolutions());
    if (!result) return;
    open = [...merged.clashes];
    after(
      `Imported from ${theirs}${summaryTail()}. ${cap(needChoice(open, "still "))}.${problems(result)}`,
    );
  }

  const summaryTail = () => {
    const c = countsText(merged.counts);
    return c ? `: ${c}` : "";
  };

  // --- After Apply -------------------------------------------------------------------------

  function after(message) {
    if (message !== undefined) say(message);
    const actions = html`<div class="transfer-actions">
      ${button("Undo this import", undoAll)}
      ${button("Done", onDone, "btn-text")}
    </div>`;
    if (!open.length) return show(actions);
    const newest = () => answer(open, "newest");
    show(
      html`<h3 class="transfer-clash-heading">${needChoice(open)}</h3>`,
      html`<p class="muted">
        They stay here until you press Done or leave this page. Until you
        choose, this device keeps its own.
      </p>`,
      clashList(open, (clash, choice) => answer([clash], choice)),
      html`<div class="transfer-actions">
        ${open.length > 1 ? button("Use the newest for all", newest) : ""}
        ${button("Dismiss", dismiss, "btn-text")}
      </div>`,
      actions,
    );
  }

  /** Answers open clashes later: each answer is its own write (and undo). */
  function answer(list, choice) {
    const now = merge().clashes;
    const current = [];
    const notes = [];
    for (const clash of list) {
      const fresh = now.find((c) => c.key === clash.key);
      if (!fresh) {
        open = open.filter((c) => c.key !== clash.key);
        notes.push(
          `${titleOf(clash)} changed since, so it no longer needs a choice.`,
        );
      } else if (stableHash(fresh.local) !== stableHash(clash.local)) {
        open = open.map((c) => (c.key === clash.key ? fresh : c));
        notes.push(`${titleOf(clash)} changed here since: check it again.`);
      } else current.push(fresh);
    }
    if (notes.length || !current.length) {
      say(notes.join(" "));
      return after();
    }
    const resolutions =
      choice === "newest"
        ? newestForAll(current, ctx.meta.device)
        : current.map((c) => resolveClash(c, choice, ctx.meta.device));
    const result = write(resolutions);
    if (!result) return;
    const done = new Set(current.map((c) => c.key));
    open = open.filter((c) => !done.has(c.key));
    const names = current.map(titleOf).join(", ");
    say(`Saved your choice for ${names}.${problems(result)}`);
    after();
  }

  function dismiss() {
    open = [];
    say("Kept this device's values for the rest.");
    after();
  }

  function undoAll() {
    let reverted = 0;
    let skipped = 0;
    try {
      while (undos.length) {
        const r = undos.at(-1)();
        undos.pop();
        reverted += r.reverted.length;
        skipped += r.skipped.length;
      }
    } catch (err) {
      say(
        err?.code === "storage"
          ? "Couldn't undo: this browser's storage is full. Nothing more was changed."
          : `Couldn't undo: ${err?.message ?? err}`,
      );
      onChange();
      return;
    }
    open = [];
    onChange();
    say(
      `Undid the import: ${plural(reverted, "change", "changes")} put back.` +
        (skipped
          ? ` ${plural(skipped, "change was", "changes were")} edited since, so ${skipped === 1 ? "it was" : "they were"} left as ${skipped === 1 ? "it is" : "they are"}.`
          : ""),
    );
    show(
      html`<div class="transfer-actions">
        ${button("Done", onDone, "btn-text")}
      </div>`,
    );
  }

  // --- A backup made on this device --------------------------------------------------------

  function backupChoice() {
    show(
      html`<p>
        This is a backup from this device.
        <strong>Restore this backup</strong> replaces your current data with it;
        <strong>Merge</strong> adds what it has that's newer than your data
        here.
      </p>`,
      html`<div class="transfer-actions">
        ${button("Restore this backup", confirmRestore)}
        ${button("Merge", () => review())}
        ${button("Cancel", onDone, "btn-text")}
      </div>`,
    );
  }

  function confirmRestore() {
    const cancel = button("Cancel", backupChoice, "btn-text");
    show(
      html`<div
        class="transfer-actions"
        role="group"
        aria-label="Restore this backup"
      >
        <span
          >Replace your current data with this backup? It's saved first, so you
          can undo.</span
        >
        ${button("Restore", restore, "btn-primary")} ${cancel}
      </div>`,
    );
  }

  function restore() {
    let restored;
    try {
      restored = restorePayload(ctx, parsed, {
        label: "Before restoring a backup",
      });
    } catch (err) {
      say(
        err?.code === "storage"
          ? "Couldn't restore: this browser's storage is full. Nothing was changed."
          : `Couldn't restore: ${err?.message ?? err}`,
      );
      return;
    }
    undos.push(restored.undo);
    onChange();
    after(`Restored the backup.${problems({ failed: restored.failed })}`);
  }

  if (parsed.device && parsed.device === ctx.meta.device) backupChoice();
  else review();
  return root;
}
