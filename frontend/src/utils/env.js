const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export const env = {
  apiBaseUrl: configuredApiBaseUrl || (import.meta.env.DEV ? "http://localhost:8000/api" : "/api"),
};

