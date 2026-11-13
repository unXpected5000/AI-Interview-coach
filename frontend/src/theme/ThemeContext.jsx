import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";

import { THEME_STORAGE_KEY, applyTheme, readThemePreference, resolveTheme } from "./themePreference.js";

const ThemeContext = createContext(null);

function systemPrefersDark() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches);
}

export function ThemeProvider({ children }) {
  // "system" follows the device setting and updates when it changes.
  const [preference, setPreference] = useState(() => readThemePreference());
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);
  const theme = resolveTheme(preference, prefersDark);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return undefined;
    const update = () => setPrefersDark(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Keep the theme usable for this visit if storage is unavailable.
    }
  }, [preference]);

  useEffect(() => {
    // Keep several open tabs in sync.
    const onStorage = (event) => {
      if (event.key === THEME_STORAGE_KEY) setPreference(readThemePreference());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo(() => ({
    theme,
    preference,
    setPreference,
    toggleTheme: () => setPreference(theme === "dark" ? "light" : "dark"),
  }), [theme, preference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
