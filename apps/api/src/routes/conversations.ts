import { Router } from 'express';
import { getThread, listConversations, parseAssistantContent } from '../services/conversations.js';
import { requireAuth, type AuthUser } from '../services/auth.js';

const r = Router();

// GET /api/conversations — thread milik sendiri dari DB (management: semua).
// DB mati → 503 eksplisit, tanpa riwayat palsu.
r.get('/', requireAuth, async (_req, res) => {
  const user = (res as unknown as { locals: { user: AuthUser } }).locals.user;
  try {
    const rows = await listConversations({ id: user.id, role: user.role });
    if (!rows) return res.status(503).json({ error: 'database unreachable' });
    res.json(rows.map((t) => ({ id: t.id, title: t.title, preview: t.preview, date: t.updatedAt, assistantId: t.assistantId })));
  } catch {
    res.status(503).json({ error: 'database unreachable' });
  }
});

// GET /api/conversations/:id — isi thread (owner/management). Pesan assistant
// di-parse bila format JSON jawaban; bila tidak, dikirim sebagai teks biasa.
// Tidak ketemu/bukan pemilik → 404; DB mati → 503.
r.get('/:id', requireAuth, async (req, res) => {
  const user = (res as unknown as { locals: { user: AuthUser } }).locals.user;
  try {
    const thread = await getThread(req.params.id, { id: user.id, role: user.role });
    if (!thread) return res.status(404).json({ error: 'not found' });
    res.json({
      ...thread.summary,
      messages: thread.messages.map((m) => {
        if (m.role !== 'assistant') return m;
        const parsed = parseAssistantContent(m.content);
        return parsed ? { ...m, answer: parsed } : m;
      }),
    });
  } catch {
    res.status(503).json({ error: 'database unreachable' });
  }
});

export default r;
