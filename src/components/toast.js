import { html } from "htl";

let current;

/**
 * One toast at a time, bottom-center, in a polite live region (DESIGN.md → Toast).
 * With `actionLabel` it carries an action (Undo) that runs once and dismisses the toast.
 */
export function showToast(
  message,
  { actionLabel, onAction, duration = 10_000 } = {},
) {
  let region = document.querySelector(".toast-region");
  if (!region) {
    region = html`<div class="toast-region" aria-live="polite"></div>`;
    document.body.append(region);
  }
  current?.dismiss();
  const toast = html`<div class="toast">
    <span>${message}</span>
  </div>`;
  const dismiss = () => {
    clearTimeout(timer);
    toast.remove();
    if (current?.toast === toast) current = undefined;
  };
  if (actionLabel) {
    const action = html`<button class="toast-action">${actionLabel}</button>`;
    action.onclick = () => {
      dismiss();
      onAction?.();
    };
    toast.append(action);
  }
  region.append(toast);
  const timer = setTimeout(dismiss, duration);
  current = { toast, dismiss };
  return dismiss;
}
