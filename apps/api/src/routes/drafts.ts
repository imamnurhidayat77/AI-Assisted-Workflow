import { Router } from 'express';
import { createDraft, editDraft, getDraft, listDrafts, setDraftStatus } from '../services/drafts.js';

const r = Router();

function sendErr(res: { status: (c: number) => { json: (b: unknown) => void } }, e: unknown) {
  const status = typeof (e as { status?: unknown })?.status === 'number' ? ((e as { status: number }).status as number) : 500;
  const message = e instanceof Error ? e.message : 'internal error';
  // Jangan log body draft ke console — bisa berisi data bisnis sensitif.
  (res as unknown as { status: (c: number) => { json: (b: unknown) => unknown } }).status(status).json({ error: message });
}

// GET /api/drafts — daftar draft (terbaru dulu, termasuk riwayat approved/rejected)
r.get('/', async (_req, res) => {
  res.json(await listDrafts());
});

// GET /api/drafts/:id
r.get('/:id', async (req, res) => {
  const d = await getDraft(req.params.id);
  if (!d) return res.status(404).json({ error: 'not found' });
  res.json(d);
});

// POST /api/drafts — AI/human membuat draft baru (selalu status draft)
r.post('/', async (req, res) => {
  try {
    res.status(201).json(await createDraft(req.body ?? {}));
  } catch (e) {
    sendErr(res, e);
  }
});

// PATCH /api/drafts/:id — manusia memperbaiki title/body (draft & in_review saja)
r.patch('/:id', async (req, res) => {
  try {
    res.json(await editDraft(req.params.id, { title: req.body?.title, body: req.body?.body }));
  } catch (e) {
    sendErr(res, e);
  }
});

// POST /api/drafts/:id/submit — draft → in_review
r.post('/:id/submit', async (req, res) => {
  try {
    res.json(await setDraftStatus(req.params.id, 'in_review'));
  } catch (e) {
    sendErr(res, e);
  }
});

// POST /api/drafts/:id/approve — keputusan final manusia (simulasi: tanpa side-effect)
r.post('/:id/approve', async (req, res) => {
  try {
    res.json(await setDraftStatus(req.params.id, 'approved', req.body?.decidedBy));
  } catch (e) {
    sendErr(res, e);
  }
});

// POST /api/drafts/:id/reject — kembalikan/tolak, bisa dilengkapi note
r.post('/:id/reject', async (req, res) => {
  try {
    res.json(await setDraftStatus(req.params.id, 'rejected', req.body?.decidedBy));
  } catch (e) {
    sendErr(res, e);
  }
});

// POST /api/drafts/:id/reopen — rejected → draft (perbaiki lalu ajukan ulang)
r.post('/:id/reopen', async (req, res) => {
  try {
    res.json(await setDraftStatus(req.params.id, 'draft', req.body?.decidedBy));
  } catch (e) {
    sendErr(res, e);
  }
});

export default r;
