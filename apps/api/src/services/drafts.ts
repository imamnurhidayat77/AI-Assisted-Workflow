import { PrismaClient, type Prisma } from '@prisma/client';

const asJson = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));
import type { Draft, DraftHistoryEntry, DraftKind } from '@street-smart/shared';
import { canEditDraftStatus, canMoveDraftStatus, isDraftKind } from '@street-smart/shared';

/**
 * Penyimpanan Draft: Prisma/Postgres kalau reachable, fallback ke memori
 * (pola sama seperti DocumentStore supaya UI tidak pernah mati).
 * Bentuk API publik tetap sinkron-dari-luar (async) apa pun backend-nya.
 */

type Row = {
  id: string;
  kind: string;
  title: string;
  body: string;
  status: string;
  assistantId: string | null;
  skillsUsed: unknown;
  sources: unknown;
  tenderIds: unknown;
  sourceDocumentId: string | null;
  sourceDocumentName: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  history: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function toDraft(r: Row): Draft {
  const asStrings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
  const asSources = (v: unknown): { label: string; detail: string }[] =>
    Array.isArray(v)
      ? v
          .filter((s): s is { label?: unknown } => typeof (s as { label?: unknown })?.label === 'string')
          .map((s) => {
            const o = s as { label: string; detail?: unknown };
            return { label: o.label, detail: typeof o.detail === 'string' ? o.detail : '' };
          })
      : [];
  return {
    id: r.id,
    kind: (isDraftKind(r.kind) ? r.kind : 'general') as DraftKind,
    title: r.title,
    body: r.body,
    status: (['draft', 'in_review', 'approved', 'rejected'] as const).includes(r.status as Draft['status'])
      ? (r.status as Draft['status'])
      : 'draft',
    assistantId: r.assistantId ?? undefined,
    skillsUsed: asStrings(r.skillsUsed),
    sources: asSources(r.sources),
    tenderIds: asStrings(r.tenderIds),
    sourceDocumentId: r.sourceDocumentId ?? undefined,
    sourceDocumentName: r.sourceDocumentName ?? undefined,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    decidedBy: r.decidedBy ?? undefined,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : undefined,
    history: Array.isArray(r.history) ? (r.history as DraftHistoryEntry[]) : [],
  };
}

class DraftStore {
  private prisma: PrismaClient | null = null;
  private memory = new Map<string, Draft>();

  private async db(): Promise<PrismaClient | null> {
    if (this.prisma) return this.prisma;
    if (!process.env.DATABASE_URL) return null;
    try {
      const client = new PrismaClient();
      await client.$queryRaw`SELECT 1`;
      this.prisma = client;
      return client;
    } catch {
      return null;
    }
  }

  async list(): Promise<Draft[]> {
    const db = await this.db();
    if (!db) return [...this.memory.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const rows = await db.draft.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(toDraft);
  }

  async get(id: string): Promise<Draft | null> {
    const db = await this.db();
    if (!db) return this.memory.get(id) ?? null;
    const row = await db.draft.findUnique({ where: { id } });
    return row ? toDraft(row) : null;
  }

  async create(input: CreateDraftInput): Promise<Draft> {
    const title = String(input.title ?? '').trim().slice(0, 200);
    const body = String(input.body ?? '').slice(0, 20000);
    if (!title) throw Object.assign(new Error('title is required'), { status: 400 });
    if (!body.trim()) throw Object.assign(new Error('body is required'), { status: 400 });
    const kind: DraftKind = isDraftKind(input.kind) ? input.kind : 'general';
    const now = new Date().toISOString();
    const base: Draft = {
      id: `mem-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      kind,
      title,
      body,
      status: 'draft',
      assistantId: typeof input.assistantId === 'string' ? input.assistantId.slice(0, 64) : undefined,
      skillsUsed: Array.isArray(input.skillsUsed)
        ? (input.skillsUsed as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 10)
        : [],
      sources: Array.isArray(input.sources)
        ? (input.sources as { label?: unknown; detail?: unknown }[])
            .filter((s) => typeof s?.label === 'string')
            .slice(0, 6)
            .map((s) => ({ label: String(s.label).slice(0, 200), detail: String(s.detail ?? '').slice(0, 300) }))
        : [],
      tenderIds: Array.isArray(input.tenderIds)
        ? (input.tenderIds as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 10)
        : [],
      sourceDocumentId:
        typeof input.sourceDocumentId === 'string' ? input.sourceDocumentId.slice(0, 64) : undefined,
      sourceDocumentName:
        typeof input.sourceDocumentName === 'string' ? input.sourceDocumentName.slice(0, 200) : undefined,
      createdAt: now,
      updatedAt: now,
      history: [{ at: now, actor: 'ai', action: 'created' }],
    };
    const db = await this.db();
    if (!db) {
      this.memory.set(base.id, base);
      return base;
    }
    const row = await db.draft.create({
      data: {
        kind: base.kind,
        title: base.title,
        body: base.body,
        status: 'draft',
        assistantId: base.assistantId,
        skillsUsed: base.skillsUsed ?? [],
        sources: base.sources ?? [],
        tenderIds: base.tenderIds ?? [],
        sourceDocumentId: base.sourceDocumentId,
        sourceDocumentName: base.sourceDocumentName,
        history: asJson(base.history),
      },
    });
    return toDraft(row);
  }

  async edit(id: string, patch: { title?: unknown; body?: unknown }): Promise<Draft> {
    const db = await this.db();
    const cur = db ? await this.get(id) : this.memory.get(id) ?? null;
    if (!cur) throw Object.assign(new Error('not found'), { status: 404 });
    // Keputusan final tidak bisa diubah diam-diam — tolak edit setelah approved/rejected.
    if (!canEditDraftStatus(cur.status)) {
      throw Object.assign(new Error(`cannot edit ${cur.status} draft`), { status: 409 });
    }
    if (typeof patch.title === 'string' && patch.title.trim()) cur.title = patch.title.trim().slice(0, 200);
    if (typeof patch.body === 'string' && patch.body.trim()) cur.body = patch.body.slice(0, 20000);
    cur.updatedAt = new Date().toISOString();
    cur.history = [...cur.history, { at: cur.updatedAt, actor: 'human', action: 'edited' } as DraftHistoryEntry];
    if (!db) {
      this.memory.set(id, cur);
      return cur;
    }
    const row = await db.draft.update({
      where: { id },
      data: { title: cur.title, body: cur.body, history: asJson(cur.history) },
    });
    return toDraft(row);
  }

  async setStatus(id: string, to: Draft['status'], decidedBy?: unknown): Promise<Draft> {
    const db = await this.db();
    const cur = db ? await this.get(id) : this.memory.get(id) ?? null;
    if (!cur) throw Object.assign(new Error('not found'), { status: 404 });
    if (!canMoveDraftStatus(cur.status, to)) {
      throw Object.assign(new Error(`cannot move ${cur.status} → ${to}`), { status: 409 });
    }
    cur.status = to;
    if (to === 'approved' || to === 'rejected') {
      cur.decidedBy = typeof decidedBy === 'string' && decidedBy.trim() ? decidedBy.slice(0, 80) : 'human';
      cur.decidedAt = new Date().toISOString();
    } else {
      cur.decidedBy = undefined;
      cur.decidedAt = undefined;
    }
    const action = to === 'approved' ? 'approved' : to === 'rejected' ? 'rejected' : 'submitted';
    cur.updatedAt = new Date().toISOString();
    cur.history = [...cur.history, { at: cur.updatedAt, actor: 'human', action } as DraftHistoryEntry];
    if (!db) {
      this.memory.set(id, cur);
      return cur;
    }
    const row = await db.draft.update({
      where: { id },
      data: {
        status: to,
        decidedBy: cur.decidedBy ?? null,
        decidedAt: cur.decidedAt ? new Date(cur.decidedAt) : null,
        history: asJson(cur.history),
      },
    });
    return toDraft(row);
  }
}

const store = new DraftStore();

export interface CreateDraftInput {
  kind?: unknown;
  title?: unknown;
  body?: unknown;
  assistantId?: unknown;
  skillsUsed?: unknown;
  sources?: unknown;
  tenderIds?: unknown;
  sourceDocumentId?: unknown;
  sourceDocumentName?: unknown;
}

export const listDrafts = () => store.list();
export const getDraft = (id: string) => store.get(id);
export const createDraft = (input: CreateDraftInput) => store.create(input);
export const editDraft = (id: string, patch: { title?: unknown; body?: unknown }) => store.edit(id, patch);
export const setDraftStatus = (id: string, to: Draft['status'], decidedBy?: unknown) =>
  store.setStatus(id, to, decidedBy);
