import { html } from "htl";
import { formatTime } from "../lib/time.js";
import { worthMoving } from "../lib/live.js";
import { awardMark, typePill } from "../widgets/paperMarks.js";
import { titleLink } from "./liveBreak.js";

let uid = 0;

/** "in 8 min · 10:48 · 📍 Room 1" (or "just started · 📍 Room 1"), as one line of text. */
const whenWhere = (row, tz) =>
  `${row.state === "just started" ? "just started" : `in ${row.minutes} min · ${formatTime(row.paper.start, tz)}`} · 📍 ${row.session.room ?? "Room TBA"}`;

/**
 * "Soon" (#208): a floating button with a badge (talks worth moving for in other rooms) that
 * opens "Worth moving for" over the session view (a bottom sheet on phones, a popover on
 * desktop; CSS): the next two talks in each room that are in My Papers (`mine`: id → entry) or
 * awarded, each with when, where, why and "Go there →" (`onSwitch(session)`); then "On now", a
 * line per other room. ✕, Esc and the dim close it; focus goes in on open and back to the button
 * on close. `el.update(at, mine)` refreshes it in place (the clock ticks), keeping it open; it
 * never rebuilds the session view around it.
 */
export function soonWidget({
  slot,
  session,
  at,
  mine,
  tz,
  onSwitch,
  onOpen,
  detailsHref,
}) {
  const id = `soon-panel-${++uid}`;
  const badge = html`<span class="soon-badge"></span>`;
  const button = html`<button
    type="button"
    class="soon-button"
    aria-expanded="false"
    aria-controls=${id}
  >
    Soon ${badge}
  </button>`;
  const close = html`<button
    type="button"
    class="btn-text soon-close"
    aria-label="Close"
  >
    ✕
  </button>`;
  const heading = html`<h2 class="soon-title" tabindex="-1">
    Worth moving for
  </h2>`;
  const body = html`<div class="soon-body"></div>`;
  const panel = html`<div
    class="soon-panel"
    id=${id}
    role="dialog"
    aria-label="Worth moving for"
    hidden
  >
    <div class="soon-head">${heading}${close}</div>
    ${body}
  </div>`;
  const dim = html`<div class="soon-dim" hidden></div>`;
  const el = html`<div class="soon-widget">${button}${dim}${panel}</div>`;

  const go = (target) => {
    const b = html`<button type="button" class="soon-go">Go there →</button>`;
    b.onclick = () => {
      hide();
      onSwitch(target);
    };
    return b;
  };
  const chips = (list) =>
    list.length
      ? html`<span class="soon-chips"
          >${list.map((c) => html`<span class="soon-chip">${c}</span>`)}</span
        >`
      : "";
  const draw = (time, papersOf) => {
    const {
      rows,
      onNow,
      badge: n,
    } = worthMoving(slot, session, time, papersOf);
    badge.textContent = n ? String(n) : "";
    badge.hidden = !n;
    if (!n) badge.remove();
    else if (!badge.isConnected) button.append(badge);
    body.replaceChildren(
      rows.length
        ? html`<ol class="soon-rows">
            ${rows.map(
              (row) =>
                html`<li class="soon-row" data-paper-id=${row.paper.id}>
                  <span class="soon-when"
                    >${whenWhere(row, tz)}${row.here ? html` <span class="muted">(this room)</span>` : ""}</span
                  >
                  <span class="paper-head"
                    >${typePill(row.paper)}${awardMark(row.paper)}${titleLink(row.paper, { detailsHref, onOpen })}</span
                  >
                  ${chips(row.chips)}
                  ${row.here ? html`<span class="muted soon-here">this room</span>` : go(row.session)}
                </li>`,
            )}
          </ol>`
        : html`<p class="muted">
            Nothing worth moving for in the next two talks.
          </p>`,
      onNow.length ? html`<h3 class="soon-subtitle">On now</h3>` : "",
      ...onNow.map(
        (line) =>
          html`<details class="soon-now">
            <summary>
              📍 ${line.session.room ?? "Room TBA"} ·
              ${line.talk ? line.talk.title : html`<span class="muted">No timed talks</span>`}
              ${chips(line.chips)}
            </summary>
            <div class="soon-now-body">
              <span class="muted">${line.session.sessionName}</span>
              <ol class="soon-talks">
                ${line.session.items.map(
                  (p) =>
                    html`<li>
                      ${p.start ? html`<span class="muted">${formatTime(p.start, tz)}</span> ` : ""}${typePill(p)}${titleLink(p, { detailsHref, onOpen })}
                    </li>`,
                )}
              </ol>
              ${go(line.session)}
            </div>
          </details>`,
      ),
    );
  };

  const onKey = (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      event.preventDefault();
      hide();
    }
  };
  const show = () => {
    panel.hidden = false;
    dim.hidden = false;
    button.setAttribute("aria-expanded", "true");
    heading.focus();
    document.addEventListener("keydown", onKey);
  };
  const hide = () => {
    panel.hidden = true;
    dim.hidden = true;
    button.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", onKey);
    button.focus();
  };
  button.onclick = () => (panel.hidden ? show() : hide());
  close.onclick = hide;
  dim.onclick = hide;

  let current = { at, mine };
  draw(at, mine);
  el.update = (time = current.at, papersOf = current.mine) => {
    current = { at: time, mine: papersOf };
    draw(time, papersOf);
  };
  el.dispose = () => document.removeEventListener("keydown", onKey);
  return el;
}
