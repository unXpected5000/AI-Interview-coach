import { useTheme } from "../../theme/ThemeContext.jsx";

const OPTIONS = [
  { value: "light", label: "Light", icon: "☀" },
  { value: "dark", label: "Dark", icon: "☾" },
  { value: "system", label: "Auto", icon: "◐" },
];

/** Three-way theme switch: light, dark, or follow the device setting. */
export default function ThemeToggle({ compact = false }) {
  const { preference, setPreference } = useTheme();
  return (
    <div
      aria-label="Color theme"
      className={`inline-flex shrink-0 rounded-full border border-stone-300 bg-white p-0.5 text-xs font-bold ${compact ? "" : "w-full justify-between"}`}
      role="radiogroup"
    >
      {OPTIONS.map((option) => {
        const selected = preference === option.value;
        return (
          <button
            aria-checked={selected}
            className={`theme-option inline-flex min-h-8 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 transition ${compact ? "" : "flex-1"} ${selected ? "theme-option--selected bg-stone-950 text-white" : "text-stone-600"}`}
            key={option.value}
            onClick={() => setPreference(option.value)}
            role="radio"
            title={option.value === "system" ? "Follow device setting" : `${option.label} theme`}
            type="button"
          >
            <span aria-hidden="true">{option.icon}</span>
            <span className={compact ? "sr-only sm:not-sr-only" : ""}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
