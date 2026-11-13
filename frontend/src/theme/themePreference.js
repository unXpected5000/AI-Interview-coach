// Theme preference helpers shared by the React provider and tests. The same
// logic is inlined in index.html so the first paint already uses the right theme.

export const THEME_STORAGE_KEY = "ai-interview-coach-theme-preference";
// Earlier versions saved "light" on every first visit, so only an explicit
// "dark" from the old key reflects a real choice worth carrying over.
export const LEGACY_THEME_STORAGE_KEY = "ai-interview-coach-theme";
export const THEME_PREFERENCES = ["system", "light", "dark"];
export const THEME_COLORS = { light: "#f6f3ee", dark: "#171b20" };

export function readThemePreference(storage = globalThis.localStorage) {
  try {
    const saved = storage?.getItem(THEME_STORAGE_KEY);
    if (THEME_PREFERENCES.includes(saved)) return saved;
    if (storage?.getItem(LEGACY_THEME_STORAGE_KEY) === "dark") return "dark";
  } catch {
    // Storage can be unavailable in private or restricted browsing modes.
  }
  return "system";
}

export function resolveTheme(preference, prefersDark) {
  if (preference === "light" || preference === "dark") return preference;
  return prefersDark ? "dark" : "light";
}

export function applyTheme(theme, root = globalThis.document?.documentElement) {
  if (!root) return;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  const meta = globalThis.document?.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLORS[theme] ?? THEME_COLORS.light);
}
