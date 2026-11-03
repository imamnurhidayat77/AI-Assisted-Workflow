import { PrismaClient } from '@prisma/client';
import { draftToJob, type DocStats, type JobItem } from '@street-smart/shared';
import { documents } from './documents.js';
import { listDrafts } from './drafts.js';

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

export interface OpsSnapshot {
  jobs: JobItem[];
  docs: DocStats;
  via: 'db';
}

function toJobItem(r: { name: string; agent: string; state: string; trigger: string | null; lastRun: string | null; progress: string | null }): JobItem {
  return { name: r.name, agent: r.agent, state: r.state as JobItem['state'], trigger: r.trigger ?? '—', lastRun: r.lastRun ?? '—', progress: r.progress ?? '—' };
}

/** Jobs (DB + antrean draft milik viewer) + statistik dokumen. Tanpa fallback mock:
 * DB mati → 503 eksplisit. Antrean draft ikut ownership (lihat /api/drafts). */
export async function getOpsSnapshot(viewer?: { id: string; role: string }): Promise<OpsSnapshot> {
  const prisma = await db();
  if (!prisma) throw Object.assign(new Error('database unreachable'), { status: 503 });
  try {
    const [dbJobs, drafts, docs] = await Promise.all([
      prisma.job.findMany({ orderBy: { id: 'asc' } }),
      listDrafts(viewer),
      documents.list(),
    ]);
    const pending = drafts
      .filter((d) => d.status === 'draft' || d.status === 'in_review')
      .map(draftToJob);
    const byStatus: Record<string, number> = {};
    for (const d of docs) byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
    return {
      jobs: [...pending, ...dbJobs.map(toJobItem)],
      docs: {
        total: docs.length,
        byStatus,
        processing: docs.filter((d) => d.status === 'Processing').map((d) => d.fileName),
      },
      via: 'db',
    };
  } catch (e) {
    if (e && typeof (e as { status?: unknown }).status === 'number') throw e;
    throw Object.assign(new Error('database query failed'), { status: 503 });
  }
}
