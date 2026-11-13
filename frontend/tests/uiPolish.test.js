import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { LEGACY_THEME_STORAGE_KEY, THEME_STORAGE_KEY, readThemePreference, resolveTheme } from "../src/theme/themePreference.js";
import { ERROR_PAGES, errorPageKindFor } from "../src/utils/errorPages.js";
import { buildLegalPages } from "../src/legal/legalContent.js";
import { legalValue, missingLegalSettings } from "../src/legal/legalConfig.js";

const storage = (value) => ({ getItem: (key) => (key === THEME_STORAGE_KEY ? value : null) });

test("theme defaults to following the device and resolves explicit choices", () => {
  assert.equal(readThemePreference(storage(null)), "system");
  assert.equal(readThemePreference(storage("dark")), "dark");
  assert.equal(readThemePreference(storage("purple")), "system");
  assert.equal(readThemePreference({ getItem: () => { throw new Error("blocked"); } }), "system");
  const legacy = (value) => ({ getItem: (key) => (key === LEGACY_THEME_STORAGE_KEY ? value : null) });
  assert.equal(readThemePreference(legacy("light")), "system", "old automatic light default is not treated as a choice");
  assert.equal(readThemePreference(legacy("dark")), "dark");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
});

test("index.html applies the theme before first paint", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /name="theme-color"/);
  assert.match(html, /prefers-color-scheme: dark/);
  assert.ok(html.indexOf("ai-interview-coach-theme-preference") < html.indexOf("/src/main.jsx"));
});

test("errors map to explanatory pages", () => {
  assert.equal(errorPageKindFor({ response: { status: 404 } }), "404");
  assert.equal(errorPageKindFor({ response: { status: 403 } }), "403");
  assert.equal(errorPageKindFor({ response: { status: 503 } }), "503");
  assert.equal(errorPageKindFor({ response: { status: 500 } }), "500");
  assert.equal(errorPageKindFor({ request: {} }), "503");
  assert.equal(errorPageKindFor({ response: { status: 422 } }), null);
  assert.equal(errorPageKindFor(null), null);
  for (const page of Object.values(ERROR_PAGES)) {
    assert.ok(page.title && page.explanation && page.steps.length, "every page explains the error and next steps");
  }
});

test("legal pages are complete and never invent operator details", () => {
  const empty = { serviceName: "AI Interview Coach", operatorName: "", contactEmail: "", postalAddress: "", governingLaw: "", minimumAge: "", institution: "" };
  const pages = buildLegalPages(empty);
  for (const key of ["privacy", "terms", "cookies", "refund"]) {
    assert.ok(pages[key].sections.length >= 1, key);
  }
  assert.ok(pages.privacy.sections.length >= 10);
  assert.ok(pages.terms.sections.length >= 10);
  const privacyText = JSON.stringify(pages.privacy);
  assert.match(privacyText, /not configured: VITE_LEGAL_CONTACT_EMAIL/);
  assert.match(privacyText, /HOD/);
  assert.match(privacyText, /never uploaded/);
  assert.deepEqual(missingLegalSettings(empty), [
    "VITE_LEGAL_OPERATOR_NAME", "VITE_LEGAL_CONTACT_EMAIL", "VITE_LEGAL_POSTAL_ADDRESS", "VITE_LEGAL_GOVERNING_LAW", "VITE_LEGAL_MINIMUM_AGE",
  ]);
  const configured = { ...empty, operatorName: "Example Org", contactEmail: "privacy@example.org", postalAddress: "1 Street", governingLaw: "Example Land", minimumAge: "16" };
  assert.equal(legalValue("contactEmail", configured), "privacy@example.org");
  assert.match(JSON.stringify(buildLegalPages(configured).terms), /at least 16 years old/);
  assert.deepEqual(missingLegalSettings(configured), []);
});
