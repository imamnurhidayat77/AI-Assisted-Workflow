import { Router } from 'express';
import { getHrSnapshot } from '../services/hr.js';
import { requireAuth, type AuthUser } from '../services/auth.js';

const r = Router();

// GET /api/hr/overview — policies + roster agregat (tanpa nama/gaji individu, by design).
// Khusus hr + management. DB mati → 503 eksplisit, tanpa data palsu.
r.get('/overview', requireAuth, async (_req, res) => {
  const user = (res as unknown as { locals: { user: AuthUser } }).locals.user;
  if (user.role !== 'hr' && user.role !== 'management') {
    return res.status(403).json({ error: 'hr overview requires hr or management role' });
  }
  try {
    res.json(await getHrSnapshot());
  } catch (e) {
    const status = typeof (e as { status?: unknown })?.status === 'number' ? ((e as { status: number }).status as number) : 500;
    res.status(status).json({ error: e instanceof Error ? e.message : 'hr unavailable' });
  }
});

export default r;
