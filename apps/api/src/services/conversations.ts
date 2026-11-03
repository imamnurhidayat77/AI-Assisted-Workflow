import { PrismaClient } from '@prisma/client';
import type { ChatResponse } from '@street-smart/shared';

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

export interface ThreadMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

export interface ThreadSummary {
  id: string;
  title: string;
  preview: string;
  assistantId?: string;
  updatedAt: string;
}

function canSee(createdBy: string | null, viewer: { id: string; role: string }): boolean {
  return viewer.role === 'management' || !createdBy || createdBy === viewer.id;
}

function dbError(e: unknown): never {
  if (e && typeof (e as { status?: unknown }).status === 'number') throw e;
  throw Object.assign(new Error('database unreachable'), { status: 503 });
}

/** Daftar thread milik user (management: semua). DB mati → 503 (tanpa riwayat palsu). */
export async function listConversations(viewer: { id: string; role: string }): Promise<ThreadSummary[] | null> {
  const prisma = await db();
  if (!prisma) throw Object.assign(new Error('database unreachable'), { status: 503 });
  try {
    const rows = await prisma.conversation.findMany({ orderBy: { updatedAt: 'desc' }, take: 100 });
    return rows
      .filter((r) => canSee(r.createdBy, viewer))
      .map((r) => ({
        id: r.id,
        title: r.title,
        preview: r.preview ?? '',
        assistantId: r.assistantId ?? undefined,
        updatedAt: r.updatedAt.toISOString(),
      }));
  } catch (e) {
    dbError(e);
  }
}

/** Isi thread (owner/management). Null bila tidak ada / bukan pemilik; DB mati → 503. */
export async function getThread(id: string, viewer: { id: string; role: string }): Promise<{ summary: ThreadSummary; messages: ThreadMessage[] } | null> {
  const prisma = await db();
  if (!prisma) throw Object.assign(new Error('database unreachable'), { status: 503 });
  try {
    const row = await prisma.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!row || !canSee(row.createdBy, viewer)) return null;
    return {
      summary: {
        id: row.id,
        title: row.title,
        preview: row.preview ?? '',
        assistantId: row.assistantId ?? undefined,
        updatedAt: row.updatedAt.toISOString(),
      },
      messages: row.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt.toISOString() })),
    };
  } catch (e) {
    dbError(e);
  }
}

/** Buka thread baru untuk user. */
export async function openConversation(input: { userId: string; assistantId?: string; title: string }): Promise<string | null> {
  const prisma = await db();
  if (!prisma) return null;
  try {
    const row = await prisma.conversation.create({
      data: {
        title: input.title.slice(0, 120),
        preview: '',
        createdBy: input.userId,
        assistantId: input.assistantId,
      },
    });
    return row.id;
  } catch {
    return null;
  }
}

/** Simpan 1 exchange (user + jawaban AI) + update preview. Fire-and-forget aman:
 * mengembalikan false bila thread bukan milik user (jangan simpan) atau DB mati. */
export async function appendExchange(input: {
  conversationId: string;
  userId: string;
  role: string;
  question: string;
  answer: ChatResponse & { assistantId?: string };
}): Promise<boolean> {
  const prisma = await db();
  if (!prisma) return false;
  try {
    const conv = await prisma.conversation.findUnique({ where: { id: input.conversationId } });
    if (!conv || !canSee(conv.createdBy, { id: input.userId, role: input.role })) return false;
    const preview = input.answer.answerTitle || input.question.slice(0, 120);
    await prisma.$transaction([
      prisma.message.create({ data: { conversationId: input.conversationId, role: 'user', content: input.question.slice(0, 4000) } }),
      prisma.message.create({
        data: {
          conversationId: input.conversationId,
          role: 'assistant',
          content: JSON.stringify({
            answerTitle: input.answer.answerTitle,
            answerCopy: input.answer.answerCopy,
            tenderIds: input.answer.tenderIds ?? [],
            recommendation: input.answer.recommendation ?? '',
            sources: (input.answer.sources ?? []).slice(0, 6),
            followUps: (input.answer.followUps ?? []).slice(0, 4),
            assistantId: input.answer.assistantId,
            skillsUsed: input.answer.skillsUsed ?? [],
          }).slice(0, 20000),
        },
      }),
      prisma.conversation.update({
        where: { id: input.conversationId },
        data: { preview: preview.slice(0, 200), assistantId: input.answer.assistantId ?? conv.assistantId },
      }),
    ]);
    return true;
  } catch (e) {
    console.warn('[conversations] append gagal:', (e as Error).message);
    return false;
  }
}

/** Parse konten pesan assistant yang tersimpan (JSON) — null bila teks biasa/rusak. */
export function parseAssistantContent(content: string): (ChatResponse & { assistantId?: string }) | null {
  try {
    const o = JSON.parse(content) as Record<string, unknown>;
    if (typeof o.answerTitle !== 'string' || typeof o.answerCopy !== 'string') return null;
    return {
      answerTitle: o.answerTitle,
      answerCopy: o.answerCopy,
      tenderIds: Array.isArray(o.tenderIds) ? o.tenderIds.filter((t): t is string => typeof t === 'string') : [],
      recommendation: typeof o.recommendation === 'string' ? o.recommendation : '',
      sources: Array.isArray(o.sources) ? (o.sources as ChatResponse['sources']) : [],
      followUps: Array.isArray(o.followUps) ? o.followUps.filter((f): f is string => typeof f === 'string') : [],
      assistantId: typeof o.assistantId === 'string' ? o.assistantId : undefined,
      skillsUsed: Array.isArray(o.skillsUsed) ? o.skillsUsed.filter((s): s is string => typeof s === 'string') : [],
    };
  } catch {
    return null;
  }
}
