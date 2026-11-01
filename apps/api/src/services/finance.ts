import { PrismaClient } from '@prisma/client';
import {
  closeChecklist as mockChecklist,
  invoices as mockInvoices,
  type CloseCheckItem,
  type Invoice,
} from '@street-smart/shared';

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

/** Invoice + checklist dari Postgres; fallback ke mock bila DB mati. */
export async function getFinanceSnapshot(): Promise<{
  invoices: Invoice[];
  checklist: CloseCheckItem[];
  via: 'db' | 'mock';
}> {
  const prisma = await db();
  if (!prisma) return { invoices: mockInvoices, checklist: mockChecklist, via: 'mock' };
  try {
    const [inv, cc] = await Promise.all([
      prisma.invoice.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.closeCheckItem.findMany({ orderBy: { id: 'asc' } }),
    ]);
    if (!inv.length) return { invoices: mockInvoices, checklist: mockChecklist, via: 'mock' };
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
  } catch {
    return { invoices: mockInvoices, checklist: mockChecklist, via: 'mock' };
  }
}
