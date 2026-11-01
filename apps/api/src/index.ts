import dotenv from 'dotenv';
// Load .env from cwd (default behavior) + this package's own .env,
// so keys in apps/api/.env are always picked up wherever the server runs.
dotenv.config();
dotenv.config({ path: new URL('../.env', import.meta.url) });
import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { alerts, conversationHistory, mockChatAnswer, tenders } from '@street-smart/shared';
import chatRouter from './routes/chat.js';
import tendersRouter from './routes/tenders.js';
import documentsRouter from './routes/documents.js';
import draftsRouter from './routes/drafts.js';
import jobsRouter from './routes/jobs.js';
import { initRealtime } from './realtime.js';

const app = express();
app.use(cors({ origin: process.env.WEB_URL ?? 'http://localhost:3000' }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'street-smart-api', mode: 'mock', time: new Date().toISOString() });
});

// Mount modular routers (mock-first, Prisma-ready)
app.use('/api/chat', chatRouter);
app.use('/api/tenders', tendersRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/drafts', draftsRouter);
app.use('/api/jobs', jobsRouter);

// Simple inline stubs — dipindah ke routes/ saat berkembang
app.get('/api/conversations', (_req, res) => res.json(conversationHistory));
app.get('/api/alerts', (_req, res) => res.json(alerts));
app.get('/api/reports/summary', (_req, res) => {
  res.json({
    kpis: [
      { value: '1,248', label: 'Total tenders', change: '+8.4% YoY' },
      { value: 'NZD 8.42M', label: 'Active pipeline', change: '+12.1%' },
      { value: '34.8%', label: 'Success rate', change: '+3.2 pts' },
      { value: '42', label: 'Closing this month', change: '8 high priority' },
    ],
    monthly: [420, 580, 490, 760, 640, 920, 710, 1040],
    byCountry: [
      { name: 'New Zealand', share: 42 },
      { name: 'Australia', share: 27 },
      { name: 'Asia Pacific', share: 18 },
      { name: 'Europe', share: 13 },
    ],
  });
});

// Fallback chat lama (tetap didukung FE lama)
app.post('/api/chat-legacy', (req, res) => {
  const message = String(req.body?.message ?? '');
  const answer = mockChatAnswer(message);
  const matched = tenders.filter((t) => answer.tenderIds.includes(t.id));
  res.json({ ...answer, tenders: matched });
});

const port = Number(process.env.API_PORT ?? 4000);
const httpServer = createServer(app);
initRealtime(httpServer, process.env.WEB_URL ?? 'http://localhost:3000');
httpServer.listen(port, () => console.log(`[api] listening on :${port} (http + socket.io)`));
