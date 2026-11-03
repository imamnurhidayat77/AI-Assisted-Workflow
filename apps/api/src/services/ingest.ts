import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { toSql } from 'pgvector';
import { embed } from './embeddings.js';
import { isImageExt, ocrImageBuffer } from './ocr.js';

const prisma = new PrismaClient();

/** Direktori uploads paket api — absolut, tidak tergantung cwd proses. */
export function uploadsDir(): string {
  return fileURLToPath(new URL('../../uploads', import.meta.url));
}

const CHUNK_CHARS = 1500;
const CHUNK_OVERLAP = 200;

/** Ambil teks asli dari file: PDF / Excel / CSV / Word. */
export async function parseFile(absPath: string, ext: string): Promise<string> {
  if (ext === '.pdf') {
    const { PDFParse } = await import('pdf-parse');
    const buf = await fs.readFile(absPath);
    const parser = new PDFParse({ data: buf });
    try {
      const { text } = await parser.getText();
      return (text ?? '').replace(/\s+\n/g, '\n').trim();
    } finally {
      await parser.destroy().catch(() => {});
    }
  }
  if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
    const mod = (await import('xlsx')) as unknown as { default?: typeof import('xlsx') } & typeof import('xlsx');
    const XLSX = mod.default ?? mod;
    const wb = XLSX.readFile(absPath);
    const out: string[] = [];
    for (const name of wb.SheetNames.slice(0, 8)) {
      const sheet = wb.Sheets[name];
      // Sel tanggal diformat kembali ("15 Dec 2026"), bukan serial Excel (46371)
      // — bug nyata yang merusak sitasi RAG. Sel CSV tidak membawa format `z`,
      // jadi deteksi via teks terformat `w` berpola tanggal (asumsi m/d/y ala SheetJS).
      const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const fmtDateCell = (r: number, c: number, v: number): string | number => {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })] as { w?: unknown } | undefined;
        const m = typeof cell?.w === 'string' ? cell.w.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/) : null;
        if (!m) return v;
        const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
        return `${Number(m[2])} ${MONTHS[Number(m[1]) - 1] ?? ''} ${year}`;
      };
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true }).map((row, r) =>
        (Array.isArray(row) ? row : [row]).map((c, ci) => (typeof c === 'number' ? fmtDateCell(r, ci, c) : c)),
      );
      const lines = rows
        .map((r) => (Array.isArray(r) ? r : [r]).map((c) => String(c ?? '').trim()).filter(Boolean).join(' | '))
        .filter(Boolean)
        .slice(0, 400);
      if (lines.length) out.push(`[Sheet: ${name}]\n${lines.join('\n')}`);
    }
    return out.join('\n\n').trim();
  }
  if (isImageExt(ext)) {
    try {
      const buf = await fs.readFile(absPath);
      return (await ocrImageBuffer(buf)) ?? '';
    } catch {
      return '';
    }
  }
  if (ext === '.docx') {
    const mod = (await import('mammoth')) as unknown as { default?: { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> } };
    const mammoth = mod.default ?? (mod as unknown as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> });
    const buf = await fs.readFile(absPath);
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return (value ?? '').trim();
  }
  return '';
}

export function chunkText(text: string): string[] {
  const clean = text
    .replace(/\s+/g, ' ')
    // Buang blob base64 / ID objek PDF yang lolos parse (token raksasa tanpa spasi)
    .split(' ')
    .filter((t) => t.length <= 60)
    .join(' ')
    .trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + CHUNK_CHARS, clean.length);
    chunks.push(clean.slice(start, end));
    if (end >= clean.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks.slice(0, 60); // batas aman per dokumen
}

/**
 * Pipeline ingest RAG: parse → simpan teks → chunk → embed → simpan vektor.
 * Mengembalikan jumlah chunk; 0 bila file tidak bisa dibaca (tetap Processed).
 */
export async function ingestDocument(docId: string, storedFileName: string): Promise<number> {
  const absPath = path.join(uploadsDir(), storedFileName);
  const ext = path.extname(storedFileName).toLowerCase();
  let text = '';
  try {
    text = await parseFile(absPath, ext);
  } catch (e) {
    console.warn('[ingest] parse gagal:', storedFileName, (e as Error).message);
  }
  if (!text) return 0;
  await prisma.document.update({ where: { id: docId }, data: { extractedText: text.slice(0, 200_000) } });
  const chunks = chunkText(text);
  if (!chunks.length) return 0;
  const vectors = await embed(chunks);
  // Hapus chunk lama (re-ingest aman), lalu tulis ulang sekaligus via SQL mentah
  // (kolom pgvector tidak didukung Prisma Client secara native).
  await prisma.$executeRawUnsafe(`DELETE FROM "DocumentChunk" WHERE "documentId" = ${escape(docId)}`);
  const rows = chunks
    .map((c, i) => `(${escape(`${docId}-c${i}`)}, ${escape(docId)}, ${i}, ${escape(c)}, '${toSql(vectors[i])}')`)
    .join(',');
  await prisma.$executeRawUnsafe(
    `INSERT INTO "DocumentChunk" (id, "documentId", "chunkIndex", content, embedding) VALUES ${rows}`,
  );
  return chunks.length;
}

/** Cari nama file tersimpan di uploads/ dari nama asli (multer: `${ts}-${safe}`). */
export async function findStoredFile(originalName: string): Promise<string | null> {
  const safe = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  try {
    const dir = await fs.readdir(uploadsDir());
    return dir.find((n) => n.endsWith(safe)) ?? null;
  } catch {
    return null;
  }
}

function escape(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}
