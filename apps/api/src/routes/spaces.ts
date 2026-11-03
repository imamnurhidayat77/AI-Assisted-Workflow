import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../services/auth.js';

const r = Router();
const KINDS = new Set(['conversation', 'document', 'tender', 'note']);
const TONES = new Set(['amber', 'blue', 'green', 'purple']);

async function db(): Promise<PrismaClient | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const c = new PrismaClient();
    await c.$queryRaw`SELECT 1`;
    return c;
  } catch {
    return null;
  }
}

// GET /api/spaces — daftar space + hitungan item (open, fallback []).
r.get('/', async (_req, res) => {
  const prisma = await db();
  if (!prisma) return res.json([]);
  try {
    const spaces = await prisma.space.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { items: { select: { kind: true } } },
    });
    res.json(
      spaces.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        tone: s.tone,
        icon: s.icon,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        itemCount: s.items.length,
        byKind: s.items.reduce<Record<string, number>>((acc, it) => {
          acc[it.kind] = (acc[it.kind] ?? 0) + 1;
          return acc;
        }, {}),
      })),
    );
  } catch {
    res.json([]);
  }
});

// POST /api/spaces — buat space baru.
r.post('/', requireAuth, async (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: 'name is required' });
  const description = String(req.body?.description ?? '').slice(0, 500);
  const tone = TONES.has(req.body?.tone) ? req.body.tone : 'blue';
  const icon = String(req.body?.icon ?? 'grid').slice(0, 24);
  const prisma = await db();
  if (!prisma) return res.status(503).json({ error: 'database offline' });
  const created = await prisma.space.create({ data: { name, description, tone, icon } });
  res.status(201).json(created);
});

// GET /api/spaces/:id — detail + semua item.
r.get('/:id', async (req, res) => {
  const prisma = await db();
  if (!prisma) return res.status(503).json({ error: 'database offline' });
  const space = await prisma.space.findUnique({
    where: { id: req.params.id },
    include: { items: { orderBy: { createdAt: 'desc' } } },
  });
  if (!space) return res.status(404).json({ error: 'not found' });
  res.json(space);
});

// POST /api/spaces/:id/items — simpan item (conversation/document/tender/note).
r.post('/:id/items', requireAuth, async (req, res) => {
  const kind = String(req.body?.kind ?? '');
  const title = String(req.body?.title ?? '').trim().slice(0, 200);
  if (!KINDS.has(kind)) return res.status(400).json({ error: `kind must be one of: ${[...KINDS].join(', ')}` });
  if (!title) return res.status(400).json({ error: 'title is required' });
  const prisma = await db();
  if (!prisma) return res.status(503).json({ error: 'database offline' });
  const space = await prisma.space.findUnique({ where: { id: req.params.id } });
  if (!space) return res.status(404).json({ error: 'space not found' });
  const item = await prisma.spaceItem.create({
    data: {
      spaceId: req.params.id,
      kind,
      refId: String(req.body?.refId ?? '').slice(0, 200),
      title,
      preview: String(req.body?.preview ?? '').slice(0, 1000),
    },
  });
  await prisma.space.update({ where: { id: req.params.id }, data: { updatedAt: new Date() } });
  res.status(201).json(item);
});

// DELETE /api/spaces/:id/items/:itemId — keluarkan item.
r.delete('/:id/items/:itemId', requireAuth, async (req, res) => {
  const prisma = await db();
  if (!prisma) return res.status(503).json({ error: 'database offline' });
  const item = await prisma.spaceItem.deleteMany({
    where: { id: req.params.itemId, spaceId: req.params.id },
  });
  if (!item.count) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// DELETE /api/spaces/:id — hapus space beserta itemnya.
r.delete('/:id', requireAuth, async (req, res) => {
  const prisma = await db();
  if (!prisma) return res.status(503).json({ error: 'database offline' });
  try {
    await prisma.space.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'not found' });
  }
});

export default r;
