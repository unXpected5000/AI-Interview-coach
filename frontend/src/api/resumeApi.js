import { apiClient } from "./client.js";

export async function uploadResume(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post("/resumes/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
}

export async function listResumes() {
  const response = await apiClient.get("/resumes");
  return response.data;
}

export async function getResume(resumeId) {
  const response = await apiClient.get(`/resumes/${resumeId}`);
  return response.data;
}

