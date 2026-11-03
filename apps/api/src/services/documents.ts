import { PrismaClient } from '@prisma/client';
import {
  docVisibleToRole,
  type DocDomain,
  type DocumentExtraction,
  type ExtractionField,
  type RoleId,
} from '@street-smart/shared';

export interface DocRecord {
  id: string;
  fileName: string;
  sizeLabel: string;
  status: string;
  domain: DocDomain;
  createdAt: string;
}

function toRecord(r: { id: string; fileName: string; sizeLabel: string | null; status: string; domain: string; createdAt: Date }): DocRecord {
  return {
    id: r.id,
    fileName: r.fileName,
    sizeLabel: r.sizeLabel ?? '—',
    status: r.status,
    domain: (r.domain === 'finance' || r.domain === 'hr' ? r.domain : 'general') as DocDomain,
    createdAt: r.createdAt.toISOString(),
  };
}

function dbError(e: unknown): never {
  if (e && typeof (e as { status?: unknown }).status === 'number') throw e;
  throw Object.assign(new Error('database unreachable'), { status: 503 });
}

/**
 * Penyimpanan dokumen: Prisma/Postgres saja. DB mati → 503 eksplisit (PRD §13.3),
 * tanpa fallback memori dan tanpa data palsu.
 */
class DocumentStore {
  private prisma: PrismaClient | null = null;

  private async db(): Promise<PrismaClient> {
    if (this.prisma) return this.prisma;
    if (!process.env.DATABASE_URL) throw Object.assign(new Error('database unreachable'), { status: 503 });
    try {
      const client = new PrismaClient();
      await client.$queryRaw`SELECT 1`;
      this.prisma = client;
      return client;
    } catch (e) {
      dbError(e);
    }
  }

  /** Daftar dokumen terlihat oleh role (domain scoping). DB mati → 503, tanpa data palsu. */
  async list(role?: RoleId): Promise<DocRecord[]> {
    const visible = (d: DocDomain) => docVisibleToRole(role, d);
    const db = await this.db().catch(dbError);
    const rows = await db.document.findMany({ orderBy: { createdAt: 'desc' } }).catch(dbError);
    return rows.map(toRecord).filter((d) => visible(d.domain));
  }

  async create(input: { fileName: string; sizeLabel: string; domain?: DocDomain }): Promise<DocRecord> {
    const domain: DocDomain = input.domain === 'finance' || input.domain === 'hr' ? input.domain : 'general';
    const db = await this.db().catch(dbError);
    const row = await db.document.create({ data: { fileName: input.fileName, sizeLabel: input.sizeLabel, status: 'Processing', domain } }).catch(dbError);
    return toRecord(row);
  }

  async setStatus(id: string, status: string): Promise<void> {
    const db = await this.db().catch(() => null);
    if (!db) return;
    await db.document.update({ where: { id }, data: { status } }).catch(() => {});
  }

  async remove(id: string, role?: RoleId): Promise<DocRecord | null> {
    const cur = await this.get(id, role);
    if (!cur) return null;
    const db = await this.db().catch(dbError);
    const row = await db.document.delete({ where: { id } }).catch(() => null);
    return row ? toRecord(row) : null;
  }

  /** Get satu dokumen — hanya bila role boleh melihat domain-nya. */
  async get(id: string, role?: RoleId): Promise<DocRecord | null> {
    const db = await this.db().catch(dbError);
    const row = await db.document.findUnique({ where: { id } }).catch(dbError);
    if (!row) return null;
    const rec = toRecord(row);
    return docVisibleToRole(role, rec.domain) ? rec : null;
  }
}

export const documents = new DocumentStore();

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Baseline heuristik deterministik dari nama file — HANYA dipakai eval
 * (`eval/score-extraction.ts`) sebagai pembanding ekstraksi LLM, TIDAK dipakai
 * route mana pun (route mengembalikan data RAG asli atau 422 jujur).
 * Pola Receipt Analysis Agent: tiap field membawa confidence + source agar
 * manusia tahu mana yang terbaca langsung vs dilengkapi AI vs hilang. */
export function extractDocument(doc: DocRecord): DocumentExtraction {
  const name = doc.fileName.toLowerCase();
  if (name.includes('tender') || name.includes('nzta')) {
    return withConfidence('Government Tender', [
      { label: 'Tender ID', value: 'TND-2026-001', confidence: 0.98, source: 'extracted', needsReview: false },
      { label: 'Agency', value: 'NZ Transport Agency', confidence: 0.96, source: 'extracted', needsReview: false },
      { label: 'Closing date', value: '24 Nov 2026', confidence: 0.93, source: 'extracted', needsReview: false },
      { label: 'Est. value', value: 'NZD 1,250,000', confidence: 0.88, source: 'inferred', needsReview: true },
      { label: 'Product fit', value: 'Smartstud', confidence: 0.85, source: 'inferred', needsReview: true },
      { label: 'Requirements found', value: '14 clauses', confidence: 0.9, source: 'extracted', needsReview: false },
    ], ['Submission contact', 'Compliance checklist']);
  }
  if (name.includes('sales') || name.includes('.xls')) {
    return withConfidence('Distributor Sales', [
      { label: 'Period', value: 'Q3 2026', confidence: 0.98, source: 'extracted', needsReview: false },
      { label: 'Rows parsed', value: '8,420', confidence: 0.97, source: 'extracted', needsReview: false },
      { label: 'Regions', value: 'NZ, AU, Pacific', confidence: 0.92, source: 'extracted', needsReview: false },
      { label: 'Top SKU', value: 'Smartstud SRS-8 (+22%)', confidence: 0.84, source: 'inferred', needsReview: true },
      { label: 'Anomalies', value: '3 distributors declining', confidence: 0.8, source: 'inferred', needsReview: true },
    ], ['Declining distributor follow-up owner']);
  }
  if (name.includes('quot')) {
    return withConfidence('Quotation', [
      { label: 'Quotation No', value: 'Q-1042', confidence: 0.97, source: 'extracted', needsReview: false },
      { label: 'Total', value: 'NZD 84,500', confidence: 0.9, source: 'extracted', needsReview: false },
      { label: 'Line items', value: '6', confidence: 0.89, source: 'extracted', needsReview: false },
      { label: 'Status', value: 'Awaiting approval', confidence: 0.86, source: 'inferred', needsReview: true },
      { label: 'Linked tender', value: 'TND-2026-001', confidence: 0.78, source: 'inferred', needsReview: true },
    ], ['Approval owner', 'Validity date']);
  }
  return withConfidence('General Document', [
    { label: 'Pages/sheets', value: '—', confidence: 0.7, source: 'missing', needsReview: true },
    { label: 'Entities found', value: '—', confidence: 0.7, source: 'missing', needsReview: true },
    { label: 'Language', value: 'English', confidence: 0.9, source: 'inferred', needsReview: false },
  ], ['Document type confirmation']);
}

function withConfidence(kind: string, fields: ExtractionField[], missingFields: string[]): DocumentExtraction {
  const confidence = fields.length
    ? Math.round((fields.reduce((s, f) => s + f.confidence, 0) / fields.length) * 100) / 100
    : 0;
  return { kind, confidence, fields, missingFields };
}
