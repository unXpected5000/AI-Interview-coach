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
    payload.speech_metadata = {
      duration_seconds: meta.speech_analysis?.duration_seconds,
      result_timestamps: meta.speech_analysis?.result_timestamps,
    };
  }
  
  if (meta.webcam_metrics !== undefined) {
    payload.webcam_metrics = meta.webcam_metrics;
  }
  if (meta.answer_status !== undefined) payload.answer_status = meta.answer_status;

  const response = await apiClient.post(`/interviews/${interviewId}/answer`, payload);
  return response.data;
}

export async function completeInterview(interviewId) {
  const response = await apiClient.post(`/interviews/${interviewId}/complete`);
  return response.data;
}

export async function exportInterview(interviewId, format) {
  const response = await apiClient.get(`/interviews/${interviewId}/export/${format}`, {
    responseType: "blob",
  });
  return response;
}
