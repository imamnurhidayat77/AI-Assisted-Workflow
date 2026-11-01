'use client';

import { io, type Socket } from 'socket.io-client';

const URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let socket: Socket | null = null;
let sessionId: string | null = null;

export function getSessionId(): string {
  if (sessionId) return sessionId;
  try {
    const saved = window.localStorage.getItem('street-smart-session');
    if (saved) { sessionId = saved; return saved; }
  } catch { /* ignore */ }
  sessionId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `s-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
  try { window.localStorage.setItem('street-smart-session', sessionId); } catch { /* ignore */ }
  return sessionId;
}

/** Lazy singleton socket. Resolves null when the realtime endpoint is unreachable. */
export function getSocket(timeoutMs = 2500): Promise<Socket | null> {
  if (socket?.connected) return Promise.resolve(socket);
  return new Promise((resolve) => {
    try {
      const s = io(URL, { transports: ['websocket', 'polling'], timeout: timeoutMs });
      const timer = setTimeout(() => { s.close(); resolve(null); }, timeoutMs);
      s.on('connect', () => { clearTimeout(timer); socket = s; resolve(s); });
      s.on('connect_error', () => { clearTimeout(timer); s.close(); resolve(null); });
    } catch {
      resolve(null);
    }
  });
}
