import type { NextFunction, Request, Response } from 'express';

// In-memory sliding window. Cukup untuk 1 proses demo; catat sebagai shortcut:
// multi-instance butuh store eksternal (Redis) agar hitungan konsisten.
const hits = new Map<string, number[]>();

function prune(key: string, windowMs: number, now: number): number[] {
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.set(key, arr);
  return arr;
}

// Bersihkan entri basi tiap menit agar Map tidak tumbuh tanpa batas.
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of hits) {
    if (!arr.length || now - arr[arr.length - 1] > 10 * 60_000) hits.delete(k);
  }
}, 60_000).unref();

export interface RateOpts {
  windowMs: number;
  max: number;
  /** Prefix agar bucket antar-endpoint terpisah. */
  name: string;
}

/** Batasi request per user terautentikasi (fallback IP). 429 + Retry-After bila lewat. */
export function rateLimit({ windowMs, max, name }: RateOpts) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const who =
      (res as unknown as { locals?: { user?: { id?: string } } }).locals?.user?.id ??
      req.ip ??
      'anon';
    const key = `${name}:${who}`;
    const now = Date.now();
    const arr = prune(key, windowMs, now);
    if (arr.length >= max) {
      const retryAfter = Math.ceil((arr[0] + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(retryAfter, 1)));
      res.status(429).json({ error: `rate limited (${name}): max ${max} per ${Math.round(windowMs / 1000)}s` });
      return;
    }
    arr.push(now);
    next();
  };
}

const num = (v: string | undefined, dflt: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : dflt;
};

/** Batas default via env (jumlah per menit): RATE_LIMIT_CHAT / QUERY / LOGIN. */
export const chatLimiter = rateLimit({ name: 'chat', windowMs: 60_000, max: num(process.env.RATE_LIMIT_CHAT, 30) });
export const queryLimiter = rateLimit({ name: 'query', windowMs: 60_000, max: num(process.env.RATE_LIMIT_QUERY, 20) });
export const loginLimiter = rateLimit({ name: 'login', windowMs: 60_000, max: num(process.env.RATE_LIMIT_LOGIN, 10) });
