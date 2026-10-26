export function shouldClearStoredSession(error) {
  return error?.response?.status === 401;
}
