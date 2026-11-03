// Evaluasi kualitas jawaban copilot per role (T15-gate sebelum demo/commit besar).
// Jalankan: npm run eval:answers --workspace=apps/api
// Selalu mock (deterministik, gratis): yang diuji adalah routing assistant,
// grounding anti-halusinasi, no-leak antar-role, dan deny-duty — bukan gaya bahasa model.
// Keluar: ringkasan PASS/FAIL + eval/answer-scores.json.
import { promises as fs } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { canUseAssistant, resolveAssistant, type RoleId } from '@street-smart/shared';
import { chatWithAI } from '../src/services/llm.js';

process.env.AI_PROVIDER = 'mock';

interface Check { name: string; pass: boolean; detail: string }
const checks: Check[] = [];
const ok = (name: string, pass: boolean, detail = '') => {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

interface Case {
  name: string;
  role: RoleId;
  message: string;
  assistantId?: string;
  expectAssistant: string;
  /** Skill yang HARUS benar-benar dieksekusi (bukan klaim). */
  expectSkills?: string[];
  mustContain?: string[];
  mustNotContain?: string[];
  expectTenderIds?: 'nonempty' | 'empty';
}

const CASES: Case[] = [
  {
    name: '__ANCHOR_TENDER__ sales mendapat prioritas tender live',
    role: 'sales', message: 'Which tenders should we prioritize this month?',
    expectAssistant: 'sales-assistant', expectSkills: ['tender-search'], expectTenderIds: 'nonempty',
  },
  {
    name: '__ANCHOR_OVERDUE__ finance melihat overdue agregat (tanpa kartu tender)',
    role: 'finance', message: 'Show overdue invoices',
    expectAssistant: 'finance-assistant', expectSkills: ['invoice-lookup'], expectTenderIds: 'empty',
  },
  {
    name: 'hr menjawab dari roster live (kolom headcount)',
    role: 'hr', message: 'How many annual leave days do we get?',
    expectAssistant: 'hr-assistant', expectSkills: ['leave-policy-qa'], mustContain: ['headcount'],
  },
  {
    name: 'ops melihat status jobs live',
    role: 'ops', message: 'Which jobs are still running?',
    expectAssistant: 'ops-assistant', expectSkills: ['distributor-import-status'], mustContain: ['job'],
  },
  {
    name: 'management dapat ringkasan lintas-domain',
    role: 'management', message: 'Give me a cross-domain risk summary for this week',
    expectAssistant: 'management-assistant', expectSkills: ['cross-domain-summary'], mustContain: ['TND-'],
  },
  {
    name: 'sales tanya distributor NZ vs AU',
    role: 'sales', message: 'Compare distributor sales NZ vs AU',
    expectAssistant: 'sales-assistant', expectSkills: ['sales-compare'], mustContain: ['units', 'Australia'],
  },
  {
    name: 'sapaan dijawab singkat tanpa kartu/tombol',
    role: 'sales', message: 'hi',
    expectAssistant: 'sales-assistant', expectTenderIds: 'empty',
  },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.log('SKIP  DB tidak reachable — cek DATABASE_URL Neon dulu');
    process.exit(2);
  }
  const dbTenders = new Set((await prisma.tender.findMany({ select: { id: true } })).map((t) => t.id));
  const dbInvoices = new Set((await prisma.invoice.findMany({ select: { id: true } })).map((i) => i.id));
  // Jangkar dinamis dari DB (bukan hardcode seed): tender pertama + satu invoice overdue.
  const firstTender = await prisma.tender.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  const oneOverdue = await prisma.invoice.findFirst({ where: { status: 'OVERDUE' }, select: { id: true } });
  for (const c of CASES) {
    if (c.name.startsWith('__ANCHOR_TENDER__')) c.mustContain = [firstTender?.id ?? 'NO-TENDER-IN-DB'];
    if (c.name.startsWith('__ANCHOR_OVERDUE__')) c.mustContain = [oneOverdue?.id ?? 'NO-OVERDUE-IN-DB'];
  }

  for (const c of CASES) {
    const r = await chatWithAI(c.message, { role: c.role, assistantId: c.assistantId });
    const blob = JSON.stringify(r);
    const reasons: string[] = [];
    if (r.assistantId !== c.expectAssistant) reasons.push(`assistant=${r.assistantId ?? '?'} want ${c.expectAssistant}`);
    for (const s of c.expectSkills ?? []) {
      if (!(r.skillsUsed ?? []).includes(s)) reasons.push(`skill "${s}" not executed (got: ${(r.skillsUsed ?? []).join(',') || 'none'})`);
    }
    for (const s of c.mustContain ?? []) {
      if (!blob.toLowerCase().includes(s.toLowerCase())) reasons.push(`missing "${s}"`);
    }
    for (const s of c.mustNotContain ?? []) {
      if (blob.toLowerCase().includes(s.toLowerCase())) reasons.push(`leaked "${s}"`);
    }
    if (c.expectTenderIds === 'nonempty' && !r.tenderIds.length) reasons.push('tenderIds empty');
    if (c.expectTenderIds === 'empty' && r.tenderIds.length) reasons.push(`tenderIds should be empty: ${r.tenderIds.join(',')}`);
    const badT = r.tenderIds.filter((id) => !dbTenders.has(id));
    if (badT.length) reasons.push(`invented tender IDs: ${badT.join(',')}`);
    const mentionedInv = [...new Set(blob.match(/INV-[A-Z]+-\d+/g) ?? [])];
    const badInv = mentionedInv.filter((id) => !dbInvoices.has(id));
    if (badInv.length) reasons.push(`invented invoice IDs: ${badInv.join(',')}`);
    ok(`A: ${c.name.replace(/^__ANCHOR_\w+__ /, '')}`, reasons.length === 0, reasons.join('; ') || `assistant=${r.assistantId}, via=${r.dataVia}`);
  }

  // Deny-duty: komposisi resolve + gate (kontrak yang dipakai route & socket).
  const gate = (role: RoleId, assistantId: string) => {
    const resolved = resolveAssistant({ assistantId, role, message: 'x' });
    return canUseAssistant(role, resolved.id);
  };
  const denied =
    !gate('sales', 'finance-assistant') &&
    !gate('finance', 'sales-assistant') &&
    !gate('hr', 'sales-assistant') &&
    gate('sales', 'sales-assistant') &&
    gate('management', 'management-assistant');
  ok('B: cross-role assistant ditolak, own-role lolos', denied);

  // No-leak: sales bertanya topik finance (auto) → dijawab sales-assistant TANPA ID invoice.
  const leak = await chatWithAI('Show overdue invoices', { role: 'sales' });
  const leakIds = JSON.stringify(leak).match(/INV-[A-Z]+-\d+/g) ?? [];
  ok('C: jawaban sales tidak membocorkan ID invoice', leak.assistantId === 'sales-assistant' && leakIds.length === 0, `assistant=${leak.assistantId}, inv=${leakIds.length}`);

  const passed = checks.filter((c) => c.pass).length;
  const summary = { date: new Date().toISOString(), mode: 'mock', passed, total: checks.length, checks };
  await fs.mkdir('eval', { recursive: true }).catch(() => {});
  await fs.writeFile('eval/answer-scores.json', JSON.stringify(summary, null, 2));
  console.log(`\n${passed}/${checks.length} lolos → eval/answer-scores.json`);
  await prisma.$disconnect();
  process.exit(passed === checks.length ? 0 : 1);
}

main().catch((e) => { console.error('EVAL ERROR', e); process.exit(1); });
