import { PrismaClient } from '@prisma/client';
import type { HrPolicy, LeaveRow } from '@street-smart/shared';

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

/** Policies + roster agregat dari Postgres. Tanpa fallback mock: DB mati → 503 eksplisit. */
export async function getHrSnapshot(): Promise<{
  policies: HrPolicy[];
  roster: LeaveRow[];
  via: 'db';
}> {
  const prisma = await db();
  if (!prisma) throw Object.assign(new Error('database unreachable'), { status: 503 });
  try {
    const [pol, ros] = await Promise.all([
      prisma.hrPolicy.findMany({ orderBy: { id: 'asc' } }),
      prisma.leaveRow.findMany({ orderBy: { id: 'asc' } }),
    ]);
    return {
      policies: pol.map((p) => ({ id: p.id, topic: p.topic, title: p.title, summary: p.summary })),
      roster: ros.map((r) => ({ id: r.id, team: r.team, weekLabel: r.weekLabel, headcount: r.headcount, onLeave: r.onLeave })),
      via: 'db',
    };
  } catch (e) {
    if (e && typeof (e as { status?: unknown }).status === 'number') throw e;
    throw Object.assign(new Error('database query failed'), { status: 503 });
  }
}
