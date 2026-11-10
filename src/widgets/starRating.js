import { html } from "htl";

/**
 * 1–5 star rating (#203), a reactive widget (reactivewidgets.org): `.value` is 0–5 (0 = not
 * rated) and it emits `input` when you tap. A tap on the current star clears it. Each star is a
 * real button ("Rate 4 of 5", aria-pressed); setting `.value` from outside doesn't emit.
 */
export function starRating(value = 0, { label = "Rating" } = {}) {
  const buttons = [1, 2, 3, 4, 5].map(
    (n) =>
      html`<button type="button" class="star" aria-label=${`Rate ${n} of 5`}>
        ★
      </button>`,
  );
  const el = html`<span class="star-rating" role="group" aria-label=${label}
    >${buttons}</span
  >`;
  let current = 0;
  const show = (n) => {
    current = n;
    buttons.forEach((b, i) => {
      b.setAttribute("aria-pressed", String(i < n));
      b.classList.toggle("on", i < n);
    });
  };
  buttons.forEach((b, i) => {
    b.onclick = () => {
      show(current === i + 1 ? 0 : i + 1);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
  });
  Object.defineProperty(el, "value", {
    get: () => current,
    set: (n) => {
      show(Number.isInteger(n) && n >= 0 && n <= 5 ? n : 0);
    },
  });
  show(value);
  return el;
}
