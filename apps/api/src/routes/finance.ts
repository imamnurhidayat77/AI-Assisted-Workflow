import { Router } from 'express';
import { getFinanceSnapshot } from '../services/finance.js';
import { requireAuth, type AuthUser } from '../services/auth.js';

const r = Router();

// GET /api/finance/overview — invoice AR/AP + closing checklist.
// Khusus finance + management (data sensitif; bukan operasional bersama).
// DB mati → 503 eksplisit, tanpa angka palsu.
r.get('/overview', requireAuth, async (_req, res) => {
  const user = (res as unknown as { locals: { user: AuthUser } }).locals.user;
  if (user.role !== 'finance' && user.role !== 'management') {
    return res.status(403).json({ error: 'finance overview requires finance or management role' });
  }
  try {
    res.json(await getFinanceSnapshot());
  } catch (e) {
    const status = typeof (e as { status?: unknown })?.status === 'number' ? ((e as { status: number }).status as number) : 500;
    res.status(status).json({ error: e instanceof Error ? e.message : 'finance unavailable' });
  }
});

export default r;
