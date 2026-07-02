import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicUser } from '@wiwonanant/shared';
import { api, ApiError } from '../lib/api';

interface AuthValue {
  user: PublicUser | null;
  isLoading: boolean;
  isDev: boolean;
  refresh: () => void;
  setUser: (u: PublicUser | null) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const res = await api.get<{ user: PublicUser }>('/auth/me');
        return res.user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });

  const user = data ?? null;
  const value: AuthValue = {
    user,
    isLoading,
    isDev: user?.role === 'dev',
    refresh: () => qc.invalidateQueries({ queryKey: ['me'] }),
    setUser: (u) => qc.setQueryData(['me'], u),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
