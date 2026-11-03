import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { allowedAssistants, type RoleId } from '@street-smart/shared';
import { expiryDate, hashApiKey, newApiKey, requireAuth, type AuthUser } from '../services/auth.js';
import { loginLimiter } from '../services/ratelimit.js';

// Password dummy untuk semua akun demo. Bisa dioverride via env DUMMY_PASSWORD.
// shortcut: demo-only — ganti SSO/OAuth + passwordHash per user sebelum production.
function dummyPassword(): string {
  return process.env.DUMMY_PASSWORD ?? 'sss12345';
}

function passwordOk(given: unknown): boolean {
  if (typeof given !== 'string' || !given) return false;
  const a = createHash('sha256').update(given, 'utf8').digest();
  const b = createHash('sha256').update(dummyPassword(), 'utf8').digest();
  return a.length === b.length && timingSafeEqual(a, b);
}

const r = Router();

// GET /api/auth/users — publik: id/nama/role untuk user switcher. Tanpa hash/key.
r.get('/users', async (_req, res) => {
  try {
    const prisma = new PrismaClient();
    const users = await prisma.appUser.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true },
      orderBy: { id: 'asc' },
    });
    await prisma.$disconnect();
    res.json(users);
  } catch {
    res.status(500).json({ error: 'user lookup failed' });
  }
});

// GET /api/auth/me — profil sendiri + assistant yang boleh dipakai.
r.get('/me', requireAuth, (_req, res) => {
  const user = (res as unknown as { locals: { user: AuthUser } }).locals.user;
  res.json({ ...user, assistants: allowedAssistants(user.role).map((a) => a.id) });
});

// POST /api/auth/rotate — rotasi key sendiri (dapatkan key baru + TTL baru).
r.post('/rotate', requireAuth, async (_req, res) => {
  const user = (res as unknown as { locals: { user: AuthUser } }).locals.user;
  try {
    const prisma = new PrismaClient();
    const key = newApiKey();
    await prisma.appUser.update({ where: { id: user.id }, data: { apiKeyHash: hashApiKey(key), apiKeyExpiresAt: expiryDate() } });
    await prisma.$disconnect();
    res.json({ key, expiresInDays: (Number(process.env.KEY_TTL_DAYS) || 7) });
  } catch {
    res.status(500).json({ error: 'rotate failed' });
  }
});

// POST /api/auth/login { userId | email, password } — login dummy per role.
// userId bisa berupa id (u-sales) atau nama tampilan; password default 'sss12345'
// (override via env DUMMY_PASSWORD). Mengembalikan API key seperti demo-login.
// Rate-limited via loginLimiter agar brute-force password dummy tidak murah.
r.post('/login', loginLimiter, async (req, res) => {
  const rawId = String(req.body?.userId ?? req.body?.email ?? req.body?.username ?? '').slice(0, 128).trim();
  if (!rawId) return res.status(400).json({ error: 'userId is required' });
  if (!passwordOk(req.body?.password)) return res.status(401).json({ error: 'invalid credentials' });
  try {
    const prisma = new PrismaClient();
    // Cari by id dulu, lalu fallback by nama (case-insensitive) agar form login fleksibel.
    let found = await prisma.appUser.findUnique({ where: { id: rawId } });
    if (!found) {
      const users = await prisma.appUser.findMany({ where: { active: true } });
      const lower = rawId.toLowerCase();
      found = users.find((u) => u.id.toLowerCase() === lower || u.name.toLowerCase() === lower) ?? null;
    }
    if (!found || !found.active) {
      await prisma.$disconnect();
      return res.status(401).json({ error: 'invalid credentials' });
    }
    // Rotasi key tiap login agar key lama tidak menumpuk + beri TTL.
    const key = newApiKey();
    await prisma.appUser.update({ where: { id: found.id }, data: { apiKeyHash: hashApiKey(key), apiKeyExpiresAt: expiryDate() } });
    await prisma.$disconnect();
    res.json({
      key,
      user: { id: found.id, name: found.name, role: found.role as RoleId },
      assistants: allowedAssistants(found.role as RoleId).map((a) => a.id),
    });
  } catch {
    res.status(500).json({ error: 'login failed' });
  }
});

// POST /api/auth/demo-login { userId } — KHUSUS demo lokal. Mengembalikan API key.
// Matikan di deployment mana pun: ALLOW_DEMO_LOGIN=false (default true demi kemudahan dev).
// shortcut: ganti dengan SSO/OAuth sebelum production.
r.post('/demo-login', loginLimiter, async (req, res) => {
  if ((process.env.ALLOW_DEMO_LOGIN ?? 'true').toLowerCase() !== 'true') {
    return res.status(403).json({ error: 'demo login disabled' });
  }
  const userId = String(req.body?.userId ?? '').slice(0, 64);
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  try {
    const prisma = new PrismaClient();
    const found = await prisma.appUser.findUnique({ where: { id: userId } });
    if (!found || !found.active) {
      await prisma.$disconnect();
      return res.status(404).json({ error: 'unknown user' });
    }
    // Rotasi key tiap demo-login agar key lama tidak menumpuk + beri TTL.
    const key = newApiKey();
    await prisma.appUser.update({ where: { id: userId }, data: { apiKeyHash: hashApiKey(key), apiKeyExpiresAt: expiryDate() } });
    await prisma.$disconnect();
    res.json({
      key,
      user: { id: found.id, name: found.name, role: found.role as RoleId },
      assistants: allowedAssistants(found.role as RoleId).map((a) => a.id),
    });
  } catch {
    res.status(500).json({ error: 'demo login failed' });
  }
});

export default r;
