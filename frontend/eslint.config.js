import js from "@eslint/js";

const browserGlobals = Object.fromEntries(
  [
    "alert", "Blob", "console", "document", "FormData", "localStorage", "MediaStream",
    "navigator", "performance", "requestAnimationFrame", "setTimeout", "clearTimeout",
    "Request", "Response", "fetch", "URL", "window",
    "Worker", "self", "Event", "CustomEvent", "sessionStorage", "AbortController", "cancelAnimationFrame",
  ].map((name) => [name, "readonly"]),
);

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...browserGlobals, setInterval: "readonly", clearInterval: "readonly" },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // ESLint core does not see JSX tag references as usage, so capitalized
      // (component) names are exempt; everything else must be used.
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z]", argsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
