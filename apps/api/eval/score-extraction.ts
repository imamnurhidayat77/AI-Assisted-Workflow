// E2 extraction scoring: ground-truth fixtures vs extractor.
// Jalankan: npx tsx eval/score-extraction.ts [--live]   (cwd = apps/api)
// - mock (default, gratis): validitas kontrak + kindMatch + OCR recall (Tesseract lokal).
//   Deterministic extractor memetakan by filename — mock menilai pipeline, bukan isi.
// - --live: akurasi nilai field via EXTRACT_PROVIDER=http (butuh LLM_*); gate ≥ 90%.
// Keluar: tabel + eval/extraction-score.json.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { extractDocument } from '../src/services/documents.js';
import { extractWithLLM } from '../src/services/extract.js';
import { ocrImageBuffer } from '../src/services/ocr.js';
import { parseFile } from '../src/services/ingest.js';

const LIVE = process.argv.includes('--live');

interface Key {
  file: string;
  kind: string;
  expectValues?: string[];
  ocr?: boolean;
  expectTextContains?: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const digits = (s: string) => s.replace(/[^0-9]/g, '');
const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/** Cocok longgar untuk output OCR/LLM: norm-substring, atau inti digit/huruf. */
function fuzzyHas(hay: string, needle: string): boolean {
  const h = norm(hay);
  const n = norm(needle);
  if (n && h.includes(n)) return true;
  const dn = digits(needle);
  if (dn.length >= 3 && digits(hay).includes(dn)) return true;
  const ln = letters(needle);
  if (ln.length >= 4 && letters(hay).includes(ln)) return true;
  return false;
}

interface Row { file: string; kind: string; recall: number; pass: boolean; note: string }

async function main() {
  const dir = path.join('eval', 'fixtures');
  const keys = (JSON.parse(await fs.readFile(path.join(dir, 'keys.json'), 'utf-8')) as { fixtures: Key[] }).fixtures;
  const rows: Row[] = [];

  for (const k of keys) {
    const abs = path.join(dir, k.file);
    if (k.ocr) {
      const buf = await fs.readFile(abs).catch(() => null);
      const text = buf ? await ocrImageBuffer(buf) : null;
      const wants = k.expectTextContains ?? [];
      const hits = wants.filter((w) => text && fuzzyHas(text, w));
      const recall = wants.length ? hits.length / wants.length : 1;
      const pass = recall >= 2 / 3;
      rows.push({ file: k.file, kind: 'ocr', recall, pass, note: text ? `hit ${hits.length}/${wants.length}` : 'ocr unavailable' });
      console.log(`${pass ? 'PASS' : 'FAIL'}  ${k.file} recall=${recall.toFixed(2)}${text ? '' : ' (no ocr text)'}`);
      continue;
    }
    const ext = path.extname(k.file).toLowerCase();
    const content = await parseFile(abs, ext).catch(() => '');
    if (LIVE) {
      const out = await extractWithLLM(k.file, content).catch(() => null);
      if (!out) {
        rows.push({ file: k.file, kind: '?', recall: 0, pass: false, note: 'llm unavailable' });
        console.log(`FAIL  ${k.file} (llm unavailable)`);
        continue;
      }
      const blob = out.fields.map((f) => f.value).join(' | ');
      const wants = k.expectValues ?? [];
      const hits = wants.filter((w) => fuzzyHas(blob, w) || fuzzyHas(out.kind, w));
      const recall = wants.length ? hits.length / wants.length : 1;
      const pass = recall >= 0.9;
      rows.push({ file: k.file, kind: out.kind, recall, pass, note: `hit ${hits.length}/${wants.length}` });
      console.log(`${pass ? 'PASS' : 'FAIL'}  ${k.file} kind="${out.kind}" recall=${recall.toFixed(2)}`);
    } else {
      const out = extractDocument({ id: 'eval', fileName: k.file, sizeLabel: '1 KB', status: 'Processed', createdAt: new Date().toISOString() });
      const valid =
        out.confidence >= 0 && out.confidence <= 1 && out.fields.length > 0 &&
        out.fields.every((f) => f.confidence >= 0 && f.confidence <= 1 && ['extracted', 'inferred', 'missing'].includes(f.source));
      const kindMatch = out.kind === k.kind;
      const pass = valid && kindMatch;
      rows.push({ file: k.file, kind: out.kind, recall: pass ? 1 : 0, pass, note: kindMatch ? 'contract+kind ok' : `kind mismatch: ${out.kind}` });
      console.log(`${pass ? 'PASS' : 'FAIL'}  ${k.file} kind="${out.kind}"`);
    }
  }

  const accuracy = rows.length ? rows.reduce((s, r) => s + r.recall, 0) / rows.length : 0;
  const passed = rows.filter((r) => r.pass).length;
  const gate = LIVE ? accuracy >= 0.9 : passed === rows.length;
  const summary = { date: new Date().toISOString(), mode: LIVE ? 'live' : 'mock', accuracy: Math.round(accuracy * 100) / 100, passed, total: rows.length, rows };
  await fs.writeFile('eval/extraction-score.json', JSON.stringify(summary, null, 2));
  console.log(`\n${passed}/${rows.length} pass, accuracy=${summary.accuracy} → eval/extraction-score.json`);
  process.exit(gate ? 0 : 1);
}

main().catch((e) => { console.error('SCORER ERROR', e); process.exit(1); });
