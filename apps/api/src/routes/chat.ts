import { Router } from 'express';
import {
  allowedAssistants,
  canUseAssistant,
  getAssistant,
  resolveAssistant,
  sqlTablesFor,
  type RoleId,
} from '@street-smart/shared';
import { chatWithAI } from '../services/llm.js';
import { appendExchange, openConversation } from '../services/conversations.js';
import { getTenders } from '../services/tenders.js';
import { getFinanceSnapshot } from '../services/finance.js';
import { getSalesSnapshot } from '../services/sales.js';
import { getHrSnapshot } from '../services/hr.js';
import { getOpsSnapshot } from '../services/ops.js';
import {
  isSqlIntent,
  mockAnswerSql,
  proposeSql,
  runValidatedSql,
  validateSql,
} from '../services/sql.js';
import { auditChat, requireAuth, type AuthUser } from '../services/auth.js';
import { chatLimiter, queryLimiter } from '../services/ratelimit.js';

const r = Router();

// POST /api/chat  { message, assistantId? } — wajib X-API-Key.
// Role diambil dari user terautentikasi (bukan dari body — cegah spoofing).
// Tanpa assistantId → infer dari pesan, lalu otorisasi terhadap role user.
r.post('/', requireAuth, chatLimiter, async (req, res) => {
  const user = (res as unknown as { locals: { user: AuthUser } }).locals.user;
  const message = String(req.body?.message ?? '').slice(0, 4000);
  if (!message.trim()) return res.status(400).json({ error: 'message is required' });
  const assistantId = typeof req.body?.assistantId === 'string' ? req.body.assistantId.slice(0, 64) : undefined;
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.slice(0, 64) : undefined;
  const conversationId = typeof req.body?.conversationId === 'string' ? req.body.conversationId.slice(0, 64) : undefined;
  if (assistantId && !getAssistant(assistantId)) {
    return res.status(400).json({ error: `unknown assistantId: ${assistantId}` });
  }
  // Resolve dulu (infer bila perlu), lalu gate — pesan error tidak membocorkan daftar role.
  const resolved = resolveAssistant({ assistantId, role: user.role, message });
  if (!canUseAssistant(user.role, resolved.id)) {
    return res.status(403).json({ error: `assistant '${resolved.id}' is not available for role '${user.role}'` });
  }
  let result: Awaited<ReturnType<typeof chatWithAI>>;
  try {
    result = await chatWithAI(message, { assistantId: resolved.id, role: user.role, sessionId });
  } catch (e) {
    // Gagal grounding (mis. DB mati) → 503 eksplisit, tanpa jawaban karangan.
    const status = typeof (e as { status?: unknown })?.status === 'number' ? ((e as { status: number }).status as number) : 500;
    return res.status(status).json({ error: e instanceof Error ? e.message : 'chat failed' });
  }
  res.setHeader('X-AI-Via', result.via);
  res.setHeader('X-Data-Via', result.dataVia);
  if (result.assistantId) res.setHeader('X-Assistant', result.assistantId);
  // Audit tanpa blokir respons; hanya preview, bukan isi penuh.
  void auditChat({ user, assistantId: result.assistantId ?? resolved.id, message, via: result.via });
  // Persist thread: lanjutkan bila id valid milik user, else buka baru. Gagal DB → tetap balas.
  let cid: string | undefined = conversationId;
  if (cid) {
    const ok = await appendExchange({ conversationId: cid, userId: user.id, role: user.role, question: message, answer: result });
    if (!ok) cid = undefined;
  }
  if (!cid) {
    cid = (await openConversation({ userId: user.id, assistantId: result.assistantId ?? resolved.id, title: message })) ?? undefined;
    if (cid) await appendExchange({ conversationId: cid, userId: user.id, role: user.role, question: message, answer: result });
  }
  res.json({ ...result, conversationId: cid ?? null });
});

// GET /api/chat/assistants — hanya assistant yang boleh dipakai role user.
r.get('/assistants', requireAuth, async (_req, res) => {
  const user = (res as unknown as { locals: { user: AuthUser } }).locals.user;
  const { SKILLS } = await import('@street-smart/shared');
  res.json({ assistants: allowedAssistants(user.role), skills: SKILLS });
});

// POST /api/chat/query { question?, sql? } — Text-to-SQL read-only.
// Tanpa `sql`: mock → rule engine; http → LLM menulis SQL lalu divalidasi.
// Dengan `sql`: dijalankan langsung SETELAH validasi allowlist (UI Database explorer).
// Tabel/kolom di luar scope role selalu 403; query destruktif selalu 400.
r.post('/query', requireAuth, queryLimiter, async (req, res) => {
  const user = (res as unknown as { locals: { user: AuthUser } }).locals.user;
  const provider = (process.env.AI_PROVIDER ?? 'mock').toLowerCase();
  try {
    if (typeof req.body?.sql === 'string' && req.body.sql.trim()) {
      validateSql(req.body.sql, user.role);
      const result = await runValidatedSql(req.body.sql, user.role);
      void auditChat({ user, assistantId: 'text-to-sql', message: req.body.sql.slice(0, 200), via: 'db' });
      return res.json({ ...result, tables: sqlTablesFor(user.role) });
    }
    const question = String(req.body?.question ?? '').slice(0, 1000);
    if (!question.trim()) return res.status(400).json({ error: 'question or sql is required' });
    if (!isSqlIntent(question)) {
      return res.status(422).json({
        error: 'not a data question — try "how many overdue invoices?" or "compare distributor sales NZ vs AU"',
        tables: sqlTablesFor(user.role),
      });
    }
    // Rule engine dulu (deterministik, gratis, offline-friendly): pola umum dijawab
    // dari snapshot live, lalu SQL-nya dijalankan ulang via validator agar 100% live.
    {
      const tables = new Set(sqlTablesFor(user.role));
      const [tenders, finance, hr, ops, sales] = await Promise.all([
        tables.has('Tender') ? getTenders(question) : Promise.resolve(null),
        tables.has('Invoice') ? getFinanceSnapshot() : Promise.resolve(null),
        tables.has('HrPolicy') || tables.has('LeaveRow') ? getHrSnapshot() : Promise.resolve(null),
        tables.has('Job') ? getOpsSnapshot() : Promise.resolve(null),
        tables.has('DistributorSale') ? getSalesSnapshot() : Promise.resolve(null),
      ]);
      const hit = mockAnswerSql(question, user.role, {
        tenders: (tenders?.rows ?? []).map((t) => ({ id: t.id, status: t.status })),
        invoices: finance?.invoices ?? [],
        checklist: finance?.checklist ?? [],
        policies: hr?.policies ?? [],
        roster: hr?.roster ?? [],
        jobs: ops?.jobs ?? [],
        docs: ops?.docs ?? { total: 0, byStatus: {}, processing: [] },
        sales: sales?.rows ?? [],
      });
      if (hit) {
        try {
          const live = await runValidatedSql(hit.sql, user.role);
          void auditChat({ user, assistantId: 'text-to-sql', message: question.slice(0, 200), via: 'db' });
          return res.json({ ...live, tables: sqlTablesFor(user.role) });
        } catch {
          void auditChat({ user, assistantId: 'text-to-sql', message: question.slice(0, 200), via: 'mock' });
          return res.json({ ...hit, tables: sqlTablesFor(user.role) });
        }
      }
    }
    if (provider === 'mock') {
      return res.status(422).json({
        error: 'pattern not covered offline — try AI mode or rephrase (e.g. "how many overdue invoices?")',
        tables: sqlTablesFor(user.role),
      });
    }
    const sql = await proposeSql(question, user.role);
    const result = await runValidatedSql(sql, user.role);
    void auditChat({ user, assistantId: 'text-to-sql', message: question.slice(0, 200), via: 'http' });
    return res.json({ ...result, tables: sqlTablesFor(user.role) });
  } catch (e) {
    const status = typeof (e as { status?: unknown })?.status === 'number' ? ((e as { status: number }).status as number) : 500;
    return res.status(status).json({ error: e instanceof Error ? e.message : 'query failed' });
  }
});

export default r;
