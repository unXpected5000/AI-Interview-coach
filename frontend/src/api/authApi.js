import { apiClient } from "./client.js";

export async function registerUser(payload) {
  const response = await apiClient.post("/auth/register", payload);
  return response.data;
}

export async function loginUser(payload) {
  const response = await apiClient.post("/auth/login", payload);
  return response.data;
}

export async function loginWithGoogle(credential) {
  const response = await apiClient.post("/auth/google", { credential });
  return response.data;
}

export async function getCurrentUser() {
  const response = await apiClient.get("/auth/me");
  return response.data;
}
