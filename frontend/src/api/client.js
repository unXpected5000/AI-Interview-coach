import axios from "axios";

import { handleUnauthorizedResponse } from "../auth/session.js";
import { clearAccessToken, getAccessToken } from "../utils/tokenStorage.js";
import { env } from "../utils/env.js";

export const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
    delete config.headers["content-type"];
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    handleUnauthorizedResponse(error, {
      clearToken: clearAccessToken,
      dispatch: (name) => window.dispatchEvent(new Event(name)),
    });
    return Promise.reject(error);
  },
);
