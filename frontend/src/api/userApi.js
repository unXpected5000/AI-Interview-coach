import { apiClient } from "./client.js";

export async function getProfileOptions() {
  const response = await apiClient.get("/meta/profile-options");
  return response.data;
}

export async function updateMyProfile(payload) {
  const response = await apiClient.patch("/users/me", payload);
  return response.data;
}

export async function listDepartmentStudents(params = {}) {
  const response = await apiClient.get("/department/students", { params });
  return response.data;
}

export async function getDepartmentStudent(studentId) {
  const response = await apiClient.get(`/department/students/${studentId}`);
  return response.data;
}

export async function updateDepartmentStudent(studentId, payload) {
  const response = await apiClient.patch(`/department/students/${studentId}`, payload);
  return response.data;
}

export async function listUsers(params = {}) {
  const response = await apiClient.get("/admin/users", { params });
  return response.data;
}

export async function getUserProgress(userId) {
  const response = await apiClient.get(`/admin/users/${userId}`);
  return response.data;
}

export async function updateUser(userId, payload) {
  const response = await apiClient.patch(`/admin/users/${userId}`, payload);
  return response.data;
}

export async function setUserRole(userId, role, department) {
  const response = await apiClient.put(`/admin/users/${userId}/role`, { role, department: department || null });
  return response.data;
}
