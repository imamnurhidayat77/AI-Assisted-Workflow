import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import type { RoleId } from '@street-smart/shared';

export interface AuthUser {
  id: string;
  name: string;
  role: RoleId;
}

/** TTL key demo-login (hari). Env KEY_TTL_DAYS; default 7. Seed awal NULL = tanpa expiry. */
export function keyTtlDays(): number {
  const n = Number(process.env.KEY_TTL_DAYS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 7;
}

export function expiryDate(): Date {
  return new Date(Date.now() + keyTtlDays() * 24 * 60 * 60 * 1000);
}

let client: PrismaClient | null = null;

async function db(): Promise<PrismaClient | null> {
  if (client) return client;
  if (!process.env.DATABASE_URL) return null;
  try {
    const c = new PrismaClient();
    await c.$queryRaw`SELECT 1`;
    client = c;
    return c;
  } catch {
    return null;
  }
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

export function newApiKey(): string {
  return `sk_demo_${randomBytes(18).toString('base64url')}`;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Resolve user dari header X-API-Key. Null = anonim/invalid (bukan error). */
export async function authenticate(req: Request): Promise<AuthUser | null> {
  return authenticateKey(String(req.header('x-api-key') ?? ''));
}

/** Inti auth dipakai HTTP + Socket.IO (socket kirim key di payload). */
export async function authenticateKey(key: string): Promise<AuthUser | null> {
  if (!key) return null;
  const prisma = await db();
  if (!prisma) return null;
  try {
    // Cari via hash — bandingkan dalam memori agar timing-safe.
    // shortcut: tanpa index di hash, O(n) user; OK untuk skala internal, ganti
    // ke lookup langsung saat user banyak.
    const users = await prisma.appUser.findMany({ where: { active: true } });
    const want = hashApiKey(key);
    const hit = users.find((u) => safeEqual(u.apiKeyHash, want));
    if (!hit) return null;
    // Key kedaluwarsa → tolak seperti key invalid (jangan bocorkan alasan spesifik).
    if (hit.apiKeyExpiresAt && hit.apiKeyExpiresAt.getTime() <= Date.now()) return null;
    return { id: hit.id, name: hit.name, role: hit.role as RoleId };
  } catch {
    return null;
  }
}

/** Middleware: wajib user aktif. Menyimpan user di res.locals. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  authenticate(req)
    .then((user) => {
      if (!user) {
        res.status(401).json({ error: 'missing or invalid X-API-Key' });
        return;
      }
      res.locals.user = user as AuthUser;
      next();
    })
    .catch(() => res.status(500).json({ error: 'auth lookup failed' }));
}

/** Tulis audit chat — fire-and-forget, kegagalan tidak menggagalkan request.
 * Hanya preview 200 char, bukan isi penuh (hindari data sensitif di log). */
export async function auditChat(input: {
  user: AuthUser;
  assistantId: string;
  message: string;
  via: string;
  spaceId?: string;
}): Promise<void> {
  try {
    const prisma = await db();
    if (!prisma) return;
    await prisma.chatAudit.create({
      data: {
        userId: input.user.id,
        role: input.user.role,
        assistantId: input.assistantId,
        messagePreview: input.message.slice(0, 200),
        via: input.via,
        spaceId: input.spaceId,
      },
    });
  } catch (e) {
    console.warn('[audit] write failed:', (e as Error).message);
  }
}
