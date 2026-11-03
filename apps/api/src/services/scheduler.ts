import { PrismaClient, type Prisma } from '@prisma/client';
import { isDraftOverdue, wasEscalated, type DraftHistoryEntry } from '@street-smart/shared';

// Scheduler minimal dalam proses (cocok 1 proses demo; multi-instance butuh
// lock eksternal — lihat shortcut di ratelimit.ts). Tugas:
// - sweep eskalasi tiap jam: in_review melewati SLA dicatat 'escalated' SEKALI,
//   agar management tahu ada yang menggantung (fail-closed, bukan auto-approve).

const asJson = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));

function slaDays(): number {
  const n = Number(process.env.DRAFT_SLA_DAYS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
}

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

/** Quotation terkirim yang lewat validUntil → expired otomatis. Idempoten. */
export async function sweepQuotationExpiry(nowMs: number = Date.now()): Promise<number> {
  const prisma = await db();
  if (!prisma) return 0;
  try {
    const stale = await prisma.quotation.findMany({ where: { status: 'sent', validUntil: { lt: new Date(nowMs) } } });
    for (const q of stale) {
      await prisma.quotation.update({ where: { id: q.id }, data: { status: 'expired' } });
    }
    if (stale.length) console.log(`[scheduler] expired ${stale.length} quotation(s) past validUntil`);
    return stale.length;
  } catch (e) {
    console.warn('[scheduler] quotation sweep failed:', (e as Error).message);
    return 0;
  }
}

/** Satu sapuan eskalasi. Idempoten (cek history). Return jumlah yang dieskalasi. */
export async function sweepEscalations(nowMs: number = Date.now()): Promise<number> {
  const prisma = await db();
  if (!prisma) return 0;
  const sla = slaDays();
  try {
    const rows = await prisma.draft.findMany({ where: { status: 'in_review' } });
    let n = 0;
    for (const row of rows) {
      const raw: unknown = row.history;
      const history = (Array.isArray(raw) ? raw : []) as DraftHistoryEntry[];
      const draft = { status: 'in_review' as const, updatedAt: row.updatedAt.toISOString(), history };
      if (!isDraftOverdue(draft, nowMs, sla) || wasEscalated(draft)) continue;
      const entry: DraftHistoryEntry = {
        at: new Date(nowMs).toISOString(),
        actor: 'system',
        action: 'escalated',
        note: `in_review for ${sla}+ days — awaiting decision, escalated to management`,
      };
      await prisma.draft.update({
        where: { id: row.id },
        // Pertahankan updatedAt asli: @updatedAt Prisma ikut ke-bump bila tidak
        // diisi eksplisit, dan overdue dihitung dari updatedAt (aksi manusia terakhir).
        data: { history: asJson([...history, entry]), updatedAt: row.updatedAt },
      });
      n++;
    }
    if (n) console.log(`[scheduler] escalated ${n} overdue draft(s) (SLA ${sla}d)`);
    return n;
  } catch (e) {
    console.warn('[scheduler] sweep failed:', (e as Error).message);
    return 0;
  }
}

let started = false;

/** Jalankan sekali saat boot + tiap jam. Aman dipanggil berulang (sekali jalan). */
export function startScheduler(): void {
  if (started) return;
  started = true;
  void sweepEscalations();
  void sweepQuotationExpiry();
  setInterval(() => {
    void sweepEscalations();
    void sweepQuotationExpiry();
  }, 3_600_000).unref?.();
}
