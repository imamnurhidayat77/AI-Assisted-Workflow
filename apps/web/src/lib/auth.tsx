'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, getStoredKey, onAuthError, setStoredKey } from '@/lib/api';
import { reauthSocket } from '@/lib/socket';
import { useToast } from '@/lib/store';
import type { RoleId } from '@street-smart/shared';

export interface SessionUser {
  id: string;
  name: string;
  role: RoleId;
  assistants: string[];
}

interface AuthCtx {
  user: SessionUser | null;
  users: { id: string; name: string; role: string }[];
  ready: boolean;
  login: (userId: string, password: string) => Promise<boolean>;
  logout: (silent?: boolean) => void;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  users: [],
  ready: false,
  login: async () => false,
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<AuthCtx['users']>([]);
  const [ready, setReady] = useState(false);
  const { toast } = useToast();
  const booted = useRef(false);

  const logout = useCallback((silent = false) => {
    setStoredKey('');
    setUser(null);
    reauthSocket();
    if (!silent) toast('Logged out — please sign in again');
  }, [toast]);

  const login = useCallback(async (userId: string, password: string) => {
    try {
      const res = await fetch(`${api.base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { key: string; user: SessionUser; assistants: string[] };
      setStoredKey(data.key);
      setUser({ ...data.user, assistants: data.assistants });
      reauthSocket();
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    onAuthError(() => {
      // Key kedaluwarsa/diputar di tempat lain → bersihkan sesi, paksa ke /login via Shell guard.
      setStoredKey('');
      setUser(null);
    });
    (async () => {
      const list = await api.get<{ id: string; name: string; role: string }[]>('/api/auth/users', []);
      setUsers(list);
      const stored = getStoredKey();
      if (stored) {
        try {
          const res = await fetch(`${api.base}/api/auth/me`, { headers: { 'X-API-Key': stored } });
          if (res.ok) {
            setUser(await res.json() as SessionUser);
            setReady(true);
            return;
          }
        } catch { /* abaikan — jatuh ke login page */ }
        setStoredKey('');
      }
      // Tidak ada auto-login lagi: user harus lewat /login dengan password dummy.
      setReady(true);
    })();
  }, []);

  return <Ctx.Provider value={{ user, users, ready, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
