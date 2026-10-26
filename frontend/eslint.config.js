import js from "@eslint/js";

const browserGlobals = Object.fromEntries(
  [
    "alert", "Blob", "console", "document", "FormData", "localStorage", "MediaStream",
    "navigator", "performance", "requestAnimationFrame", "setTimeout", "clearTimeout",
    "Request", "Response", "fetch", "URL", "window",
    "Worker", "self",
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
      // ESLint core does not treat JSX tag references as variable usage.
      "no-unused-vars": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
