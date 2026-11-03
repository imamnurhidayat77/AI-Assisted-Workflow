import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { getTenders } from '../services/tenders.js';
import { requireAuth, type AuthUser } from '../services/auth.js';

const r = Router();
const WRITE_ROLES = ['sales', 'operations', 'management'];

// GET /api/tenders?q=auckland — langsung dari Postgres. DB mati → 503, tanpa data palsu.
// Data operasional non-sensitif: semua role aktif boleh baca (didokumentasikan).
function dbErr(res: { status: (c: number) => { json: (b: unknown) => void } }, e: unknown) {
  const status = typeof (e as { status?: unknown })?.status === 'number' ? ((e as { status: number }).status as number) : 500;
  res.status(status).json({ error: e instanceof Error ? e.message : 'tenders unavailable' });
}

r.get('/', requireAuth, async (req, res) => {
  try {
    const q = String(req.query.q ?? '');
    const { rows, via } = await getTenders(q);
    res.setHeader('X-Data-Via', via);
    res.json(rows);
  } catch (e) {
    dbErr(res, e);
  }
});

r.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await getTenders();
    const row = rows.find((t) => t.id === req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(row);
  } catch (e) {
    dbErr(res, e);
  }
});

// POST /api/tenders — input tender real (sales/ops/mgmt). ID bisnis TND-TAHUN-XXX
// otomatis bila tidak diisi. Status awal selalu IDENTIFIED (alur wajar via pipeline).
r.post('/', requireAuth, async (req, res) => {
  const user = (res as unknown as { locals: { user: AuthUser } }).locals.user;
  if (!WRITE_ROLES.includes(user.role)) return res.status(403).json({ error: 'tender input requires sales, operations or management role' });
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const name = str(req.body?.name, 200);
  const agency = str(req.body?.agency, 200);
  const country = str(req.body?.country, 100);
  const product = str(req.body?.product, 100);
  const closeLabel = str(req.body?.closeLabel, 64);
  const value = str(req.body?.value, 64);
  if (!name || !agency || !country || !product || !closeLabel || !value) {
    return res.status(400).json({ error: 'name, agency, country, product, closeLabel and value are required' });
  }
  const priority = ['High', 'Medium', 'Low'].includes(req.body?.priority) ? req.body.priority : null;
  let closesOn: Date | null = null;
  if (req.body?.closesOn) {
    const d = new Date(req.body.closesOn);
    if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'closesOn must be a date' });
    closesOn = d;
  }
  try {
    const prisma = new PrismaClient();
    const year = new Date().getFullYear();
    const count = await prisma.tender.count();
    const id = str(req.body?.id, 32) || `TND-${year}-${String(count + 1).padStart(3, '0')}`;
    const row = await prisma.tender.create({
      data: { id, name, agency, country, product, closeLabel, value, priority, closesOn },
    });
    await prisma.$disconnect().catch(() => {});
    res.status(201).json({ id: row.id, name, agency, country, product, closeLabel, value });
  } catch (e) {
    if (String((e as Error).message).includes('Unique constraint')) {
      return res.status(409).json({ error: 'tender id already exists' });
    }
    dbErr(res, e);
  }
});

export default r;
