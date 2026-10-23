import { checkbox } from "@observablehq/inputs";
import { html } from "htl";

/**
 * Checkbox list with a small bar per option showing its count ("scent").
 * Reactive widget: `.value` is the array of checked values; emits `input`.
 */
export function scentedCheckbox(
  counts,
  { label, value = [], barWidth = 50, barFill = "#cdcdcd", barBorder = "#bbb" } = {},
) {
  const byValue = new Map(counts.map((d) => [d.value, d.count]));
  const max = Math.max(1, ...counts.map((d) => d.count));
  return checkbox(
    counts.map((d) => d.value),
    {
      label,
      value,
      format: (v) => html`<span style="display:inline-flex; align-items:center; gap:4px">
        ${v}
        <span title="${byValue.get(v)} papers" style="display:inline-block; position:relative; width:${barWidth}px; height:1em; border:0.5px solid ${barBorder}">
          <span style="position:absolute; inset:0 auto 0 0; width:${(byValue.get(v) / max) * barWidth}px; background:${barFill}; font-size:0.75em; line-height:1.3em; padding-left:2px">${byValue.get(v)}</span>
        </span>
      </span>`,
    },
  );
}
