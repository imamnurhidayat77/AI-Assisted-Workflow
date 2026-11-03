import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { emitDraftChanged } from '../realtime.js';
import { canApproveDraft, isDraftStatus, type RoleId } from '@street-smart/shared';
import { createDraft, editDraft, getDraft, listAllDrafts, listDrafts, setDraftStatus } from '../services/drafts.js';
import { getThread } from '../services/conversations.js';
import { requireAuth, type AuthUser } from '../services/auth.js';
import { canViewSpace } from '../services/spaceAccess.js';
import { logSpaceActivity } from '../services/spaceContext.js';

/** Sinkronisasi balik draft → quotation (rantai approval utuh):
 * approve → quotation approved; reject → quotation sent kembali draft.
 * Best-effort: kegagalan sync tidak menggagalkan keputusan draft. */
async function syncQuotation(draft: { kind: string; sourceQuotationId?: string }, to: 'approved' | 'rejected'): Promise<void> {
  if (draft.kind !== 'quotation-review' || !draft.sourceQuotationId) return;
  try {
    const prisma = new PrismaClient();
    const cur = await prisma.quotation.findUnique({ where: { id: draft.sourceQuotationId } });
    if (cur) {
      const next = to === 'approved' ? 'approved' : cur.status === 'sent' ? 'draft' : cur.status;
      if (next !== cur.status) {
        await prisma.quotation.update({ where: { id: cur.id }, data: { status: next } });
      }
    }
    await prisma.$disconnect().catch(() => {});
  } catch (e) {
    console.warn('[drafts] quotation sync failed:', (e as Error).message);
  }
}

function actor(res: unknown): string {
  return (res as { locals: { user: AuthUser } }).locals.user.name;
}

function viewerOf(res: unknown): { id: string; role: string } {
  return (res as { locals: { user: AuthUser } }).locals.user;
}

/** List/detail/edit mengikuti kepemilikan (management: semua). Draft lama tanpa
 * createdBy tetap terlihat agar tidak hilang mendadak. */
function canSee(d: { createdBy?: string }, v: { id: string; role: string }): boolean {
  return v.role === 'management' || !d.createdBy || d.createdBy === v.id;
}

/** Guard kepemilikan untuk aksi consequential — 404 bila bukan milik user (bocorkan minimal). */
async function mustOwn(req: unknown, res: unknown): Promise<boolean> {
  const d = await getDraft((req as { params: { id: string } }).params.id);
  if (!d || !canSee(d, viewerOf(res))) {
    (res as { status: (c: number) => { json: (b: unknown) => void } }).status(404).json({ error: 'not found' });
    return false;
  }
  return true;
}

/** Guard keputusan (approve/reject): pemilik/management ATAU checker yang sah
 * (in_review + lolos maker-checker). Bukan checker & bukan pemilik → 404
 * agar keberadaan draft tidak bocor ke role lain. */
async function mustDecide(req: unknown, res: unknown): Promise<boolean> {
  const d = await getDraft((req as { params: { id: string } }).params.id);
  const me = viewerOf(res);
  const R = res as { status: (c: number) => { json: (b: unknown) => void } };
  if (!d) {
    R.status(404).json({ error: 'not found' });
    return false;
  }
  const eligibleChecker =
    d.status === 'in_review' && d.createdBy !== me.id && canApproveDraft(d, { id: me.id, role: me.role });
  if (!canSee(d, me) && !eligibleChecker) {
    R.status(404).json({ error: 'not found' });
    return false;
  }
  if (!canApproveDraft(d, { id: me.id, role: me.role })) {
    R.status(403).json({ error: `role '${me.role}' may not decide ${d.kind} drafts${d.createdBy === me.id ? ' created by you (maker-checker)' : ''}` });
    return false;
  }
  return true;
}

const r = Router();

function sendErr(res: { status: (c: number) => { json: (b: unknown) => void } }, e: unknown) {
  const status = typeof (e as { status?: unknown })?.status === 'number' ? ((e as { status: number }).status as number) : 500;
  const message = e instanceof Error ? e.message : 'internal error';
  // Jangan log body draft ke console — bisa berisi data bisnis sensitif.
  (res as unknown as { status: (c: number) => { json: (b: unknown) => unknown } }).status(status).json({ error: message });
}

// Semua route drafts wajib auth (isi draft bisa sensitif — jawaban finance/HR).
// List/detail/edit mengikuti kepemilikan (management: semua); decidedBy dari sesi.
r.get('/', requireAuth, async (req, res) => {
  try {
    const all = await listDrafts(viewerOf(res));
    const q = req.query.status;
    if (typeof q === 'string' && q) {
      if (!isDraftStatus(q)) return res.status(400).json({ error: `unknown status: ${q.slice(0, 32)}` });
      return res.json(all.filter((d) => d.status === q));
    }
    res.json(all);
  } catch (e) {
    sendErr(res, e);
  }
});

// GET /api/drafts/inbox — antrean aksi untuk saya (bukan antrean global seperti /api/jobs):
// - awaiting: in_review yang boleh saya approve (bukan buatan saya sendiri)
// - mine: draft saya yang butuh aksi (draft/rejected)
// Management melihat semua in_review yang boleh di-approve.
// (Ditaruh sebelum /:id agar tidak ditelan route param.)
r.get('/inbox', requireAuth, async (req, res) => {
  try {
    const me = viewerOf(res);
    const all = await listAllDrafts();
    const awaiting = all.filter(
      (d) => d.status === 'in_review' && d.createdBy !== me.id && canApproveDraft(d, { id: me.id, role: me.role }),
    );
    const mine = all.filter(
      (d) => d.createdBy === me.id && (d.status === 'draft' || d.status === 'rejected'),
    );
    res.json({ awaiting, mine });
  } catch (e) {
    sendErr(res, e);
  }
});

// GET /api/drafts/:id
r.get('/:id', requireAuth, async (req, res) => {
  try {
    const d = await getDraft(req.params.id);
    if (!d || !canSee(d, viewerOf(res))) return res.status(404).json({ error: 'not found' });
    res.json(d);
  } catch (e) {
    sendErr(res, e);
  }
});

// POST /api/drafts — AI/human membuat draft baru (selalu status draft).
// spaceId opsional: harus space yang boleh dilihat pembuat (bukan tebakan buta).
r.post('/', requireAuth, async (req, res) => {
  try {
    const me = viewerOf(res);
    const rawSpace = typeof req.body?.spaceId === 'string' && req.body.spaceId ? req.body.spaceId.slice(0, 64) : undefined;
    let spaceId: string | undefined;
    if (rawSpace) {
      const prisma = new PrismaClient();
      try {
        const s = await prisma.space.findUnique({ where: { id: rawSpace } });
        if (!s || !canViewSpace({ id: me.id, role: me.role as RoleId }, {
          ...s,
          ownerId: s.ownerId,
          ownerRole: s.ownerRole,
          visibility: s.visibility as 'PRIVATE' | 'ROLE',
          status: s.status as 'ACTIVE' | 'ARCHIVED',
        })) {
          await prisma.$disconnect().catch(() => {});
          return res.status(404).json({ error: 'space not found' });
        }
      } finally {
        await prisma.$disconnect().catch(() => {});
      }
      spaceId = rawSpace;
    }
    // sourceConversationId opsional: harus thread yang ada DAN boleh dilihat pembuat.
    // Tanpa ini draft tidak boleh mengklaim asal conversation (anti spoofing tautan).
    let sourceConversationId: string | undefined;
    const rawConv = typeof req.body?.sourceConversationId === 'string' && req.body.sourceConversationId
      ? req.body.sourceConversationId.slice(0, 64)
      : undefined;
    if (rawConv) {
      const thread = await getThread(rawConv, { id: me.id, role: me.role }).catch(() => null);
      if (!thread) return res.status(404).json({ error: 'conversation not found' });
      sourceConversationId = rawConv;
    }
    const d = await createDraft({ ...(req.body ?? {}), createdBy: me.id, spaceId, sourceConversationId });
    if (spaceId) {
      await logSpaceActivity({
        spaceId, actorId: me.id, actorRole: me.role,
        type: 'DRAFT_CREATED', summary: `Draft created: ${d.title}`.slice(0, 280), refId: d.id,
      });
    }
    emitDraftChanged(d);
    res.status(201).json(d);
  } catch (e) {
    sendErr(res, e);
  }
});

// PATCH /api/drafts/:id — manusia memperbaiki title/body (draft & in_review saja)
r.patch('/:id', requireAuth, async (req, res) => {
  try {
    const cur = await getDraft(req.params.id);
    if (!cur || !canSee(cur, viewerOf(res))) return res.status(404).json({ error: 'not found' });
    const d = await editDraft(req.params.id, { title: req.body?.title, body: req.body?.body });
    emitDraftChanged(d);
    res.json(d);
  } catch (e) {
    sendErr(res, e);
  }
});

// Keputusan consequential (submit/approve/reject/reopen) + ownership check;
// decidedBy diambil dari sesi, bukan dari body (cegah spoofing).
r.post('/:id/submit', requireAuth, async (req, res) => {
  try {
    if (!(await mustOwn(req, res))) return;
    const d = await setDraftStatus(req.params.id, 'in_review', actor(res));
    emitDraftChanged(d);
    res.json(d);
  } catch (e) {
    sendErr(res, e);
  }
});

// POST /api/drafts/:id/approve — keputusan final manusia (simulasi: tanpa side-effect)
// Maker-checker via mustDecide: payment-approval hanya management; sales-kind
// hanya ops/mgmt dan bukan pembuatnya; checker sah boleh decide in_review.
r.post('/:id/approve', requireAuth, async (req, res) => {
  try {
    if (!(await mustDecide(req, res))) return;
    const d = await setDraftStatus(req.params.id, 'approved', actor(res));
    await syncQuotation(d, 'approved');
    if (d.spaceId) {
      await logSpaceActivity({
        spaceId: d.spaceId, actorId: viewerOf(res).id, actorRole: viewerOf(res).role,
        type: 'DRAFT_APPROVED', summary: `Draft approved: ${d.title}`.slice(0, 280), refId: d.id,
      });
    }
    emitDraftChanged(d);
    res.json({ ...d, quotationSynced: d.kind === 'quotation-review' && Boolean(d.sourceQuotationId) });
  } catch (e) {
    sendErr(res, e);
  }
});



// POST /api/drafts/:id/reject — tolak checker ATAU withdraw pemilik.
// Self-reject selalu boleh (fail-safe, bukan keputusan consequential);
// checker sah boleh mengembalikan untuk diperbaiki. Selain itu → 404.
r.post('/:id/reject', requireAuth, async (req, res) => {
  try {
    const d = await getDraft(req.params.id);
    const me = viewerOf(res);
    const R = res as { status: (c: number) => { json: (b: unknown) => void } };
    if (!d) {
      R.status(404).json({ error: 'not found' });
      return;
    }
    const eligibleChecker =
      d.status === 'in_review' && d.createdBy !== me.id && canApproveDraft(d, { id: me.id, role: me.role });
    if (!canSee(d, me) && !eligibleChecker) {
      R.status(404).json({ error: 'not found' });
      return;
    }
    const decided = await setDraftStatus(req.params.id, 'rejected', actor(res));
    await syncQuotation(decided, 'rejected');
    if (decided.spaceId) {
      await logSpaceActivity({
        spaceId: decided.spaceId, actorId: viewerOf(res).id, actorRole: viewerOf(res).role,
        type: 'DRAFT_REJECTED', summary: `Draft rejected: ${decided.title}`.slice(0, 280), refId: decided.id,
      });
    }
    emitDraftChanged(decided);
    res.json(decided);
  } catch (e) {
    sendErr(res, e);
  }
});

// POST /api/drafts/:id/reopen — rejected → draft (perbaiki lalu ajukan ulang)
r.post('/:id/reopen', requireAuth, async (req, res) => {
  try {
    if (!(await mustOwn(req, res))) return;
    const d = await setDraftStatus(req.params.id, 'draft', actor(res));
    emitDraftChanged(d);
    res.json(d);
  } catch (e) {
    sendErr(res, e);
  }
});

export default r;
