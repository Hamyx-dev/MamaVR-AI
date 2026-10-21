import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Linking } from 'react-native';

import * as authService from '@/services/auth';
import { User } from '@/types';

interface AuthContextValue {
  user: User | null;
  initializing: boolean;
  passwordRecovery: boolean;
  login: (email: string, password: string) => Promise<authService.LoginResult>;
  logout: () => Promise<void>;
  refreshUser: () => void;
  completePasswordRecovery: (password: string) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  initializing: true,
  passwordRecovery: false,
  login: async () => ({ ok: false, error: 'Auth not ready' }),
  logout: async () => undefined,
  refreshUser: () => undefined,
  completePasswordRecovery: async () => 'Auth not ready',
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const recoveryDetected = useRef(false);

  useEffect(() => {
    const handleUrl = (url: string) => {
      if (authService.acceptPasswordRecoveryUrl(url)) {
        recoveryDetected.current = true;
        setPasswordRecovery(true);
        setUser(null);
      }
    };
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    void (async () => {
      try {
        const url = await Linking.getInitialURL();
        if (url) handleUrl(url);
        if (!recoveryDetected.current) {
          setUser(await authService.restoreSession());
        }
      } catch (error) {
        console.error('Unable to initialize authentication.', error);
      } finally {
        setInitializing(false);
      }
    })();
    return () => subscription.remove();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authService.login(email, password);
    if (result.ok) setUser(result.user);
    return result;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout(user);
    } finally {
      setUser(null);
    }
  }, [user]);

  const refreshUser = useCallback(() => {
    if (user) setUser(authService.getUserById(user.id));
  }, [user]);

  const completePasswordRecovery = useCallback(async (password: string) => {
    const error = await authService.completePasswordRecovery(password);
    if (!error) setPasswordRecovery(false);
    return error;
  }, []);

  const value = useMemo(
    () => ({ user, initializing, passwordRecovery, login, logout, refreshUser, completePasswordRecovery }),
    [user, initializing, passwordRecovery, login, logout, refreshUser, completePasswordRecovery]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
