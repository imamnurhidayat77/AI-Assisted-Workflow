import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { draftToJob, type JobItem } from '@street-smart/shared';
import { listDrafts } from '../services/drafts.js';
import { requireAuth, type AuthUser } from '../services/auth.js';

const r = Router();

// GET /api/jobs — job DB + antrean approval draft live milik viewer.
// Draft approved tidak masuk antrean (sudah final, anti data-loss dari aksi ganda).
// DB mati → 503, tanpa job palsu.
r.get('/', requireAuth, async (_req, res) => {
  try {
    const viewer = (res as unknown as { locals: { user: AuthUser } }).locals.user;
    const prisma = new PrismaClient();
    const [dbJobs, drafts] = await Promise.all([
      prisma.job.findMany({ orderBy: { id: 'asc' } }).catch(() => { throw Object.assign(new Error('database unreachable'), { status: 503 }); }),
      listDrafts({ id: viewer.id, role: viewer.role }),
    ]);
    await prisma.$disconnect().catch(() => {});
    const pending = drafts
      .filter((d) => d.status === 'draft' || d.status === 'in_review')
      .map(draftToJob);
    const rows: JobItem[] = dbJobs.map((j) => ({
      name: j.name,
      agent: j.agent,
      state: j.state as JobItem['state'],
      trigger: j.trigger ?? '—',
      lastRun: j.lastRun ?? '—',
      progress: j.progress ?? '—',
    }));
    res.json([...pending, ...rows]);
  } catch (e) {
    const status = typeof (e as { status?: unknown })?.status === 'number' ? ((e as { status: number }).status as number) : 500;
    res.status(status).json({ error: e instanceof Error ? e.message : 'jobs unavailable' });
  }
});

export default r;
