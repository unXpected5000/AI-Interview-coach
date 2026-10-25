import { useTheme } from "../../theme/ThemeContext.jsx";

export default function ThemeToggle({ compact = false }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      aria-pressed={isDark}
      className={`inline-flex items-center gap-2 rounded-full border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 transition hover:border-teal-600 hover:text-teal-800 ${compact ? "" : "w-full justify-center"}`}
      onClick={toggleTheme}
      type="button"
    >
      <span aria-hidden="true" className="text-base leading-none">{isDark ? "☀" : "☾"}</span>
      <span>{isDark ? "Light theme" : "Dark theme"}</span>
    </button>
  );
}
