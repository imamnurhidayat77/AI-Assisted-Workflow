import { Router } from 'express';
import { draftToJob, jobs as staticJobs } from '@street-smart/shared';
import { listDrafts } from '../services/drafts.js';

const r = Router();

// GET /api/jobs — gabungan job simulasi + antrean approval draft live.
// Draft approved tidak masuk antrean (sudah final, anti data-loss dari aksi ganda).
r.get('/', async (_req, res) => {
  const pending = (await listDrafts())
    .filter((d) => d.status === 'draft' || d.status === 'in_review')
    .map(draftToJob);
  res.json([...pending, ...staticJobs]);
});

export default r;
