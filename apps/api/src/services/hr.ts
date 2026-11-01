import { PrismaClient } from '@prisma/client';
import {
  hrPolicies as mockPolicies,
  leaveRoster as mockRoster,
  type HrPolicy,
  type LeaveRow,
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

/** Policies + roster agregat dari Postgres; fallback ke mock bila DB mati. */
export async function getHrSnapshot(): Promise<{
  policies: HrPolicy[];
  roster: LeaveRow[];
  via: 'db' | 'mock';
}> {
  const prisma = await db();
  if (!prisma) return { policies: mockPolicies, roster: mockRoster, via: 'mock' };
  try {
    const [pol, ros] = await Promise.all([
      prisma.hrPolicy.findMany({ orderBy: { id: 'asc' } }),
      prisma.leaveRow.findMany({ orderBy: { id: 'asc' } }),
    ]);
    if (!pol.length) return { policies: mockPolicies, roster: mockRoster, via: 'mock' };
    return {
      policies: pol.map((p) => ({ id: p.id, topic: p.topic, title: p.title, summary: p.summary })),
      roster: ros.map((r) => ({ id: r.id, team: r.team, weekLabel: r.weekLabel, headcount: r.headcount, onLeave: r.onLeave })),
      via: 'db',
    };
  } catch {
    return { policies: mockPolicies, roster: mockRoster, via: 'mock' };
  }
}
