import { Router } from 'express';
import { PrismaClient, type QuotationStatus } from '@prisma/client';
import { requireAuth, type AuthUser } from '../services/auth.js';

const r = Router();
const QUOTATION_ROLES = ['sales', 'operations', 'management'];

function meOf(res: unknown): AuthUser {
  return (res as { locals: { user: AuthUser } }).locals.user;
}

function toRow(q: {
  id: string; number: string; title: string; partner: string; tenderId: string | null;
  amountCents: number; currency: string; status: string; validUntil: Date | null;
  createdBy: string | null; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: q.id,
    number: q.number,
    title: q.title,
    partner: q.partner,
    tenderId: q.tenderId ?? undefined,
    amountCents: q.amountCents,
    currency: q.currency,
    status: q.status,
    validUntil: q.validUntil ? q.validUntil.toISOString() : undefined,
    createdBy: q.createdBy ?? undefined,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  };
}

// GET /api/quotations — sales: milik sendiri; operations/management: semua.
r.get('/', requireAuth, async (_req, res) => {
  const me = meOf(res);
  if (!QUOTATION_ROLES.includes(me.role)) return res.status(403).json({ error: 'quotations require sales, operations or management role' });
  try {
    const prisma = new PrismaClient();
    const rows = await prisma.quotation.findMany({ orderBy: { createdAt: 'desc' } });
    await prisma.$disconnect().catch(() => {});
    const list = me.role === 'management' || me.role === 'operations' ? rows : rows.filter((q) => !q.createdBy || q.createdBy === me.id);
    res.json(list.map(toRow));
  } catch {
    res.status(503).json({ error: 'database unreachable' });
  }
});

// POST /api/quotations — sales/ops/mgmt. Nomor bisnis Q-TAHUN-XXXX otomatis bila tidak diisi.
r.post('/', requireAuth, async (req, res) => {
  const me = meOf(res);
  if (!QUOTATION_ROLES.includes(me.role)) return res.status(403).json({ error: 'quotations require sales, operations or management role' });
  const title = String(req.body?.title ?? '').trim().slice(0, 200);
  const partner = String(req.body?.partner ?? '').trim().slice(0, 200);
  const amountCents = Math.floor(Number(req.body?.amountCents));
  if (!title || !partner || !Number.isFinite(amountCents) || amountCents < 0) {
    return res.status(400).json({ error: 'title, partner and amountCents (>= 0) are required' });
  }
  const tenderId = typeof req.body?.tenderId === 'string' && req.body.tenderId ? req.body.tenderId.slice(0, 64) : null;
  const currency = typeof req.body?.currency === 'string' && req.body.currency ? req.body.currency.slice(0, 8) : 'NZD';
  try {
    const prisma = new PrismaClient();
    const year = new Date().getFullYear();
    const count = await prisma.quotation.count();
    const number = typeof req.body?.number === 'string' && req.body.number.trim()
      ? req.body.number.trim().slice(0, 32)
      : `Q-${year}-${String(count + 1).padStart(4, '0')}`;
    const row = await prisma.quotation.create({
      data: { number, title, partner, tenderId, amountCents, currency, createdBy: me.id },
    });
    await prisma.$disconnect().catch(() => {});
    res.status(201).json(toRow(row));
  } catch (e) {
    if (String((e as Error).message).includes('Unique constraint')) {
      return res.status(409).json({ error: 'quotation number already exists' });
    }
    res.status(500).json({ error: 'create failed' });
  }
});

// PATCH /api/quotations/:id — edit field dasar; hanya draft/rejected, pemilik/management.
r.patch('/:id', requireAuth, async (req, res) => {
  const me = meOf(res);
  if (!QUOTATION_ROLES.includes(me.role)) return res.status(403).json({ error: 'quotations require sales, operations or management role' });
  try {
    const prisma = new PrismaClient();
    const cur = await prisma.quotation.findUnique({ where: { id: req.params.id } });
    if (!cur) {
      await prisma.$disconnect().catch(() => {});
      return res.status(404).json({ error: 'not found' });
    }
    if (me.role !== 'management' && cur.createdBy !== me.id) {
      await prisma.$disconnect().catch(() => {});
      return res.status(404).json({ error: 'not found' });
    }
    if (cur.status !== 'draft' && cur.status !== 'rejected') {
      await prisma.$disconnect().catch(() => {});
      return res.status(409).json({ error: `cannot edit ${cur.status} quotation` });
    }
    // Kunci selama ada draft review berjalan — cegah data drift vs draft yang dinilai checker.
    const underReview = await prisma.draft.findFirst({ where: { sourceQuotationId: req.params.id, status: 'in_review' } });
    if (underReview) {
      await prisma.$disconnect().catch(() => {});
      return res.status(409).json({ error: 'quotation is under review — wait for the decision' });
    }
    const patch: { title?: string; partner?: string; amountCents?: number; tenderId?: string | null; validUntil?: Date | null; status?: QuotationStatus } = {};
    if (typeof req.body?.title === 'string' && req.body.title.trim()) patch.title = req.body.title.trim().slice(0, 200);
    if (typeof req.body?.partner === 'string' && req.body.partner.trim()) patch.partner = req.body.partner.trim().slice(0, 200);
    if (req.body?.amountCents !== undefined) {
      const n = Math.floor(Number(req.body.amountCents));
      if (!Number.isFinite(n) || n < 0) {
        await prisma.$disconnect().catch(() => {});
        return res.status(400).json({ error: 'amountCents must be >= 0' });
      }
      patch.amountCents = n;
    }
    if (req.body?.tenderId !== undefined) patch.tenderId = typeof req.body.tenderId === 'string' && req.body.tenderId ? req.body.tenderId.slice(0, 64) : null;
    if (req.body?.validUntil !== undefined) {
      if (!req.body.validUntil) patch.validUntil = null;
      else {
        const d = new Date(req.body.validUntil);
        if (Number.isNaN(d.getTime())) {
          await prisma.$disconnect().catch(() => {});
          return res.status(400).json({ error: 'validUntil must be a date' });
        }
        patch.validUntil = d;
      }
    }
    // Status final (approved/rejected) hanya lewat draft approval — di sini cuma draft/sent/expired.
    if (req.body?.status === 'draft' || req.body?.status === 'sent' || req.body?.status === 'expired') {
      patch.status = req.body.status;
    }
    const row = await prisma.quotation.update({ where: { id: req.params.id }, data: patch });
    await prisma.$disconnect().catch(() => {});
    res.json(toRow(row));
  } catch {
    res.status(500).json({ error: 'update failed' });
  }
});

export default r;
