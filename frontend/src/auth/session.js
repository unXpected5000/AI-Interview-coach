export const SESSION_EXPIRED_EVENT = "ai-interview-coach:session-expired";
export const SESSION_MESSAGE_KEY = "ai_interview_coach_session_message";
export const SESSION_EXPIRED_MESSAGE = "Your session expired or is no longer valid. Sign in again to continue.";

// Requests to these endpoints return 401 for wrong credentials, not for an
// expired session, so they must not trigger a sign-out.
const CREDENTIAL_PATHS = ["/auth/login", "/auth/register", "/auth/google", "/auth/verify-email", "/auth/resend-verification"];

export function shouldClearStoredSession(error) {
  return error?.response?.status === 401;
}

function sentBearerToken(config) {
  const headers = config?.headers ?? {};
  const value = typeof headers.get === "function" ? headers.get("Authorization") : headers.Authorization ?? headers.authorization;
  return typeof value === "string" && value.startsWith("Bearer ");
}

export function isExpiredSessionError(error) {
  if (error?.response?.status !== 401) return false;
  const url = String(error.config?.url ?? "");
  if (CREDENTIAL_PATHS.some((path) => url.endsWith(path))) return false;
  return sentBearerToken(error.config);
}

export function rememberSessionMessage(message, storage = globalThis.sessionStorage) {
  try {
    storage?.setItem(SESSION_MESSAGE_KEY, message);
  } catch {
    // Storage can be blocked; the redirect still happens.
  }
}

// Read without clearing: render functions may run twice (React StrictMode), so
// pages read with peek during render and clear in an effect.
export function peekSessionMessage(storage = globalThis.sessionStorage) {
  try {
    return storage?.getItem(SESSION_MESSAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearSessionMessage(storage = globalThis.sessionStorage) {
  try {
    storage?.removeItem(SESSION_MESSAGE_KEY);
  } catch {
    // Ignore blocked storage.
  }
}

export function consumeSessionMessage(storage = globalThis.sessionStorage) {
  try {
    const message = storage?.getItem(SESSION_MESSAGE_KEY) ?? "";
    storage?.removeItem(SESSION_MESSAGE_KEY);
    return message;
  } catch {
    return "";
  }
}

// Clears the stored token, leaves a message for the sign-in page, and tells the
// auth context to drop the signed-in user. Returns true when it handled the error.
export function handleUnauthorizedResponse(error, { clearToken, storage, dispatch } = {}) {
  if (!isExpiredSessionError(error)) return false;
  clearToken?.();
  rememberSessionMessage(SESSION_EXPIRED_MESSAGE, storage);
  dispatch?.(SESSION_EXPIRED_EVENT);
  return true;
}
