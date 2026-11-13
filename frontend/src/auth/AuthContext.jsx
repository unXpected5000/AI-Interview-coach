import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import {
  getCurrentUser,
  loginUser,
  loginWithGoogle as authenticateGoogleUser,
  registerUser,
  resendVerification as requestVerificationCode,
  verifyEmail as submitVerificationCode,
} from "../api/authApi.js";
import { updateMyProfile } from "../api/userApi.js";
import { SESSION_EXPIRED_EVENT, shouldClearStoredSession } from "./session.js";
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "../utils/tokenStorage.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  // A non-401 failure while restoring a saved session (server asleep, offline).
  // The token is kept so a retry can restore the session.
  const [sessionError, setSessionError] = useState(null);
  // Held in memory only (never storage or URL state) so the verification page
  // can submit the password the user just typed without asking twice.
  const pendingCredentialsRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      const token = getAccessToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const currentUser = await getCurrentUser();
        if (isMounted) {
          setUser(currentUser);
        }
      } catch (requestError) {
        if (!isMounted) return;
        if (shouldClearStoredSession(requestError)) clearAccessToken();
        else setSessionError(requestError);
        setUser(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadUser();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    // The API client clears the token on an expired-session 401; drop the user
    // so protected routes redirect to sign-in instead of showing stale screens.
    const handleExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
  }, []);

  const startSession = useCallback((data) => {
    setAccessToken(data.access_token);
    setUser(data.user);
    pendingCredentialsRef.current = null;
    return data.user;
  }, []);

  const login = useCallback(async (payload) => {
    try {
      return startSession(await loginUser(payload));
    } catch (requestError) {
      pendingCredentialsRef.current = { email: payload.email, password: payload.password };
      throw requestError;
    }
  }, [startSession]);

  const loginWithGoogle = useCallback(async (credential) => startSession(await authenticateGoogleUser(credential)), [startSession]);

  const register = useCallback(async (payload) => {
    const data = await registerUser(payload);
    pendingCredentialsRef.current = { email: payload.email, password: payload.password };
    return data;
  }, []);

  const verifyEmail = useCallback(async ({ email, code, password }) => {
    const remembered = pendingCredentialsRef.current;
    const usablePassword = password || (remembered?.email?.toLowerCase() === email.toLowerCase() ? remembered.password : "");
    return startSession(await submitVerificationCode({ email, code, password: usablePassword }));
  }, [startSession]);

  const resendVerification = useCallback((email) => requestVerificationCode(email), []);

  const hasRememberedPassword = useCallback(
    (email) => Boolean(email && pendingCredentialsRef.current?.email?.toLowerCase() === email.toLowerCase()),
    [],
  );

  const updateProfile = useCallback(async (payload) => {
    const updated = await updateMyProfile(payload);
    setUser(updated);
    return updated;
  }, []);

  const logout = useCallback(() => {
    clearAccessToken();
    pendingCredentialsRef.current = null;
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      sessionError,
      login,
      loginWithGoogle,
      register,
      verifyEmail,
      resendVerification,
      hasRememberedPassword,
      updateProfile,
      logout,
    }),
    [user, isLoading, sessionError, login, loginWithGoogle, register, verifyEmail, resendVerification, hasRememberedPassword, updateProfile, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
