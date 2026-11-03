import { PrismaClient } from '@prisma/client';
import type { CloseCheckItem, Invoice } from '@street-smart/shared';

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

/** Invoice + checklist dari Postgres. Tanpa fallback mock: DB mati → 503 eksplisit. */
export interface FinanceSnapshot {
  invoices: Invoice[];
  checklist: CloseCheckItem[];
  via: 'db';
}

export async function getFinanceSnapshot(): Promise<FinanceSnapshot> {
  const prisma = await db();
  if (!prisma) throw Object.assign(new Error('database unreachable'), { status: 503 });
  try {
    const [inv, cc] = await Promise.all([
      prisma.invoice.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.closeCheckItem.findMany({ orderBy: { id: 'asc' } }),
    ]);
    return {
      invoices: inv.map((i) => ({
        id: i.id,
        direction: i.direction as Invoice['direction'],
        partner: i.partner,
        amountCents: i.amountCents,
        currency: i.currency,
        status: i.status as Invoice['status'],
        dueLabel: i.dueLabel,
      })),
      checklist: cc.map((c) => ({ id: c.id, period: c.period, item: c.item, done: c.done, owner: c.owner })),
      via: 'db',
    };
  } catch (e) {
    if (e && typeof (e as { status?: unknown }).status === 'number') throw e;
    throw Object.assign(new Error('database query failed'), { status: 503 });
  }
}
