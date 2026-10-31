import { apiClient } from "./client.js";
export async function downloadAccountExport() { return apiClient.get("/account/export", { responseType: "blob" }); }
export async function deleteAccount() { return apiClient.delete("/account"); }
export async function recordConsent(type, action, preferences = {}) {
  const normalized = { essential: true, analytics: Boolean(preferences.analytics), marketing: Boolean(preferences.marketing) };
  return apiClient.put("/account/consent", { type, action, policy_version: "2026-10-v1", preferences: type === "cookie_preferences" ? normalized : {} });
}
export async function getConsentHistory() { return apiClient.get("/account/consent"); }
