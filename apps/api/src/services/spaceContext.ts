import { PrismaClient } from '@prisma/client';
import type { RoleId } from '@street-smart/shared';
import { documents } from './documents.js';
import { getThread } from './conversations.js';
import { getTenders } from './tenders.js';
import { listDrafts } from './drafts.js';
import { canViewSpace } from './spaceAccess.js';

// Konteks space untuk grounding chat: bounded, role-filtered, tanpa isi mentah.
// Loader di-inject agar logika filter/budget bisa di-unit-test tanpa DB.

export interface SpaceViewer {
  id: string;
  role: RoleId;
}

export interface SpaceContextItem {
  kind: 'conversation' | 'document' | 'tender' | 'note';
  title: string;
  detail: string;
  refId: string;
}

export interface SpaceContextDraft {
  id: string;
  title: string;
  kind: string;
  status: string;
  createdBy?: string;
}

export interface SpaceContextActivity {
  type: string;
  actorRole: string;
  summary: string;
  createdAt: string;
}

export interface SpaceContext {
  spaceId: string;
  name: string;
  description: string;
  items: SpaceContextItem[];
  pendingDrafts: SpaceContextDraft[];
  recentActivity: SpaceContextActivity[];
  truncated: boolean;
}

export interface ContextLoaders {
  loadSpace: (id: string) => Promise<{ id: string; name: string; description: string; ownerId: string | null; ownerRole: string; visibility: 'PRIVATE' | 'ROLE'; status: 'ACTIVE' | 'ARCHIVED' } | null>;
  loadItems: (spaceId: string) => Promise<{ id: string; kind: string; refId: string; title: string; preview: string }[]>;
  loadConversation: (refId: string, viewer: SpaceViewer) => Promise<{ title: string; preview: string } | null>;
  loadDocument: (refId: string, role: RoleId) => Promise<{ title: string; status: string; excerpt: string } | null>;
  loadTender: (refId: string) => Promise<{ title: string; detail: string } | null>;
  loadDrafts: (viewer: SpaceViewer) => Promise<{ id: string; title: string; kind: string; status: string; spaceId?: string | null; createdBy?: string }[]>;
  loadActivity: (spaceId: string, take: number) => Promise<{ type: string; actorRole: string; summary: string; createdAt: Date }[]>;
}

let client: PrismaClient | null = null;

async function db(): Promise<PrismaClient | null> {
  if (client) return client;
  if (!process.env.DATABASE_URL) return null;
  try {
    const c = new PrismaClient();
    await c.$queryRaw`SELECT 1`;
    client = c;
    return c;
  } catch {
    return null;
  }
}

const EXCERPT = 400;

export const defaultLoaders: ContextLoaders = {
  loadSpace: async (id) => {
    const prisma = await db();
    if (!prisma) throw Object.assign(new Error('database unreachable'), { status: 503 });
    const s = await prisma.space.findUnique({ where: { id } });
    if (!s) return null;
    return {
      id: s.id, name: s.name, description: s.description, ownerId: s.ownerId,
      ownerRole: s.ownerRole, visibility: s.visibility as 'PRIVATE' | 'ROLE', status: s.status as 'ACTIVE' | 'ARCHIVED',
    };
  },
  loadItems: async (spaceId) => {
    const prisma = await db();
    if (!prisma) throw Object.assign(new Error('database unreachable'), { status: 503 });
    const rows = await prisma.spaceItem.findMany({ where: { spaceId }, orderBy: { createdAt: 'desc' }, take: 30 });
    return rows.map((r) => ({ id: r.id, kind: r.kind, refId: r.refId, title: r.title, preview: r.preview }));
  },
  loadConversation: async (refId, viewer) => {
    try {
      const t = await getThread(refId, viewer);
      if (!t) return null;
      const firstUser = t.messages.find((m) => m.role === 'user');
      const content = typeof firstUser?.content === 'string' ? firstUser.content : '';
      return { title: t.summary.title, preview: content.slice(0, EXCERPT) };
    } catch {
      return null;
    }
  },
  loadDocument: async (refId, role) => {
    try {
      const doc = await documents.get(refId, role);
      if (!doc) return null;
      const prisma = await db();
      let excerpt = '';
      if (prisma) {
        const full = await prisma.document.findUnique({ where: { id: refId }, select: { extractedText: true } }).catch(() => null);
        excerpt = (full?.extractedText ?? '').replace(/\s+/g, ' ').slice(0, EXCERPT);
      }
      return { title: doc.fileName, status: doc.status, excerpt };
    } catch {
      return null;
    }
  },
  loadTender: async (refId) => {
    try {
      const { rows } = await getTenders();
      const t = rows.find((x) => x.id === refId);
      if (!t) return null;
      return { title: t.name, detail: `${t.agency} · ${t.value} · closes ${t.date} · ${t.status}` };
    } catch {
      return null;
    }
  },
  loadDrafts: async (viewer) => {
    try {
      const all = await listDrafts({ id: viewer.id, role: viewer.role });
      return all.map((d) => ({
        id: d.id, title: d.title, kind: d.kind, status: d.status,
        spaceId: (d as { spaceId?: string | null }).spaceId ?? null,
        createdBy: d.createdBy,
      }));
    } catch {
      return [];
    }
  },
  loadActivity: async (spaceId, take) => {
    try {
      const prisma = await db();
      if (!prisma) return [];
      const rows = await prisma.spaceActivity.findMany({ where: { spaceId }, orderBy: { createdAt: 'desc' }, take });
      return rows.map((r) => ({ type: r.type, actorRole: r.actorRole, summary: r.summary, createdAt: r.createdAt }));
    } catch {
      return [];
    }
  },
};

function tenderVisibleTo(role: RoleId): boolean {
  return role === 'sales' || role === 'operations' || role === 'management';
}

/** Bangun konteks space yang bounded & role-filtered. Throw 404 (tak ada / tak boleh lihat). */
export async function buildSpaceContext(
  spaceId: string,
  viewer: SpaceViewer,
  loaders: ContextLoaders = defaultLoaders,
  opts: { maxItems?: number; maxChars?: number } = {},
): Promise<SpaceContext> {
  const maxItems = opts.maxItems ?? 12;
  const maxChars = opts.maxChars ?? 3000;
  const space = await loaders.loadSpace(spaceId);
  if (!space) throw Object.assign(new Error('space not found'), { status: 404 });
  if (!canViewSpace(viewer, space)) throw Object.assign(new Error('space not found'), { status: 404 });

  const rawItems = (await loaders.loadItems(spaceId)).slice(0, 30);
  const items: SpaceContextItem[] = [];
  for (const it of rawItems) {
    if (items.length >= maxItems) break;
    if (it.kind === 'conversation') {
      const c = await loaders.loadConversation(it.refId, viewer).catch(() => null);
      if (!c) continue; // milik orang lain / terhapus — jangan bocorkan
      items.push({ kind: 'conversation', title: c.title || it.title, detail: c.preview, refId: it.refId });
    } else if (it.kind === 'document') {
      const d = await loaders.loadDocument(it.refId, viewer.role).catch(() => null);
      if (!d) continue; // di luar domain scope — jangan bocorkan
      items.push({ kind: 'document', title: d.title, detail: d.excerpt || `status: ${d.status}`, refId: it.refId });
    } else if (it.kind === 'tender') {
      if (!tenderVisibleTo(viewer.role)) continue;
      const t = await loaders.loadTender(it.refId).catch(() => null);
      if (!t) continue;
      items.push({ kind: 'tender', title: `${t.title} (${it.refId})`, detail: t.detail, refId: it.refId });
    } else if (it.kind === 'note') {
      items.push({ kind: 'note', title: it.title, detail: it.preview.slice(0, EXCERPT), refId: '' });
    }
  }

  const allDrafts = await loaders.loadDrafts(viewer).catch(() => []);
  const pendingDrafts = allDrafts
    .filter((d) => d.spaceId === spaceId && (d.status === 'draft' || d.status === 'in_review'))
    .slice(0, 10)
    .map((d) => ({ id: d.id, title: d.title, kind: d.kind, status: d.status, createdBy: d.createdBy }));

  const recentActivity = (await loaders.loadActivity(spaceId, 10).catch(() => [])).map((a) => ({
    type: a.type,
    actorRole: a.actorRole,
    summary: a.summary,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
  }));

  let truncated = rawItems.length > maxItems;
  // Budget karakter: potong detail terpanjang bila over budget.
  let size = JSON.stringify({ items, pendingDrafts, recentActivity }).length;
  if (size > maxChars) {
    truncated = true;
    for (const it of items) {
      if (size <= maxChars) break;
      const over = size - maxChars;
      if (it.detail.length > 100) {
        const cut = Math.min(it.detail.length - 100, over);
        it.detail = it.detail.slice(0, it.detail.length - cut) + '…';
        size = JSON.stringify({ items, pendingDrafts, recentActivity }).length;
      }
    }
  }

  return {
    spaceId: space.id,
    name: space.name,
    description: space.description,
    items,
    pendingDrafts,
    recentActivity,
    truncated,
  };
}
