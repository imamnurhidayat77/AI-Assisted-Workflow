import { PrismaClient } from '@prisma/client';
import type { DistributorSale } from '@street-smart/shared';

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
  via: 'db';
}

/** Distributor sales from Postgres. Tanpa fallback mock: DB mati → 503 eksplisit.
 * Tabel kosong = kondisi legit (bukan error) — caller menampilkan empty state. */
export async function getSalesSnapshot(): Promise<SalesSnapshot> {
  const prisma = await db();
  if (!prisma) throw Object.assign(new Error('database unreachable'), { status: 503 });
  try {
    const found = await prisma.distributorSale.findMany({ orderBy: [{ quarter: 'asc' }, { country: 'asc' }] });
    return { rows: found.map((r) => ({ ...r })), via: 'db' };
  } catch (e) {
    if (e && typeof (e as { status?: unknown }).status === 'number') throw e;
    throw Object.assign(new Error('database query failed'), { status: 503 });
  }
}
