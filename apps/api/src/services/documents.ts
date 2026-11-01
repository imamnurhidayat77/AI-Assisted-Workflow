import { PrismaClient } from '@prisma/client';
import type { DocumentExtraction, ExtractionField } from '@street-smart/shared';

export interface DocRecord {
  id: string;
  fileName: string;
  sizeLabel: string;
  status: string;
  createdAt: string;
}

const SEED_DOCS: DocRecord[] = [
  { id: 'seed-1', fileName: 'NZTA_Tender_2026.pdf', sizeLabel: '4.8 MB', status: 'Processed', createdAt: new Date().toISOString() },
  { id: 'seed-2', fileName: 'Distributor_Sales_Q3.xlsx', sizeLabel: '2.1 MB', status: 'Processing', createdAt: new Date().toISOString() },
  { id: 'seed-3', fileName: 'Smartstud_Quotation_1042.pdf', sizeLabel: '860 KB', status: 'Completed', createdAt: new Date().toISOString() },
];

/**
 * Penyimpanan dokumen: Prisma/Postgres kalau reachable,
 * fallback ke memori (seed sama) supaya UI tidak pernah mati.
 */
class DocumentStore {
  private prisma: PrismaClient | null = null;
  private memory: DocRecord[] = [...SEED_DOCS];
  private seq = 100;

  private async db(): Promise<PrismaClient | null> {
    if (this.prisma) return this.prisma;
    if (!process.env.DATABASE_URL) return null;
    try {
      const client = new PrismaClient();
      await client.$queryRaw`SELECT 1`;
      this.prisma = client;
      return client;
    } catch {
      return null;
    }
  }

  async list(): Promise<DocRecord[]> {
    const db = await this.db();
    if (!db) return [...this.memory].reverse();
    const rows = await db.document.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((r) => ({ id: r.id, fileName: r.fileName, sizeLabel: r.sizeLabel ?? '—', status: r.status, createdAt: r.createdAt.toISOString() }));
  }

  async create(input: { fileName: string; sizeLabel: string }): Promise<DocRecord> {
    const db = await this.db();
    if (!db) {
      const rec: DocRecord = { id: `mem-${this.seq++}`, ...input, status: 'Processing', createdAt: new Date().toISOString() };
      this.memory.push(rec);
      return rec;
    }
    const row = await db.document.create({ data: { fileName: input.fileName, sizeLabel: input.sizeLabel, status: 'Processing' } });
    return { id: row.id, fileName: row.fileName, sizeLabel: row.sizeLabel ?? '—', status: row.status, createdAt: row.createdAt.toISOString() };
  }

  async setStatus(id: string, status: string): Promise<void> {
    const db = await this.db();
    if (!db) {
      const rec = this.memory.find((d) => d.id === id);
      if (rec) rec.status = status;
      return;
    }
    await db.document.update({ where: { id }, data: { status } }).catch(() => {});
  }

  async remove(id: string): Promise<DocRecord | null> {
    const db = await this.db();
    if (!db) {
      const i = this.memory.findIndex((d) => d.id === id);
      return i >= 0 ? this.memory.splice(i, 1)[0] : null;
    }
    const row = await db.document.delete({ where: { id } }).catch(() => null);
    return row ? { id: row.id, fileName: row.fileName, sizeLabel: row.sizeLabel ?? '—', status: row.status, createdAt: row.createdAt.toISOString() } : null;
  }

  async get(id: string): Promise<DocRecord | null> {
    const all = await this.list();
    return all.find((d) => d.id === id) ?? null;
  }
}

export const documents = new DocumentStore();

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Simulasi hasil ekstraksi terstruktur — deterministik dari nama file.
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
