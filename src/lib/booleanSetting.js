/**
 * An on/off view setting remembered per device: an EventTarget with `.value` (boolean) and
 * `.set(on)` that emits `input` (the reactive widget contract). An unreadable or non-boolean
 * stored value means `fallback`; a failing write still applies the choice for this page view.
 */
export function createBooleanSetting(
  key,
  fallback,
  storage = globalThis.localStorage,
) {
  const store = new EventTarget();
  let stored = null;
  try {
    const parsed = JSON.parse(storage?.getItem(key) ?? "null");
    if (typeof parsed === "boolean") stored = parsed;
  } catch {
    // Unreadable: the default
  }
  store.value = stored ?? fallback;
  store.set = (on) => {
    store.value = Boolean(on);
    try {
      storage?.setItem(key, JSON.stringify(store.value));
    } catch {
      // Private mode etc.: the choice still applies for this page view
    }
    store.dispatchEvent(new Event("input"));
  };
  return store;
}
