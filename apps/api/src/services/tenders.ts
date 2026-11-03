import { PrismaClient } from '@prisma/client';
import type { Tender } from '@street-smart/shared';

const STATUS_LABEL: Record<string, Tender['status']> = {
  IDENTIFIED: 'Identified',
  PENDING: 'Pending',
  SUBMITTED: 'Submitted',
  WON: 'Won',
  LOST: 'Lost',
};

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

/** Ambil tender dari Postgres. Tanpa fallback mock: DB mati → 503 eksplisit.
 * Tabel kosong = kondisi legit (bukan error) — caller menampilkan empty state. */
export async function getTenders(query?: string): Promise<{ rows: Tender[]; via: 'db' }> {
  const prisma = await db();
  if (!prisma) throw Object.assign(new Error('database unreachable'), { status: 503 });
  try {
    const found = await prisma.tender.findMany({ orderBy: { createdAt: 'asc' } });
    const rows: Tender[] = found.map((t) => ({
      id: t.id,
      name: t.name,
      agency: t.agency,
      country: t.country,
      date: t.closeLabel,
      value: t.value,
      product: t.product,
      status: STATUS_LABEL[t.status] ?? 'Identified',
      priority: (t.priority as Tender['priority']) ?? undefined,
    }));
    return { rows: filterRows(rows, query), via: 'db' };
  } catch (e) {
    if (e && typeof (e as { status?: unknown }).status === 'number') throw e;
    throw Object.assign(new Error('database query failed'), { status: 503 });
  }
}

function filterRows(rows: Tender[], query?: string): Tender[] {
  const q = (query ?? '').toLowerCase().trim();
  if (!q) return rows;
  // Kata kunci umum diabaikan agar tidak memfilter habis
  const stop = new Set(['which', 'what', 'show', 'list', 'tender', 'tenders', 'the', 'should', 'prioritize', 'month', 'this', 'that', 'with', 'for', 'and', 'our', 'all']);
  const terms = q.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !stop.has(w));
  if (!terms.length) return rows;
  const hit = rows.filter((t) =>
    terms.some((w) =>
      `${t.id} ${t.name} ${t.agency} ${t.country} ${t.status} ${t.product}`.toLowerCase().includes(w),
    ),
  );
  return hit.length ? hit : rows;
}
