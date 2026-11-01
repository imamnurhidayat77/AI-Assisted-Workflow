import { Router } from 'express';
import { getTenders } from '../services/tenders.js';

const r = Router();

// GET /api/tenders?q=auckland — DB-first (Postgres), fallback simulasi.
r.get('/', async (req, res) => {
  const q = String(req.query.q ?? '');
  const { rows, via } = await getTenders(q);
  res.setHeader('X-Data-Via', via);
  res.json(rows);
});

r.get('/:id', async (req, res) => {
  const { rows } = await getTenders();
  const row = rows.find((t) => t.id === req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

export default r;
