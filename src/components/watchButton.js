import { html } from "htl";
import { normalizeRule } from "../lib/rules.js";

/**
 * "Watch" / "Watching" toggle for a person or institution (DESIGN.md → Vocabulary: Watch =
 * a standing rule whose papers are always in My Papers). A text button as the facet strip's
 * row action; `variant: "secondary"` on a researcher profile (DESIGN.md → Researcher profile).
 */
export function watchButton(
  rule,
  { rules, onWatch, onUnwatch, variant = "text" },
) {
  const id = normalizeRule(rule)?.id;
  const button = html`<button
    class=${`watch-toggle ${variant === "secondary" ? "btn-secondary" : "btn-text"}`}
  ></button>`;
  const render = () => {
    const on = rules.has(id);
    button.setAttribute("aria-pressed", String(on));
    button.textContent = on ? "Watching" : "Watch";
    button.title = on
      ? `Stop watching ${rule.value}`
      : `Always keep papers by ${rule.value} in My Papers`;
  };
  button.onclick = (event) => {
    event.stopPropagation();
    if (rules.has(id)) onUnwatch(id);
    else onWatch(rule);
    render();
  };
  render();
  // Follow changes made elsewhere (another tab, a toast's Undo); stop once the button is gone
  let attached = false;
  const onRulesChange = () => {
    if (button.isConnected) {
      attached = true;
      render();
    } else if (attached) rules.removeEventListener("input", onRulesChange);
  };
  rules.addEventListener("input", onRulesChange);
  return button;
}
