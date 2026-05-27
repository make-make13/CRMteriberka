import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, setAuthToken } from '../services/localApi';
import type { Manager, ManagerPermission } from '../types';

interface AuthContextValue {
  manager: Manager | null;
  isCheckingAuth: boolean;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  canManageTemplates: boolean;
  canManageEmail: boolean;
  canManageBackups: boolean;
  canManageManagers: boolean;
  canDeleteClients: boolean;
  canDeleteContracts: boolean;
}

const TOKEN_STORAGE_KEY = 'crm_auth_token';
const AuthContext = createContext<AuthContextValue | null>(null);

function hasPermission(manager: Manager | null, permission: ManagerPermission) {
  return Boolean(manager && (manager.role === 'admin' || manager.permissions.includes('settings:all') || manager.permissions.includes(permission)));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [manager, setManager] = useState<Manager | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      setIsCheckingAuth(false);
      return;
    }

    setAuthToken(token);
    authApi.me()
      .then(result => setManager(result.manager))
      .catch(() => {
        setAuthToken(null);
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setManager(null);
      })
      .finally(() => setIsCheckingAuth(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    manager,
    isCheckingAuth,
    async login(loginValue: string, password: string) {
      const result = await authApi.login(loginValue, password);
      setAuthToken(result.token);
      localStorage.setItem(TOKEN_STORAGE_KEY, result.token);
      setManager(result.manager);
    },
    async logout() {
      try {
        await authApi.logout();
      } finally {
        setAuthToken(null);
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setManager(null);
      }
    },
    isAdmin: manager?.role === 'admin',
    canManageTemplates: hasPermission(manager, 'templates:manage'),
    canManageEmail: hasPermission(manager, 'email:manage'),
    canManageBackups: hasPermission(manager, 'backups:manage'),
    canManageManagers: hasPermission(manager, 'managers:manage'),
    canDeleteClients: hasPermission(manager, 'clients:delete'),
    canDeleteContracts: hasPermission(manager, 'contracts:delete'),
  }), [isCheckingAuth, manager]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return value;
}
