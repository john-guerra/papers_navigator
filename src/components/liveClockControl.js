import { html } from "htl";
import {
  dayKey,
  formatDay,
  formatTime,
  fromZonedInput,
  zonedInput,
} from "../lib/time.js";

/**
 * The Live page's time (#203): a date-and-time field in the conference timezone that sets the
 * clock by hand (`clock.setTo`); while it is set, "Set time: Wed Nov 11 10:40 · Back to now"
 * (`clock.reset`). Redraws itself when the clock changes.
 */
export function liveClockControl(clock, { tz }) {
  const el = html`<div class="live-clock"></div>`;
  const draw = () => {
    const { at, override } = clock.value;
    const input = html`<input
      type="datetime-local"
      class="live-clock-input"
      aria-label="Time to show the program at"
    />`;
    input.value = zonedInput(at, tz);
    input.onchange = () => {
      if (input.value) clock.setTo(fromZonedInput(input.value, tz));
    };
    let status;
    if (override) {
      const back = html`<button type="button" class="live-back-to-now">
        Back to now
      </button>`;
      back.onclick = () => clock.reset();
      status = html`<span class="live-clock-status"
        >Set time: ${formatDay(dayKey(at, tz))} ${formatTime(at, tz)} ·
        ${back}</span
      >`;
    } else status = html`<span class="live-clock-status muted">Now</span>`;
    el.replaceChildren(input, status);
  };
  draw();
  const onInput = () => {
    // Don't redraw under the field while it's being edited
    if (!el.contains(document.activeElement)) draw();
  };
  clock.addEventListener("input", onInput);
  el.dispose = () => clock.removeEventListener("input", onInput);
  return el;
}
