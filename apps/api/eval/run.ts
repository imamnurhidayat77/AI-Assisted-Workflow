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
    console.log('SKIP  DB tidak reachable — jalankan docker compose up -d db dulu');
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

  // 2) Documents API sehat
  const docs = await documents.list();
  ok('T2 documents API mengembalikan daftar', Array.isArray(docs) && docs.length >= 3, `${docs.length} docs`);

  // 3) RAG e2e dengan fixture (tulis file → create → ingest → retrieve → chat)
  const storedName = `${Date.now()}-eval-fixture.csv`;
  await fs.writeFile(path.join(uploadsDir(), storedName), FIXTURE_TEXT);
  const rec = await documents.create({ fileName: FIXTURE_NAME, sizeLabel: '1 KB' });
  const nChunks = await ingestDocument(rec.id, storedName);
  ok('T3 ingest fixture menghasilkan chunk', nChunks > 0, `${nChunks} chunks`);

  const hits = await retrieveChunks('berapa unit Evaluasi City Cycleway dan kapan briefing?');
  const hitFixture = hits.length > 0 && hits[0].documentId === rec.id;
  ok('T4 retrieval top-1 = dokumen fixture', hitFixture, hits.length ? `${hits[0].fileName} d=${Number(hits[0].distance).toFixed(2)}` : 'no hits');

  const r = await chatWithAI('berapa unit Evaluasi City Cycleway dan kapan briefing?');
  const citesFixture = r.sources.some((s) => s.label === FIXTURE_NAME);
  const mentions777 = JSON.stringify(r).includes('777');
  ok('T5 jawaban chat mensitasi fixture + menyebut 777', citesFixture && mentions777, `via=${r.via}`);

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
