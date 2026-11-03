import { PrismaClient } from '@prisma/client';
import { distributorSales as mockSales, type DistributorSale } from '@street-smart/shared';

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

export interface SalesSnapshot {
  rows: DistributorSale[];
  via: 'db' | 'mock';
}

/** Distributor sales from Postgres; mock fallback when DB is unreachable/empty. */
export async function getSalesSnapshot(): Promise<SalesSnapshot> {
  const prisma = await db();
  if (!prisma) return { rows: mockSales, via: 'mock' };
  try {
    const found = await prisma.distributorSale.findMany({ orderBy: [{ quarter: 'asc' }, { country: 'asc' }] });
    if (!found.length) return { rows: mockSales, via: 'mock' };
    return { rows: found.map((r) => ({ ...r })), via: 'db' };
  } catch {
    return { rows: mockSales, via: 'mock' };
  }
}
