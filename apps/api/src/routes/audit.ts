import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, type AuthUser } from '../services/auth.js';

const r = Router();

/** GET /api/audit?take=50 — riwayat chat (preview saja). Khusus management. */
r.get('/', requireAuth, async (req, res) => {
  const user = (res as unknown as { locals: { user: AuthUser } }).locals.user;
  if (user.role !== 'management') {
    return res.status(403).json({ error: 'audit reads require management role' });
  }
  const take = Math.min(Math.max(Number(req.query.take) || 50, 1), 200);
  try {
    const prisma = new PrismaClient();
    const rows = await prisma.chatAudit.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, userId: true, role: true, assistantId: true, messagePreview: true, via: true, createdAt: true },
    });
    await prisma.$disconnect();
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'audit read failed' });
  }
});

export default r;
