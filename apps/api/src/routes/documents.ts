import path from 'node:path';
import { promises as fs } from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { documents, extractDocument, formatSize } from '../services/documents.js';
import { findStoredFile, ingestDocument, uploadsDir } from '../services/ingest.js';

const r = Router();

const ALLOWED = new Set(['.pdf', '.xlsx', '.xls', '.csv', '.docx']);

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

// GET /api/documents — daftar dokumen
r.get('/', async (_req, res) => {
  res.json(await documents.list());
});

// POST /api/documents/upload — upload 1..n file (field: files)
r.post('/upload', upload.array('files', 10), async (req, res) => {
  const files = (req.files ?? []) as Express.Multer.File[];
  if (!files.length) return res.status(400).json({ error: 'no files' });
  const created = [];
  for (const f of files) {
    const rec = await documents.create({ fileName: f.originalname, sizeLabel: formatSize(f.size) });
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
r.get('/:id/extract', async (req, res) => {
  const doc = await documents.get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'not found' });
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const [full, chunkCount] = await Promise.all([
      prisma.document.findUnique({ where: { id: req.params.id }, select: { extractedText: true } }),
      prisma.documentChunk.count({ where: { documentId: req.params.id } }),
    ]);
    await prisma.$disconnect();
    const textLen = full?.extractedText?.length ?? 0;
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
  } catch { /* fallback simulasi di bawah */ }
  res.json({ document: doc, extraction: extractDocument(doc) });
});

// POST /api/documents/:id/reingest — ulangi pipeline RAG dari file tersimpan
r.post('/:id/reingest', async (req, res) => {
  const doc = await documents.get(req.params.id);
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
r.delete('/:id', async (req, res) => {
  const rec = await documents.remove(req.params.id);
  if (!rec) return res.status(404).json({ error: 'not found' });
  // Hapus file fisik bila ada (best-effort)
  try {
    const stored = await findStoredFile(rec.fileName);
    if (stored) await fs.unlink(path.join(uploadsDir(), stored));
  } catch { /* abaikan */ }
  res.json({ ok: true });
});

export default r;
