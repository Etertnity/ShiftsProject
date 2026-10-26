import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { authApi, UNAUTHORIZED_EVENT } from '../api';
import { LoginCredentials, User } from '../types';
import { clearAllDrafts } from '../hooks/useDraft';
import { tokenStorage } from '../utils/tokenStorage';

interface AuthContextValue {
  user: User | null;
  /** Идёт первичная проверка сохранённого токена */
  initializing: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    if (!tokenStorage.get()) {
      setInitializing(false);
      return;
    }
    authApi
      .me()
      .then(setUser)
      .catch(() => tokenStorage.clear())
      .finally(() => setInitializing(false));
  }, []);

  const userRef = useRef(user);
  userRef.current = user;

  // Любой 401 от API (истёк токен, удалили пользователя) — возвращаем на экран входа
  useEffect(() => {
    const onUnauthorized = () => {
      if (userRef.current) toast.error('Сессия истекла, войдите заново', { id: 'session-expired' });
      setUser(null);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const { access_token } = await authApi.login(credentials);
    tokenStorage.set(access_token);
    try {
      setUser(await authApi.me());
    } catch (error) {
      tokenStorage.clear();
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    tokenStorage.clear();
    clearAllDrafts();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, initializing, login, logout, setUser }), [user, initializing, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

/** Для страниц внутри приложения, где пользователь гарантированно авторизован. */
export const useCurrentUser = (): User => {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser used outside authenticated area');
  return user;
};
