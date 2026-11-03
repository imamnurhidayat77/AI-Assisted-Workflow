import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { canApproveDraft, isSpaceVisibility, type SpaceAction } from '@street-smart/shared';
import { listDrafts as listAllDrafts } from '../services/drafts.js';
import { requireAuth, type AuthUser } from '../services/auth.js';
import { canEditSpace, canViewSpace, visibleSpaces } from '../services/spaceAccess.js';
import { getTenders } from '../services/tenders.js';

const r = Router();
const KINDS = new Set(['conversation', 'document', 'tender', 'note']);
const TONES = new Set(['amber', 'blue', 'green', 'purple']);

function meOf(res: unknown): AuthUser {
  return (res as { locals: { user: AuthUser } }).locals.user;
}

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

async function logActivity(
  prisma: PrismaClient,
  spaceId: string,
  user: AuthUser,
  type: 'SPACE_CREATED' | 'SPACE_ARCHIVED' | 'ITEM_ADDED' | 'ITEM_REMOVED' | 'DRAFT_CREATED' | 'DRAFT_APPROVED' | 'DRAFT_REJECTED' | 'CONTEXT_USED',
  summary: string,
  refId?: string,
): Promise<void> {
  try {
    await prisma.spaceActivity.create({
      data: { spaceId, actorId: user.id, actorRole: user.role, type, summary: summary.slice(0, 280), refId: refId?.slice(0, 64) },
    });
  } catch {
    // Audit best-effort — tidak menggagalkan aksi utama.
  }
}

// GET /api/spaces — hanya space yang boleh dilihat user (owner / role / management / legacy).
r.get('/', requireAuth, async (_req, res) => {
  const me = meOf(res);
  const prisma = await db();
  if (!prisma) return res.status(503).json({ error: 'database offline' });
  try {
    const [spaces, drafts] = await Promise.all([
      prisma.space.findMany({
        orderBy: { updatedAt: 'desc' },
        include: {
          items: { select: { kind: true } },
          activities: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      listAllDrafts({ id: me.id, role: me.role }).catch(() => []),
    ]);
    const visible = visibleSpaces(me, spaces.map((s) => ({
      ...s,
      ownerId: s.ownerId,
      ownerRole: s.ownerRole,
      visibility: s.visibility as 'PRIVATE' | 'ROLE',
      status: s.status as 'ACTIVE' | 'ARCHIVED',
    })));
    const pendingBySpace = new Map<string, number>();
    for (const d of drafts) {
      const sid = (d as { spaceId?: string | null }).spaceId;
      if (sid && (d.status === 'draft' || d.status === 'in_review')) {
        pendingBySpace.set(sid, (pendingBySpace.get(sid) ?? 0) + 1);
      }
    }
    res.json(visible.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      tone: s.tone,
      icon: s.icon,
      ownerId: s.ownerId ?? undefined,
      ownerRole: s.ownerRole || undefined,
      visibility: s.visibility,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      itemCount: (s as unknown as { items: { kind: string }[] }).items.length,
      byKind: ((s as unknown as { items: { kind: string }[] }).items).reduce<Record<string, number>>((acc, it) => {
        acc[it.kind] = (acc[it.kind] ?? 0) + 1;
        return acc;
      }, {}),
      pendingActions: pendingBySpace.get(s.id) ?? 0,
      lastActivityAt: ((s as unknown as { activities: { createdAt: Date }[] }).activities[0]?.createdAt ?? s.updatedAt).toISOString(),
    })));
  } catch {
    res.status(503).json({ error: 'database unreachable' });
  }
});

// POST /api/spaces — buat space baru (pemilik = pembuat).
r.post('/', requireAuth, async (req, res) => {
  const me = meOf(res);
  const name = String(req.body?.name ?? '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: 'name is required' });
  const description = String(req.body?.description ?? '').slice(0, 500);
  const tone = TONES.has(req.body?.tone) ? req.body.tone : 'blue';
  const icon = String(req.body?.icon ?? 'grid').slice(0, 24);
  const visibility = isSpaceVisibility(req.body?.visibility) ? req.body.visibility : 'PRIVATE';
  const prisma = await db();
  if (!prisma) return res.status(503).json({ error: 'database offline' });
  const created = await prisma.space.create({
    data: { name, description, tone, icon, ownerId: me.id, ownerRole: me.role, visibility },
  });
  await logActivity(prisma, created.id, me, 'SPACE_CREATED', `Space "${name}" created (${visibility})`);
  res.status(201).json(created);
});

// GET /api/spaces/:id — detail + item + aktivitas + draft tertaut (difilter viewer).
r.get('/:id', requireAuth, async (req, res) => {
  const me = meOf(res);
  const prisma = await db();
  if (!prisma) return res.status(503).json({ error: 'database offline' });
  const space = await prisma.space.findUnique({ where: { id: req.params.id } });
  if (!space) return res.status(404).json({ error: 'not found' });
  const rec = {
    ...space,
    visibility: space.visibility as 'PRIVATE' | 'ROLE',
    status: space.status as 'ACTIVE' | 'ARCHIVED',
  };
  if (!canViewSpace(me, rec)) return res.status(404).json({ error: 'not found' });
  const [items, activities, drafts] = await Promise.all([
    prisma.spaceItem.findMany({ where: { spaceId: space.id }, orderBy: { createdAt: 'desc' } }),
    prisma.spaceActivity.findMany({ where: { spaceId: space.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    listAllDrafts({ id: me.id, role: me.role }).catch(() => []),
  ]);
  const mine = drafts.filter((d) => (d as { spaceId?: string | null }).spaceId === space.id);
  res.json({
    ...space,
    items: items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString(), addedAt: i.addedAt.toISOString() })),
    activities: activities.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    drafts: mine,
  });
});

// POST /api/spaces/:id/items — simpan item (pemilik / management / legacy).
r.post('/:id/items', requireAuth, async (req, res) => {
  const me = meOf(res);
  const kind = String(req.body?.kind ?? '');
  const title = String(req.body?.title ?? '').trim().slice(0, 200);
  if (!KINDS.has(kind)) return res.status(400).json({ error: `kind must be one of: ${[...KINDS].join(', ')}` });
  if (!title) return res.status(400).json({ error: 'title is required' });
  const prisma = await db();
  if (!prisma) return res.status(503).json({ error: 'database offline' });
  const space = await prisma.space.findUnique({ where: { id: req.params.id } });
  if (!space) return res.status(404).json({ error: 'space not found' });
  const rec = {
    ...space,
    visibility: space.visibility as 'PRIVATE' | 'ROLE',
    status: space.status as 'ACTIVE' | 'ARCHIVED',
  };
  if (!canEditSpace(me, rec)) return res.status(404).json({ error: 'space not found' });
  if (rec.status === 'ARCHIVED') return res.status(409).json({ error: 'space is archived' });
  const item = await prisma.spaceItem.create({
    data: {
      spaceId: req.params.id,
      kind,
      refId: String(req.body?.refId ?? '').slice(0, 200),
      title,
      preview: String(req.body?.preview ?? '').slice(0, 1000),
      addedById: me.id,
      note: String(req.body?.note ?? '').slice(0, 280),
    },
  });
  await prisma.space.update({ where: { id: req.params.id }, data: { updatedAt: new Date() } });
  await logActivity(prisma, space.id, me, 'ITEM_ADDED', `${kind}: ${title}`.slice(0, 280), item.id);
  res.status(201).json(item);
});

// DELETE /api/spaces/:id/items/:itemId — keluarkan item.
r.delete('/:id/items/:itemId', requireAuth, async (req, res) => {
  const me = meOf(res);
  const prisma = await db();
  if (!prisma) return res.status(503).json({ error: 'database offline' });
  const space = await prisma.space.findUnique({ where: { id: req.params.id } });
  if (!space) return res.status(404).json({ error: 'space not found' });
  const rec = {
    ...space,
    visibility: space.visibility as 'PRIVATE' | 'ROLE',
    status: space.status as 'ACTIVE' | 'ARCHIVED',
  };
  if (!canEditSpace(me, rec)) return res.status(404).json({ error: 'space not found' });
  const existing = await prisma.spaceItem.findFirst({ where: { id: req.params.itemId, spaceId: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'not found' });
  await prisma.spaceItem.delete({ where: { id: existing.id } });
  await prisma.space.update({ where: { id: req.params.id }, data: { updatedAt: new Date() } });
  await logActivity(prisma, space.id, me, 'ITEM_REMOVED', `${existing.kind}: ${existing.title}`.slice(0, 280), existing.id);
  res.json({ ok: true });
});

// GET /api/spaces/:id/actions — saran aksi turunan data (bukan karangan).
// Hanya aksi yang boleh dilakukan user: review draft yang ia bisa approve,
// follow-up conversation lama tanpa draft tertaut, tender yang segera tutup.
r.get('/:id/actions', requireAuth, async (req, res) => {
  const me = meOf(res);
  const prisma = await db();
  if (!prisma) return res.status(503).json({ error: 'database offline' });
  const space = await prisma.space.findUnique({ where: { id: req.params.id } });
  if (!space) return res.status(404).json({ error: 'space not found' });
  if (!canViewSpace(me, {
    ...space,
    ownerId: space.ownerId,
    ownerRole: space.ownerRole,
    visibility: space.visibility as 'PRIVATE' | 'ROLE',
    status: space.status as 'ACTIVE' | 'ARCHIVED',
  })) {
    return res.status(404).json({ error: 'space not found' });
  }
  const actions: SpaceAction[] = [];
  try {
    const [drafts, items] = await Promise.all([
      listAllDrafts({ id: me.id, role: me.role }).catch(() => []),
      prisma.spaceItem.findMany({ where: { spaceId: space.id }, orderBy: { createdAt: 'desc' } }),
    ]);
    // 1) Draft in_review yang bisa diputus user ini (maker-checker aware).
    for (const d of drafts) {
      const sd = d as typeof d & { spaceId?: string | null };
      if (sd.spaceId !== space.id || d.status !== 'in_review' || d.createdBy === me.id) continue;
      if (!canApproveDraft(d, { id: me.id, role: me.role })) continue;
      actions.push({
        type: 'REVIEW_DRAFT',
        title: `Review: ${d.title}`,
        reason: `Awaiting your decision as checker (${d.kind})`,
        targetId: d.id,
        href: '/inbox',
        requiresApproval: true,
      });
    }
    const now = Date.now();
    const N_DAYS = 7 * 86_400_000;
    // 2) Conversation lama (>N hari) tanpa draft tertaut → sarankan follow-up.
    for (const it of items) {
      if (it.kind !== 'conversation') continue;
      if (now - it.createdAt.getTime() < N_DAYS) continue;
      const linked = drafts.some(
        (d) => (d as { spaceId?: string | null }).spaceId === space.id && d.title.includes(it.title.slice(0, 40)),
      );
      if (linked) continue;
      actions.push({
        type: 'FOLLOW_UP',
        title: `Follow up: ${it.title.slice(0, 80)}`,
        reason: 'Conversation is over 7 days old with no linked draft',
        targetId: it.id,
        href: `/conversation?q=${encodeURIComponent(it.refId || it.title)}`,
        requiresApproval: false,
      });
      if (actions.length >= 10) break;
    }
    // 3) Tender yang segera tutup (hanya role yang boleh lihat tender).
    if (me.role === 'sales' || me.role === 'operations' || me.role === 'management') {
      const tenderItems = items.filter((it) => it.kind === 'tender' && it.refId);
      if (tenderItems.length) {
        const { rows } = await getTenders().catch(() => ({ rows: [] as { id: string; name: string; date: string; status: string }[] }));
        for (const it of tenderItems) {
          const t = rows.find((r) => r.id === it.refId);
          if (!t || t.status === 'Won' || t.status === 'Lost') continue;
          actions.push({
            type: 'OPEN_ITEM',
            title: `Closing soon: ${t.name}`,
            reason: `Closes ${t.date} — consider a response brief`,
            targetId: t.id,
            href: '/data',
            requiresApproval: false,
          });
          if (actions.length >= 10) break;
        }
      }
    }
    res.json({ actions: actions.slice(0, 10) });
  } catch {
    res.status(503).json({ error: 'actions unavailable' });
  }
});

// POST /api/spaces/:id/archive — arsipkan space (satu arah; pemilik / management).
r.post('/:id/archive', requireAuth, async (req, res) => {
  const me = meOf(res);
  const prisma = await db();
  if (!prisma) return res.status(503).json({ error: 'database offline' });
  const space = await prisma.space.findUnique({ where: { id: req.params.id } });
  if (!space) return res.status(404).json({ error: 'space not found' });
  const rec = {
    ...space,
    visibility: space.visibility as 'PRIVATE' | 'ROLE',
    status: space.status as 'ACTIVE' | 'ARCHIVED',
  };
  if (!canEditSpace(me, rec)) return res.status(404).json({ error: 'space not found' });
  const row = await prisma.space.update({ where: { id: space.id }, data: { status: 'ARCHIVED' } });
  await logActivity(prisma, space.id, me, 'SPACE_ARCHIVED', `Space "${space.name}" archived`);
  res.json(row);
});

// DELETE /api/spaces/:id — hapus space beserta itemnya (pemilik / management).
r.delete('/:id', requireAuth, async (req, res) => {
  const me = meOf(res);
  const prisma = await db();
  if (!prisma) return res.status(503).json({ error: 'database offline' });
  const space = await prisma.space.findUnique({ where: { id: req.params.id } });
  if (!space) return res.status(404).json({ error: 'space not found' });
  const rec = {
    ...space,
    visibility: space.visibility as 'PRIVATE' | 'ROLE',
    status: space.status as 'ACTIVE' | 'ARCHIVED',
  };
  if (!canEditSpace(me, rec)) return res.status(404).json({ error: 'space not found' });
  try {
    await prisma.space.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'not found' });
  }
});

export default r;
