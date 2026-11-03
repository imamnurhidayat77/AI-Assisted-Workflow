import dotenv from 'dotenv';
// Load .env from cwd (default behavior) + this package's own .env,
// so keys in apps/api/.env are always picked up wherever the server runs.
dotenv.config();
dotenv.config({ path: new URL('../.env', import.meta.url) });
import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth.js';
import { requireAuth } from './services/auth.js';
import { embeddingInfo } from './services/embeddings.js';
import auditRouter from './routes/audit.js';
import chatRouter from './routes/chat.js';
import conversationsRouter from './routes/conversations.js';
import tendersRouter from './routes/tenders.js';
import documentsRouter from './routes/documents.js';
import draftsRouter from './routes/drafts.js';
import spacesRouter from './routes/spaces.js';
import jobsRouter from './routes/jobs.js';
import quotationsRouter from './routes/quotations.js';
import distributorRouter from './routes/distributor.js';
import financeRouter from './routes/finance.js';
import hrRouter from './routes/hr.js';
import notificationsRouter from './routes/notifications.js';
import { initRealtime } from './realtime.js';
import { startScheduler } from './services/scheduler.js';

const app = express();
// CORS ketat: daftar origin eksplisit via CORS_ORIGINS (koma) atau WEB_URL tunggal.
// Tanpa credentials (auth pakai header X-API-Key, bukan cookie).
const allowedOrigins = (process.env.CORS_ORIGINS ?? process.env.WEB_URL ?? 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '2mb' }));
// Header keamanan minimal (tanpa dep) + sembunyikan fingerprint Express.
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.get('/health', (_req, res) => {
  // embeddingInfo sync (tanpa load model) — aman dipanggil tiap health check.
  res.json({ ok: true, service: 'street-smart-api', mode: 'mock', time: new Date().toISOString(), embedding: embeddingInfo() });
});

// Mount modular routers (mock-first, Prisma-ready)
app.use('/api/auth', authRouter);
app.use('/api/audit', auditRouter);
app.use('/api/chat', chatRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/tenders', tendersRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/drafts', draftsRouter);
app.use('/api/spaces', spacesRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/quotations', quotationsRouter);
app.use('/api/distributor', distributorRouter);
app.use('/api/finance', financeRouter);
app.use('/api/hr', hrRouter);
app.use('/api/notifications', notificationsRouter);

// Stub operasional yang tersisa sudah dihapus (alerts, reports/summary) agar tidak
// menyajikan angka palsu — tidak ada pemakai. Kembalikan sebagai route DB-backed
// bila tabel sumbernya ada. Reports dihitung live dari /api/tenders di halaman reports.

// Fallback chat lama (tetap didukung FE lama) — ikut wajib auth, lewat orchestrator
// yang sama dengan /api/chat (data live, tanpa narasi canned).
app.post('/api/chat-legacy', requireAuth, async (req, res) => {
  try {
    const { chatWithAI } = await import('./services/llm.js');
    const user = (res as unknown as { locals: { user: { id: string; role: 'sales' | 'finance' | 'hr' | 'operations' | 'management' } } }).locals.user;
    const message = String(req.body?.message ?? '');
    if (!message.trim()) return res.status(400).json({ error: 'message is required' });
    const result = await chatWithAI(message, { role: user.role });
    res.json(result);
  } catch (e) {
    const status = typeof (e as { status?: unknown })?.status === 'number' ? ((e as { status: number }).status as number) : 500;
    res.status(status).json({ error: e instanceof Error ? e.message : 'chat unavailable' });
  }
});

// Produksi menolak boot bila kredensial demo masih aktif — ganti SSO/password
// per-user dulu (lihat docs/04 §8). Dev (tanpa NODE_ENV=production) tidak terpengaruh.
if ((process.env.NODE_ENV ?? '').toLowerCase() === 'production') {
  const problems: string[] = [];
  if ((process.env.ALLOW_DEMO_LOGIN ?? 'true').toLowerCase() !== 'false') {
    problems.push('ALLOW_DEMO_LOGIN must be "false"');
  }
  if (!process.env.DUMMY_PASSWORD) problems.push('DUMMY_PASSWORD must be set (or SSO in place)');
  if (!process.env.DATABASE_URL || /localhost|streetsmart/.test(process.env.DATABASE_URL)) {
    problems.push('DATABASE_URL must point to Neon, not local docker');
  }
  if (problems.length) {
    console.error(`[api] refusing to boot in production:\n - ${problems.join('\n - ')}`);
    process.exit(1);
  }
}

const port = Number(process.env.API_PORT ?? 4000);
const httpServer = createServer(app);
initRealtime(httpServer, process.env.WEB_URL ?? 'http://localhost:3000');
// Sweep eskalasi SLA tiap jam (idempoten; butuh DATABASE_URL, diam bila mati).
startScheduler();
httpServer.listen(port, () => console.log(`[api] listening on :${port} (http + socket.io)`));
