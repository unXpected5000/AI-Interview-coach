import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { getCurrentUser, loginUser, loginWithGoogle as authenticateGoogleUser, registerUser } from "../api/authApi.js";
import { shouldClearStoredSession } from "./session.js";
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "../utils/tokenStorage.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

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

  async function login(payload) {
    const data = await loginUser(payload);
    setAccessToken(data.access_token);
    setUser(data.user);
    return data.user;
  }

  async function loginWithGoogle(credential) {
    const data = await authenticateGoogleUser(credential);
    setAccessToken(data.access_token);
    setUser(data.user);
    return data.user;
  }

  async function register(payload) {
    const data = await registerUser(payload);
    setAccessToken(data.access_token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    clearAccessToken();
    setUser(null);
  }

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      login,
      loginWithGoogle,
      register,
      logout,
    }),
    [user, isLoading],
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
