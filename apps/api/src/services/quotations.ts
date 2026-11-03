import { PrismaClient } from '@prisma/client';
import type { Quotation } from '@street-smart/shared';

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

export interface QuotationSnapshot {
  rows: Quotation[];
  via: 'db';
}

/** Quotation dari Postgres. Tanpa fallback mock: DB mati → 503 eksplisit.
 * Role sales hanya melihat miliknya; ops/management melihat semua (untuk review). */
export async function getQuotationSnapshot(viewer?: { id: string; role: string }): Promise<QuotationSnapshot> {
  const prisma = await db();
  if (!prisma) throw Object.assign(new Error('database unreachable'), { status: 503 });
  try {
    const found = await prisma.quotation.findMany({ orderBy: { createdAt: 'desc' } });
    const all = found.map((q) => ({
      id: q.id,
      number: q.number,
      title: q.title,
      partner: q.partner,
      tenderId: q.tenderId ?? undefined,
      amountCents: q.amountCents,
      currency: q.currency,
      status: q.status as Quotation['status'],
      validUntil: q.validUntil ? q.validUntil.toISOString() : undefined,
      createdBy: q.createdBy ?? undefined,
      createdAt: q.createdAt.toISOString(),
      updatedAt: q.updatedAt.toISOString(),
    }));
    const rows = !viewer || viewer.role !== 'sales' ? all : all.filter((q) => !q.createdBy || q.createdBy === viewer.id);
    return { rows, via: 'db' };
  } catch (e) {
    if (e && typeof (e as { status?: unknown }).status === 'number') throw e;
    throw Object.assign(new Error('database query failed'), { status: 503 });
  }
}
