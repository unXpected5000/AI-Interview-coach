import { apiClient } from "./client.js";

export async function startInterview(resumeId) {
  const response = await apiClient.post("/interviews/start", { resume_id: resumeId });
  return response.data;
}

export async function listInterviews() {
  const response = await apiClient.get("/interviews");
  return response.data;
}

export async function getInterview(interviewId) {
  const response = await apiClient.get(`/interviews/${interviewId}`);
  return response.data;
}

export async function submitAnswer(interviewId, questionId, answerText, meta = {}) {
  const payload = {
    question_id: questionId,
    answer_text: answerText,
  };

  if (meta.transcript !== undefined) {
    payload.transcript = meta.transcript;
  }

  if (meta.speech_analysis !== undefined) {
    payload.speech_analysis = meta.speech_analysis;
  }
  
  if (meta.webcam_metrics !== undefined) {
    payload.webcam_metrics = meta.webcam_metrics;
  }

  const response = await apiClient.post(`/interviews/${interviewId}/answer`, payload);
  return response.data;
}

export async function completeInterview(interviewId) {
  const response = await apiClient.post(`/interviews/${interviewId}/complete`);
  return response.data;
}
