/**
 * Normalise the API base URL. Accepts "https://api.example.com",
 * "https://api.example.com/" or "https://api.example.com/api" and returns the
 * "/api" base the client expects. Relative values ("/api") are kept as they are.
 */
export function resolveApiBaseUrl(configured, { dev = false } = {}) {
  const value = String(configured ?? "").trim().replace(/\/+$/, "");
  if (!value) return dev ? "http://localhost:8000/api" : "/api";
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.pathname === "/" || url.pathname === "") return `${url.origin}/api`;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return value;
  }
}

export const env = {
  apiBaseUrl: resolveApiBaseUrl(import.meta.env?.VITE_API_BASE_URL, { dev: Boolean(import.meta.env?.DEV) }),
};
