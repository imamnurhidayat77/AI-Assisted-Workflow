import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, type AuthUser } from '../services/auth.js';

const r = Router();
const WRITE_ROLES = ['sales', 'operations', 'management'];
const HEADER = ['distributor', 'country', 'product', 'sku', 'quarter', 'units', 'amountcents', 'currency'];

/** Parse CSV sederhana (koma, tanpa quote-escape) — cukup untuk ekspor spreadsheet. */
function parseCsv(text: string): { rows: Record<string, string>[]; error?: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], error: 'csv needs a header row + at least 1 data row' };
  const head = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const missing = HEADER.filter((h) => !head.includes(h));
  if (missing.length) return { rows: [], error: `missing columns: ${missing.join(', ')}` };
  const rows = lines.slice(1, 501).map((l) => {
    const cells = l.split(',').map((c) => c.trim());
    const rec: Record<string, string> = {};
    head.forEach((h, i) => { rec[h] = cells[i] ?? ''; });
    return rec;
  });
  return { rows };
}

// POST /api/distributor/import { csv } — import baris penjualan distributor.
// Upsert natural key (distributor+country+product+sku+quarter): baris yang sudah
// ada dilewati (skipped), bukan diduplikasi.
r.post('/import', requireAuth, async (req, res) => {
  const user = (res as unknown as { locals: { user: AuthUser } }).locals.user;
  if (!WRITE_ROLES.includes(user.role)) {
    return res.status(403).json({ error: 'distributor import requires sales, operations or management role' });
  }
  if (typeof req.body?.csv !== 'string' || !req.body.csv.trim()) {
    return res.status(400).json({ error: 'csv text is required' });
  }
  const { rows, error } = parseCsv(req.body.csv);
  if (error) return res.status(400).json({ error });
  try {
    const prisma = new PrismaClient();
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r0 = rows[i];
      const units = Math.floor(Number(r0.units));
      const amountCents = Math.floor(Number(r0.amountcents));
      if (!r0.distributor || !r0.country || !r0.product || !r0.sku || !r0.quarter || !Number.isFinite(units) || !Number.isFinite(amountCents)) {
        errors.push(`row ${i + 2}: distributor/country/product/sku/quarter/units/amountCents required`);
        continue;
      }
      const exists = await prisma.distributorSale.findFirst({
        where: { distributor: r0.distributor, country: r0.country, product: r0.product, sku: r0.sku, quarter: r0.quarter },
      });
      if (exists) {
        skipped++;
        continue;
      }
      await prisma.distributorSale.create({
        data: {
          id: randomUUID(),
          distributor: r0.distributor,
          country: r0.country,
          product: r0.product,
          sku: r0.sku,
          quarter: r0.quarter,
          units,
          amountCents,
          currency: r0.currency || 'NZD',
        },
      });
      created++;
    }
    await prisma.$disconnect().catch(() => {});
    res.status(201).json({ created, skipped, errors: errors.slice(0, 10), totalErrors: errors.length });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'import failed' });
  }
});

export default r;
