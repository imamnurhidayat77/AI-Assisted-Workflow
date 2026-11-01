import { Router } from 'express';
import { getAssistant, type RoleId } from '@street-smart/shared';
import { chatWithAI } from '../services/llm.js';

const r = Router();

// POST /api/chat  { message, assistantId?, role? }
// Joule-style: 1 endpoint untuk semua assistant per-role.
// Tanpa assistantId/role → infer dari pesan (backward-compat dengan FE lama).
// Provider default = simulasi (AI_PROVIDER=mock).
// Set AI_PROVIDER=http + LLM_* untuk model beneran; gagal → otomatis fallback simulasi.
r.post('/', async (req, res) => {
  const message = String(req.body?.message ?? '').slice(0, 4000);
  if (!message.trim()) return res.status(400).json({ error: 'message is required' });
  const assistantId = typeof req.body?.assistantId === 'string' ? req.body.assistantId.slice(0, 64) : undefined;
  const role = typeof req.body?.role === 'string' ? (req.body.role.slice(0, 32) as RoleId) : undefined;
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.slice(0, 64) : undefined;
  if (assistantId && !getAssistant(assistantId)) {
    return res.status(400).json({ error: `unknown assistantId: ${assistantId}` });
  }
  const result = await chatWithAI(message, { assistantId, role, sessionId });
  res.setHeader('X-AI-Via', result.via);
  res.setHeader('X-Data-Via', result.dataVia);
  if (result.assistantId) res.setHeader('X-Assistant', result.assistantId);
  res.json(result);
});

// GET /api/chat/assistants[?role=] — daftar assistant + skills (untuk pemilih role di UI).
r.get('/assistants', async (req, res) => {
  const { ASSISTANTS, SKILLS } = await import('@street-smart/shared');
  const role = typeof req.query.role === 'string' ? (req.query.role as RoleId) : undefined;
  const list = !role || role === 'general' ? ASSISTANTS : ASSISTANTS.filter((a) => a.role === role);
  res.json({ assistants: list, skills: SKILLS });
});

export default r;
