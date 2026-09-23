import { apiClient } from "./client.js";

export async function analyzeResume(payload) {
  const response = await apiClient.post("/resume-optimizer/analyze", payload);
  return response.data;
}
