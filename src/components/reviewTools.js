import { html } from "htl";

const RATINGS = [
  ["5", "5★"],
  ["4", "4★"],
  ["3", "3★"],
  ["2", "2★"],
  ["1", "1★"],
  ["no", "👎"],
  ["none", "Not rated"],
];
const GROUPS = [
  ["none", "None"],
  ["day", "Day"],
  ["reason", "Reason"],
  ["topic", "Topic"],
  ["rating", "Rating"],
  ["attended", "Attended"],
  ["type", "Type"],
  ["session", "Session"],
  ["award", "Award"],
];

/**
 * The review tools of "All my papers" (Stage E), a reactive widget: `.value` is `{include,
 * ratingKeys: Set, groupBy}` and it emits `input` on each change.
 * - Include (hidden when there's nothing to include): "Rated or attended, not in My Papers (n)",
 *   "👎 Not for me (n)".
 * - Rating chips 5★ … 1★, 👎, Not rated (toggle buttons; none = all); 👎 turns Include 👎 on.
 * - Group by.
 * On phones (`phone`) they fold into "Filter & group (n active)".
 */
export function reviewTools({
  include = {},
  counts = { ratedOrAttended: 0, disliked: 0 },
  ratingKeys = new Set(),
  groupBy = "none",
  phone = false,
} = {}) {
  const state = {
    include: {
      ratedOrAttended: Boolean(include.ratedOrAttended),
      disliked: Boolean(include.disliked),
    },
    ratingKeys: new Set(ratingKeys),
    groupBy,
  };
  const box = (key, label) => {
    const input = html`<input type="checkbox" />`;
    input.checked = state.include[key];
    input.dataset.key = key;
    return html`<label>${input} ${label}</label>`;
  };
  const includeEl = html`<fieldset class="review-include">
    <legend>Include</legend>
    ${box("ratedOrAttended", `Rated or attended, not in My Papers (${counts.ratedOrAttended})`)}
    ${box("disliked", `👎 Not for me (${counts.disliked})`)}
  </fieldset>`;
  includeEl.hidden = !counts.ratedOrAttended && !counts.disliked;
  const chips = RATINGS.map(([key, label]) => {
    const b = html`<button type="button" aria-pressed="false">
      ${label}
    </button>`;
    b.dataset.key = key;
    return b;
  });
  const ratingEl = html`<div
    class="review-rating"
    role="group"
    aria-label="Rating"
  >
    ${chips}
  </div>`;
  const select = html`<select>
    ${GROUPS.map(([v, l]) => html`<option value=${v}>${l}</option>`)}
  </select>`;
  select.value = groupBy;
  const groupEl = html`<label class="review-group">Group by ${select}</label>`;
  const summary = html`<summary></summary>`;
  const inner = html`<div class="review-tools-inner">
    ${includeEl}${ratingEl}${groupEl}
  </div>`;
  const el = phone
    ? html`<div class="review-tools">
        <details class="review-fold">${summary}${inner}</details>
      </div>`
    : html`<div class="review-tools">${inner}</div>`;

  const show = () => {
    for (const b of chips)
      b.setAttribute(
        "aria-pressed",
        String(state.ratingKeys.has(b.dataset.key)),
      );
    for (const i of includeEl.querySelectorAll("input"))
      i.checked = state.include[i.dataset.key];
    const active =
      Number(state.ratingKeys.size > 0) +
      Number(state.groupBy !== "none") +
      Number(state.include.ratedOrAttended) +
      Number(state.include.disliked);
    summary.textContent = `Filter & group${active ? ` (${active} active)` : ""}`;
  };
  const emit = () => {
    show();
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  includeEl.addEventListener("change", (event) => {
    const key = event.target.dataset.key;
    if (key) state.include = { ...state.include, [key]: event.target.checked };
    emit();
  });
  for (const b of chips)
    b.onclick = () => {
      const key = b.dataset.key;
      const keys = new Set(state.ratingKeys);
      if (keys.has(key)) keys.delete(key);
      else keys.add(key);
      state.ratingKeys = keys;
      // 👎 papers aren't in My Papers: picking 👎 includes them, so the filter isn't empty
      if (key === "no" && keys.has("no"))
        state.include = { ...state.include, disliked: true };
      emit();
    };
  select.onchange = () => {
    state.groupBy = select.value;
    emit();
  };
  Object.defineProperty(el, "value", {
    get: () => ({
      include: { ...state.include },
      ratingKeys: new Set(state.ratingKeys),
      groupBy: state.groupBy,
    }),
  });
  show();
  return el;
}
