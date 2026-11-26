'use client';

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { auth, User, AuthResponse } from '@/lib/auth';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthResponse>;
  register: (email: string, password: string, name?: string) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Sync state with AuthService
    setUser(auth.getUser());

    const unsubscribe = auth.subscribe((updatedUser) => {
      setUser(updatedUser);
      setIsLoading(false);
    });

    // Initial session restore on page load / mount
    void auth.fetchMe().finally(() => {
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    return auth.login(email, password);
  };

  const register = async (email: string, password: string, name?: string) => {
    return auth.register(email, password, name);
  };

  const logout = async () => {
    await auth.logout();
  };

  const refreshSession = async () => {
    return auth.refresh();
  };

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      login,
      register,
      logout,
      refreshSession,
    }),
    [user, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
