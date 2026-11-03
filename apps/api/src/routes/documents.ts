import path from 'node:path';
import { promises as fs } from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { canUploadDomain, type DocDomain } from '@street-smart/shared';
import { documents, formatSize } from '../services/documents.js';
import { findStoredFile, ingestDocument, uploadsDir } from '../services/ingest.js';

import { requireAuth, type AuthUser } from '../services/auth.js';
import { extractWithLLM } from '../services/extract.js';

function roleOf(res: unknown) {
  return (res as { locals: { user: AuthUser } }).locals.user;
}

const r = Router();

const ALLOWED = new Set(['.pdf', '.xlsx', '.xls', '.csv', '.docx', '.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir()),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(ext)) return cb(new Error(`File type ${ext} is not supported`));
    cb(null, true);
  },
});

// Semua route documents wajib auth; daftar/akses difilter domain per-role
// (general: semua; finance/hr: role sepadan + management). DB mati → 503.
r.get('/', requireAuth, async (_req, res) => {
  try {
    res.json(await documents.list(roleOf(res).role));
  } catch (e) {
    const status = typeof (e as { status?: unknown })?.status === 'number' ? ((e as { status: number }).status as number) : 500;
    res.status(status).json({ error: e instanceof Error ? e.message : 'documents unavailable' });
  }
});

// POST /api/documents/upload — upload 1..n file (field: files, opsional domain)
// Aturan upload: domain finance/hr hanya untuk role sepadan + management.
r.post('/upload', requireAuth, upload.array('files', 10), async (req, res) => {
  const files = (req.files ?? []) as Express.Multer.File[];
  if (!files.length) return res.status(400).json({ error: 'no files' });
  const rawDomain = String(req.body?.domain ?? 'general').slice(0, 16);
  const domain: DocDomain = rawDomain === 'finance' || rawDomain === 'hr' ? rawDomain : 'general';
  if (!canUploadDomain(roleOf(res).role, domain)) {
    return res.status(403).json({ error: `domain '${domain}' not allowed for role '${roleOf(res).role}'` });
  }
  const created = [];
  for (const f of files) {
    const rec = await documents.create({ fileName: f.originalname, sizeLabel: formatSize(f.size), domain });
    created.push(rec);
    // Pipeline RAG asli (async): parse → chunk → embed → pgvector, lalu tandai Processed.
    // Download model embedding pertama kali bisa makan waktu — status tetap Processing.
    ingestDocument(rec.id, f.filename)
      .then((n) => console.log(`[ingest] ${f.originalname}: ${n} chunks`))
      .catch((e) => console.warn('[ingest] gagal:', f.originalname, (e as Error).message))
      .finally(() => documents.setStatus(rec.id, 'Processed'));
  }
  res.status(201).json(created);
});

// GET /api/documents/:id/extract — preview hasil ekstraksi terstruktur.
// Bila dokumen sudah di-ingest RAG, kembalikan data ASLI (teks + jumlah chunk);
// bila belum, fallback ke ekstraksi simulasi deterministik.
r.get('/:id/extract', requireAuth, async (req, res) => {
  const doc = await documents.get(req.params.id, roleOf(res).role);
  if (!doc) return res.status(404).json({ error: 'not found' });
  try {
    // PDF tanpa lapisan teks = kemungkinan hasil scan. Tesseract di image ini
    // tidak membaca PDF, jadi deteksi eksplisit lebih jujur daripada diam.
    if (doc.fileName.toLowerCase().endsWith('.pdf')) {
      const stored = await findStoredFile(doc.fileName).catch(() => null);
      if (stored) {
        const { promises: fsp } = await import('node:fs');
        const { uploadsDir: dir } = await import('../services/ingest.js');
        const st = await fsp.stat(path.join(dir(), stored)).catch(() => null);
        const { PrismaClient: PC } = await import('@prisma/client');
        const pc = new PC();
        const row = await pc.document.findUnique({ where: { id: req.params.id }, select: { extractedText: true } }).catch(() => null);
        await pc.$disconnect().catch(() => {});
        if (st && st.size > 10_240 && !(row?.extractedText ?? '').trim()) {
          return res.json({
            document: doc,
            via: 'mock',
            extraction: {
              kind: 'Scanned Document (OCR needed)',
              confidence: 0.4,
              fields: [
                { label: 'File', value: doc.fileName, confidence: 1, source: 'extracted', needsReview: false },
                { label: 'Text layer', value: 'none detected — likely a scan', confidence: 0.6, source: 'inferred', needsReview: true },
              ],
              missingFields: ['Readable text — re-upload as text PDF or sharp photo (PNG/JPG) for OCR'],
            },
          });
        }
      }
    }
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const [full, chunkCount] = await Promise.all([
      prisma.document.findUnique({ where: { id: req.params.id }, select: { extractedText: true } }),
      prisma.documentChunk.count({ where: { documentId: req.params.id } }),
    ]);
    await prisma.$disconnect();
    const textLen = full?.extractedText?.length ?? 0;
    // LLM extraction (opt-in via EXTRACT_PROVIDER=http): failure/null → static RAG below.
    if (textLen > 0 && (process.env.EXTRACT_PROVIDER ?? 'mock') === 'http') {
      const llm = await extractWithLLM(doc.fileName, full?.extractedText ?? '').catch(() => null);
      if (llm) return res.json({ document: doc, extraction: llm, via: 'http' });
    }
    if (textLen > 0 || chunkCount > 0) {
      const preview = (full?.extractedText ?? '').replace(/\s+/g, ' ').slice(0, 400);
      return res.json({
        document: doc,
        extraction: {
          kind: 'Parsed Document (RAG)',
          confidence: 1,
          fields: [
            { label: 'Characters parsed', value: textLen.toLocaleString(), confidence: 1, source: 'extracted', needsReview: false },
            { label: 'Chunks indexed', value: String(chunkCount), confidence: 1, source: 'extracted', needsReview: false },
            { label: 'Embedding', value: 'hashing deterministik · 384d (siap ganti model)', confidence: 1, source: 'extracted', needsReview: false },
            { label: 'Preview', value: preview ? `${preview}…` : '—', confidence: 0.9, source: 'extracted', needsReview: false },
          ],
          missingFields: [],
        },
      });
    }
  } catch (e) {
    const status = typeof (e as { status?: unknown })?.status === 'number' ? ((e as { status: number }).status as number) : 500;
    return res.status(status).json({ error: e instanceof Error ? e.message : 'extraction unavailable' });
  }
  // Tanpa teks terparse tidak ada yang bisa diekstrak — jujur 422, bukan angka simulasi.
  return res.status(422).json({
    document: doc,
    error: doc.status === 'Processing'
      ? 'document still processing — try again shortly'
      : 'no parseable text — re-upload as text PDF / spreadsheet, or reingest',
  });
});

// POST /api/documents/reindex — bangun ulang SEMUA vektor dengan provider aktif.
// Wajib setelah ganti EMBEDDING_PROVIDER (vektor antar-provider tidak sebanding).
// Operasi maintenance: hanya operations + management.
r.post('/reindex', requireAuth, async (_req, res) => {
  const { role } = roleOf(res);
  if (role !== 'operations' && role !== 'management') {
    return res.status(403).json({ error: 'reindex requires operations or management role' });
  }
  try {
    const { embeddingInfo } = await import('../services/embeddings.js');
    const all = await documents.list();
    let ok = 0;
    const failed: string[] = [];
    for (const d of all) {
      try {
        const stored = await findStoredFile(d.fileName);
        if (!stored) { failed.push(d.fileName); continue; }
        await documents.setStatus(d.id, 'Processing');
        await ingestDocument(d.id, stored);
        await documents.setStatus(d.id, 'Processed');
        ok++;
      } catch {
        failed.push(d.fileName);
      }
    }
    res.json({ ok, failed, provider: embeddingInfo() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/documents/:id/reingest — ulangi pipeline RAG dari file tersimpan
r.post('/:id/reingest', requireAuth, async (req, res) => {
  const doc = await documents.get(req.params.id, roleOf(res).role);
  if (!doc) return res.status(404).json({ error: 'not found' });
  const stored = await findStoredFile(doc.fileName);
  if (!stored) return res.status(404).json({ error: 'stored file missing, please re-upload' });
  await documents.setStatus(req.params.id, 'Processing');
  ingestDocument(req.params.id, stored)
    .then((n) => console.log(`[ingest] ${doc.fileName}: ${n} chunks`))
    .catch((e) => console.warn('[ingest] gagal:', doc.fileName, (e as Error).message))
    .finally(() => documents.setStatus(req.params.id, 'Processed'));
  res.json({ ok: true, status: 'Processing' });
});

// DELETE /api/documents/:id
r.delete('/:id', requireAuth, async (req, res) => {
  const rec = await documents.remove(req.params.id, roleOf(res).role);
  if (!rec) return res.status(404).json({ error: 'not found' });
  // Hapus file fisik bila ada (best-effort)
  try {
    const stored = await findStoredFile(rec.fileName);
    if (stored) await fs.unlink(path.join(uploadsDir(), stored));
  } catch { /* abaikan */ }
  res.json({ ok: true });
});

export default r;
