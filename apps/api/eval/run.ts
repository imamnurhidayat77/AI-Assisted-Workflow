// Evaluasi otomatis: grounding (anti-halusinasi) + RAG retrieval + documents API.
// Jalankan: npm run eval --workspace=apps/api [--live]
// Default pakai mock (deterministik, gratis). --live pakai model asli (butuh kuota).
// Keluar: ringkasan PASS/FAIL + file JSON (eval/last-run.json) sebagai bukti deliverable.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { chatWithAI } from '../src/services/llm.js';
import { retrieveChunks } from '../src/services/retrieval.js';
import { documents } from '../src/services/documents.js';
import { ingestDocument, uploadsDir } from '../src/services/ingest.js';

const LIVE = process.argv.includes('--live');
if (!LIVE) process.env.AI_PROVIDER = 'mock';

interface Check { name: string; pass: boolean; detail: string }
const checks: Check[] = [];
const ok = (name: string, pass: boolean, detail = '') => {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const FIXTURE_NAME = 'Eval_Fixture_Cycleway.csv';
const FIXTURE_TEXT = [
  'tender_id,tender_name,units,briefing',
  'TND-EVAL-001,Evaluasi City Cycleway,777 units,15 Dec 2026',
  'TND-EVAL-002,Evaluasi Harbour Lighting,333 units,20 Dec 2026',
].join('\n');

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.log('SKIP  DB tidak reachable — cek DATABASE_URL Neon (`neon env pull`) dulu');
    process.exit(2);
  }

  // 1) Grounding: semua tenderIds jawaban harus ada di DB (anti-halusinasi)
  const dbIds = new Set((await prisma.tender.findMany({ select: { id: true } })).map((t) => t.id));
  const questions = [
    'Which tenders should we prioritize this month?',
    'Brisbane crossing',
    'quotations waiting for approval',
    'Smartstud sales NZ vs AU',
    'tender yang tutup Desember',
    'singapore tunnel',
  ];
  let invented = 0;
  for (const q of questions) {
    const r = await chatWithAI(q);
    const bad = r.tenderIds.filter((id) => !dbIds.has(id));
    invented += bad.length;
    if (bad.length) console.log(`  invented IDs for "${q}": ${bad.join(',')}`);
  }
  ok('T1 anti-halusinasi (0 ID asing dari 6 pertanyaan)', invented === 0, `asing: ${invented}`);

  // 1b) Finance live: jawaban menyebut ID invoice yang semuanya ada di DB
  const dbInvIds = new Set((await prisma.invoice.findMany({ select: { id: true } })).map((i) => i.id));
  const fin = await chatWithAI('list all open AR invoices with amounts and due dates');
  const mentioned = [...new Set((JSON.stringify(fin).match(/INV-[A-Z]+-\d+/g) ?? []))];
  const badInv = mentioned.filter((id) => !dbInvIds.has(id));
  ok('T1b finance tanpa ID invoice asing', badInv.length === 0 && mentioned.length > 0, `disebut: ${mentioned.length}, asing: ${badInv.length}, dataVia=${fin.dataVia}`);

  // 2) Documents API sehat
  const docs = await documents.list();
  ok('T2 documents API mengembalikan daftar', Array.isArray(docs) && docs.length >= 3, `${docs.length} docs`);

  // 3) RAG e2e dengan fixture (tulis file → create → ingest → retrieve → chat)
  const storedName = `${Date.now()}-eval-fixture.csv`;
  await fs.writeFile(path.join(uploadsDir(), storedName), FIXTURE_TEXT);
  const rec = await documents.create({ fileName: FIXTURE_NAME, sizeLabel: '1 KB' });
  const nChunks = await ingestDocument(rec.id, storedName);
  ok('T3 ingest fixture menghasilkan chunk', nChunks > 0, `${nChunks} chunks`);

  // T9: agregat sales DB cocok dengan hitungan chat (NZ flat 2300+2300, AU +14.4%).
  const salesRows = (await prisma.distributorSale.findMany()) as { country: string; quarter: string; units: number }[];
  const units = (c: string, q: string) => salesRows.filter((r) => r.country === c && r.quarter === q).reduce((a, r) => a + r.units, 0);
  const nzFlat = units('New Zealand', '2026-Q2') === 2300 && units('New Zealand', '2026-Q3') === 2300;
  const auQ2 = units('Australia', '2026-Q2');
  const auQ3 = units('Australia', '2026-Q3');
  const auGrowth = auQ2 ? ((auQ3 - auQ2) / auQ2) * 100 : 0;
  ok('T9 agregat sales DB sesuai narasi (NZ flat, AU ~+14%)', nzFlat && Math.abs(auGrowth - 14.4) < 0.5, `NZ ${units('New Zealand', '2026-Q2')}→${units('New Zealand', '2026-Q3')}, AU +${auGrowth.toFixed(1)}%`);

  const hits = await retrieveChunks('berapa unit Evaluasi City Cycleway dan kapan briefing?');
  const hitFixture = hits.length > 0 && hits[0].documentId === rec.id;
  ok('T4 retrieval top-1 = dokumen fixture', hitFixture, hits.length ? `${hits[0].fileName} d=${Number(hits[0].distance).toFixed(2)}` : 'no hits');

  const r = await chatWithAI('berapa unit Evaluasi City Cycleway dan kapan briefing?');
  // Label sumber live berprefix konteks ("[1] file part #N") sedangkan mock polos —
  // yang dikontrak adalah sitasi file-nya, bukan format labelnya.
  const citesFixture = r.sources.some((s) => s.label.includes(FIXTURE_NAME));
  const mentions777 = JSON.stringify(r).includes('777');
  ok('T5 jawaban chat mensitasi fixture + menyebut 777', citesFixture && mentions777, `via=${r.via}`);

  // T10: sales answer grounded on live rows (both regions mentioned, dataVia=db).
  // Mock mode returns the rule-engine table; live mode the narrative answer — both must cite live data.
  const sc = await chatWithAI('compare distributor sales New Zealand vs Australia?');
  const blob = JSON.stringify(sc);
  ok('T10 jawaban sales live: NZ + AU disebut, dataVia=db', blob.includes('New Zealand') && blob.includes('Australia') && sc.dataVia === 'db', `via=${sc.via}, dataVia=${sc.dataVia}`);

  // Cleanup: kembalikan DB + uploads ke kanonis
  await documents.remove(rec.id);
  await fs.unlink(path.join(uploadsDir(), storedName)).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "DocumentChunk" WHERE "documentId" = '${rec.id}'`);
  const leftovers = await prisma.documentChunk.count({ where: { documentId: rec.id } });
  ok('T6 cleanup fixture bersih', leftovers === 0);

  const passed = checks.filter((c) => c.pass).length;
  const summary = { date: new Date().toISOString(), mode: LIVE ? 'live' : 'mock', passed, total: checks.length, checks };
  await fs.mkdir('eval', { recursive: true }).catch(() => {});
  await fs.writeFile('eval/last-run.json', JSON.stringify(summary, null, 2));
  console.log(`\n${passed}/${checks.length} lolos → eval/last-run.json`);
  await prisma.$disconnect();
  process.exit(passed === checks.length ? 0 : 1);
}

main().catch((e) => { console.error('EVAL ERROR', e); process.exit(1); });
