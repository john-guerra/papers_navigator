import { html } from "htl";

const papersWord = (n) => `${n} ${n === 1 ? "paper" : "papers"}`;
const LEVEL_NAMES = { strong: "Strong", good: "Good", weak: "Weak" };

/**
 * "Watch this research topic" for the current Explore search (#24, US11.1–11.2): a button that
 * opens an inline preview where you pick Strong or Good and see what is in and out before saving.
 * `previews` = `{strong, good}` from `topicPreview` (whole program, all types); `current` = the
 * watched rule for this query, if any. `onSave(level)` saves it.
 * "My research" (#27): `research = {name}` asks for a short name (the rule's value and reason;
 * `query` is then the label of what is ranked) and calls `onSave(level, name)`.
 */
export function topicWatch(
  {
    query,
    previews,
    current = null,
    level,
    open: startOpen = false,
    research = null,
  },
  { onSave, onToggle },
) {
  let chosen = current?.level ?? (level in LEVEL_NAMES ? level : "good");
  const open = html`<button
    type="button"
    class="btn-secondary topic-watch-open"
    aria-expanded="false"
  ></button>`;
  // Short labels (it sits beside "My research"); the full meaning stays in the title
  open.textContent = current
    ? research
      ? `🔍 Watching “${current.value}” (${LEVEL_NAMES[current.level]})`
      : `🔍 Watching topic (${LEVEL_NAMES[current.level]})`
    : "🔍 Watch topic";
  open.title = current
    ? research
      ? `Watching as research topic “${current.value}”`
      : "Watching this search as a research topic"
    : research
      ? "Watch as a research topic"
      : "Watch this search as a research topic";
  const nameInput = html`<input
    type="text"
    class="topic-watch-name"
    maxlength="80"
    aria-label="Research topic name"
  />`;
  nameInput.value = current?.value ?? research?.name ?? "";
  const savedName = () => nameInput.value.trim() || research?.name;

  // Only the levels with a preview (Explore passes Strong, Good and Weak)
  const levelButtons = Object.entries(LEVEL_NAMES)
    .filter(([key]) => previews[key])
    .map(([key, name]) => {
      const button = html`<button type="button" data-level=${key}>
        ${name} <span class="count">${previews[key].count}</span>
      </button>`;
      button.onclick = () => {
        chosen = key;
        sync();
      };
      return button;
    });
  const summary = html`<p class="topic-watch-summary" aria-live="polite"></p>`;
  const borderline = html`<div class="topic-watch-borderline"></div>`;
  const save = html`<button
    type="button"
    class="btn-primary topic-watch-save"
  ></button>`;
  const cancel = html`<button type="button" class="btn-text">Cancel</button>`;
  const panel = html`<div class="topic-watch-panel" hidden>
    ${
      research
        ? html`<p class="topic-watch-title">
            Watch <strong>${query}</strong> as a research topic named
            ${nameInput}: matching papers join My Papers with that name as their
            reason, now and after program updates. Your abstracts are saved with
            it on this device only (not in share links).
          </p>`
        : html`<p class="topic-watch-title">
            Watch <strong>“${query}”</strong> as a research topic: matching
            papers join My Papers as “🔍 ${query}”, now and after program
            updates.
          </p>`
    }
    <div
      class="relevance-control"
      role="group"
      aria-label="Research topic level"
    >
      ${levelButtons}
    </div>
    ${summary}${borderline}
    <div class="topic-watch-actions">${save}${cancel}</div>
  </div>`;

  const titles = (papers) =>
    papers.map(
      (p, i) =>
        html`${i ? "; " : ""}<span class="topic-watch-paper">${p.title}</span>`,
    );
  const sync = () => {
    const p = previews[chosen];
    levelButtons.forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.level === chosen)),
    );
    const change =
      current && (p.added || p.dropped)
        ? ` Compared with what you watch now: +${p.added}, −${p.dropped}.`
        : "";
    summary.textContent =
      `${papersWord(p.count)} in the program at ${LEVEL_NAMES[chosen]} (all types): ` +
      `${p.joining} would join My Papers, ${p.already} already there. ` +
      `${papersWord(p.out)} stay out.${change}`;
    borderline.replaceChildren(
      ...(p.lastIn.length
        ? [
            html`<p class="muted">
              <span class="label">Just in:</span> ${titles(p.lastIn)}
            </p>`,
          ]
        : []),
      ...(p.firstOut.length
        ? [
            html`<p class="muted">
              <span class="label">Just out:</span> ${titles(p.firstOut)}
            </p>`,
          ]
        : []),
    );
    const same = current && current.level === chosen && !p.added && !p.dropped;
    save.disabled = Boolean(same);
    save.textContent = current
      ? same
        ? "Already watching at this level"
        : `Watch at ${LEVEL_NAMES[chosen]} instead`
      : `Watch · ${papersWord(p.count)}`;
  };
  const setOpen = (on) => {
    panel.hidden = !on;
    open.setAttribute("aria-expanded", String(on));
    if (on) sync();
    onToggle?.(on);
  };
  open.onclick = () => setOpen(panel.hidden);
  cancel.onclick = () => {
    setOpen(false);
    open.focus();
  };
  save.onclick = () => {
    if (research) onSave(chosen, savedName());
    else onSave(chosen);
    setOpen(false);
  };
  sync();
  // Survives page re-renders (the page keeps `open` through onToggle)
  panel.hidden = !startOpen;
  open.setAttribute("aria-expanded", String(startOpen));
  return html`<div class="topic-watch">${open}${panel}</div>`;
}
