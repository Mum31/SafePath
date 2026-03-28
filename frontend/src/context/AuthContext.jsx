import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

import {
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  refreshAccessSession,
  setAuthTokens,
} from '../services/api';
import AuthContext from './auth-context';

const normalizeAuthError = (error, fallbackMessage) => {
  if (error.response?.status === 404) {
    return new Error("API d'authentification introuvable. Redemarrez le backend SafePath.");
  }

  const details = error.response?.data?.details;
  const message =
    (Array.isArray(details) && details.length ? details.join(' ') : null) ||
    error.response?.data?.error ||
    error.message ||
    fallbackMessage;

  return new Error(message);
};

const authRequest = async (path, payload, fallbackMessage) => {
  try {
    const response = await axios.post(`/api${path}`, payload, {
      headers: { 'Content-Type': 'application/json' },
    });
    return response.data;
  } catch (error) {
    throw normalizeAuthError(error, fallbackMessage);
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const fetchCurrentUser = async () => {
    const response = await axios.get('/api/auth/me/');
    setUser(response.data.user || null);
    return response.data.user || null;
  };

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      const accessToken = getAccessToken();
      const refreshToken = getRefreshToken();

      if (!accessToken && !refreshToken) {
        if (!cancelled) {
          setAuthLoading(false);
        }
        return;
      }

      try {
        if (!accessToken && refreshToken) {
          await refreshAccessSession();
        }
        await fetchCurrentUser();
      } catch {
        try {
          await refreshAccessSession();
          await fetchCurrentUser();
        } catch {
          clearAuthTokens();
          if (!cancelled) {
            setUser(null);
          }
        }
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    };

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async ({ identifier, password }) => {
    const data = await authRequest('/auth/login/', { identifier, password }, 'Connexion impossible');
    setAuthTokens(data.tokens || {});
    setUser(data.user || null);
    return data.user || null;
  };

  const register = async ({ username, email, password, passwordConfirm, firstName, lastName }) => {
    const data = await authRequest(
      '/auth/register/',
      {
        username,
        email,
        password,
        password_confirm: passwordConfirm,
        first_name: firstName,
        last_name: lastName,
      },
      'Inscription impossible'
    );
    setAuthTokens(data.tokens || {});
    setUser(data.user || null);
    return data.user || null;
  };

  const logout = () => {
    clearAuthTokens();
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      authLoading,
      isAuthenticated: Boolean(user),
      login,
      register,
      logout,
      refreshUser: fetchCurrentUser,
    }),
    [authLoading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
