/** Appearance: "auto" follows the OS; "light" / "dark" force a theme (stored per browser). */
export const THEME_KEY = "papersNavigator:theme";
const THEMES = ["auto", "light", "dark"];

export function getTheme(storage = globalThis.localStorage) {
  try {
    const value = storage?.getItem(THEME_KEY);
    return THEMES.includes(value) ? value : "auto";
  } catch {
    return "auto";
  }
}

/** Sets `data-theme` on <html> (CSS tokens read it); "auto" removes it so the OS decides. */
export function applyTheme(theme, root = document.documentElement) {
  if (theme === "light" || theme === "dark") root.dataset.theme = theme;
  else delete root.dataset.theme;
}

/** Applies, persists and announces (`themechange` on window) the chosen theme. */
export function setTheme(theme, storage = globalThis.localStorage) {
  const value = THEMES.includes(theme) ? theme : "auto";
  applyTheme(value);
  try {
    if (value === "auto") storage?.removeItem(THEME_KEY);
    else storage?.setItem(THEME_KEY, value);
  } catch {
    // Private mode etc.: the choice still applies for this page view
  }
  globalThis.dispatchEvent?.(new CustomEvent("themechange", { detail: value }));
}
