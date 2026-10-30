import { html } from "htl";
import { ruleReason } from "../lib/rules.js";

const papersWord = (n) => `${n} ${n === 1 ? "paper" : "papers"}`;
const TYPE_LABELS = { author: "Friend", affiliation: "Institution" };
let datalistIds = 0;

/**
 * "Watching" section of My Papers (#7): the standing rules with the papers each keeps, a
 * Stop watching action that asks inline whether to keep the rule's papers, and a form to watch
 * a friend or an institution by name (autocompleted from the program). Research topics (#24)
 * also show their level; `summaryFor(ruleId)` (from `scheduleSummary`) says where a rule's
 * papers fall in the program and `noteFor(rule)` adds a quiet note (e.g. matches pending).
 */
export function renderWatching(
  {
    rules,
    countFor,
    removableFor = countFor,
    summaryFor = () => null,
    noteFor = () => null,
    names,
  },
  { onRemove, onAdd },
) {
  const list = html`<ul class="watching-list">
    ${rules.map((rule) =>
      ruleRow(rule, countFor(rule.id), removableFor(rule.id), onRemove, {
        summary: summaryFor(rule.id),
        note: noteFor(rule),
      }),
    )}
  </ul>`;
  return html`<section class="watching">
    <h2>Watching</h2>
    ${
      rules.length
        ? list
        : html`<p class="muted">
            Watch friends or institutions to always keep their papers in My
            Papers, even when the program changes. To watch a research topic,
            search for it in Explore.
          </p>`
    }
    ${addForm(names, onAdd)}
  </section>`;
}

const LEVEL_NAMES = { strong: "Strong", good: "Good" };

/** "Tue 3 · Wed 1 · 2 without a time · most in Charts (2)" (US11.2: where they fall). */
function scheduleText({ days, untimed, topSession }) {
  const parts = days.map((d) => `${d.label} ${d.count}`);
  if (untimed) parts.push(`${untimed} without a time`);
  if (topSession)
    parts.push(`most in ${topSession.name} (${topSession.count})`);
  return parts.join(" · ");
}

function ruleRow(rule, count, removable, onRemove, { summary, note }) {
  const level = LEVEL_NAMES[rule.level];
  const where = summary && count ? scheduleText(summary) : "";
  const row = html`<li class="watching-rule" data-rule=${rule.id}>
    <span class="watching-name">${ruleReason(rule)}</span>
    ${rule.type === "topic" && level ? html`<span class="watching-level">${level}</span>` : ""}
    <span class="watching-count">${papersWord(count)}</span>
    <span class="watching-actions"></span>
    ${where ? html`<span class="watching-schedule">${where}</span>` : ""}
    ${note ? html`<span class="watching-note">${note}</span>` : ""}
  </li>`;
  const actions = row.querySelector(".watching-actions");
  const showStop = () => {
    const stop = html`<button class="btn-text stop-watching">
      Stop watching
    </button>`;
    stop.onclick = showChoice;
    actions.replaceChildren(stop);
    return stop;
  };
  // Inline choice instead of a native confirm (DESIGN.md → Inline confirm)
  const showChoice = () => {
    const keep = html`<button class="btn-secondary keep-papers">
      Keep its ${papersWord(count)}
    </button>`;
    const remove = html`<button class="btn-secondary remove-papers">
      Remove its ${papersWord(removable)} too
    </button>`;
    const cancel = html`<button class="btn-text cancel">Cancel</button>`;
    keep.onclick = () => onRemove(rule.id, { keepPapers: true });
    remove.onclick = () => onRemove(rule.id, { keepPapers: false });
    cancel.onclick = () => showStop().focus();
    actions.replaceChildren(keep, remove, cancel);
    keep.focus?.();
  };
  showStop();
  return row;
}

function addForm(names, onAdd) {
  const listId = `watch-names-${++datalistIds}`;
  const type = html`<select aria-label="Watch a friend or an institution">
    ${Object.entries(TYPE_LABELS).map(([value, label]) => html`<option value=${value}>${label}</option>`)}
  </select>`;
  const input = html`<input
    list=${listId}
    placeholder="Name as in the program"
    aria-label="Name"
  />`;
  const datalist = html`<datalist id=${listId}></datalist>`;
  const fill = () =>
    datalist.replaceChildren(
      ...(names[type.value] ?? []).map(
        (name) => html`<option value=${name}></option>`,
      ),
    );
  type.onchange = fill;
  fill();
  const form = html`<form class="watching-add">
    ${type}${input}${datalist}<button class="btn-secondary" type="submit">
      Watch
    </button>
  </form>`;
  form.onsubmit = (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    onAdd({ type: type.value, value });
    input.value = "";
  };
  return form;
}
