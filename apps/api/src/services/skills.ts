import {
  formatMoney,
  parseCloseLabel,
  type AssistantDefinition,
  type CloseCheckItem,
  type DistributorSale,
  type Draft,
  type HrPolicy,
  type Invoice,
  type JobItem,
  type LeaveRow,
  type Quotation,
  type RoleId,
  type Tender,
} from '@street-smart/shared';
import type { ChunkHit } from './retrieval.js';

// Skill yang benar-benar dieksekusi (bukan klaim di skillsUsed).
// Planning loop 2 langkah: 1) selectSkills pilih maks 3 dari intent,
// 2) executeSkills menjalankan formatter deterministik di atas snapshot live.
// Skill consequential (payment-status) TIDAK PERNAH mengeksekusi — hanya
// mengusulkan draft (maker-checker tetap di jalur drafts).

export interface SkillContext {
  message: string;
  role?: RoleId;
  liveTenders: Tender[];
  invoices: Invoice[];
  checklist: CloseCheckItem[];
  policies: HrPolicy[];
  roster: LeaveRow[];
  jobs: JobItem[];
  docs: { total: number; byStatus: Record<string, number>; processing: string[] };
  sales: DistributorSale[];
  quotations: Quotation[];
  /** Draft terlihat viewer — relasi workflow tender ↔ draft. */
  drafts: Draft[];
  chunks: ChunkHit[];
}

export interface SkillResult {
  skillId: string;
  label: string;
  /** Ringkasan terhitung dari data live — siap disuntik ke prompt model. */
  text: string;
  /** True bila tidak ada data (model diminta jujur "belum ada data"). */
  empty: boolean;
}

const TRIGGERS: Record<string, RegExp> = {
  'tender-search': /tender|prioritas|priorit|pipeline|peluang|closing|closes|tutup|auckland|wellington|christchurch|brisbane|oslo|singapore/i,
  'tender-analyze': /analy|requirement|compliance|kepatuhan|risk|risiko|syarat/i,
  'quotation-check': /quot|penawaran|awaiting approval/i,
  'sales-compare': /sales|distributor|revenue|units|quarter|q[234]\b|growth|penjualan|banding/i,
  'invoice-lookup': /invoice|tagihan|faktur|overdue|unpaid|\bar\b|\bap\b|receivable|payable/i,
  'accrual-summary': /accrual|akrual|checklist|month.end|tutup buku/i,
  'payment-status': /payment|pembayaran|bayar/i,
  'leave-policy-qa': /leave|cuti|policy|kebijakan|holiday|libur|remote|travel/i,
  'team-capacity-summary': /capacity|kapasitas|headcount|\bteam\b|\btim\b|workload|roster|hiring|rekrut/i,
  'distributor-import-status': /import|sync/i,
  'deadline-monitor': /deadline|tenggat|\bdue\b|closing soon|monitor|timeline/i,
  'doc-extract-status': /document|dokumen|extract|ekstraksi|processing|upload|\bpdf\b|\bxlsx?\b/i,
  'cross-domain-summary': /summary|ringkas|semua|kpi|management|manajemen|board|weekly|mingguan|digest|risk|risiko/i,
};

const DEFAULTS: Record<string, string[]> = {
  sales: ['tender-search'],
  finance: ['invoice-lookup'],
  hr: ['leave-policy-qa'],
  operations: ['distributor-import-status'],
  management: ['cross-domain-summary'],
  general: ['tender-search'],
};

/** Pilih maks 3 skill dari intent; fallback ke default role. text-to-sql
 * dikecualikan — ditangani jalur khusus (/api/chat/query + rule engine). */
export function selectSkills(assistant: AssistantDefinition, message: string): string[] {
  const candidates = assistant.skillIds.filter((s) => s !== 'text-to-sql');
  const scored = candidates
    .map((id) => ({ id, hit: TRIGGERS[id] ? TRIGGERS[id].test(message) : false }))
    .filter((s) => s.hit)
    .map((s) => s.id);
  const picked = scored.slice(0, 3);
  if (picked.length) return picked;
  const dflt = DEFAULTS[assistant.role] ?? DEFAULTS.general;
  return dflt.filter((id) => candidates.includes(id)).slice(0, 2);
}

function tenderLine(t: Tender): string {
  return `- ${t.id}: ${t.name} | ${t.agency} | closes ${t.date} | ${t.value} | ${t.status}`;
}

function sum(rows: { amountCents: number }[]): number {
  return rows.reduce((a, r) => a + r.amountCents, 0);
}

/** Eksekusi deterministik di atas snapshot live — pure kecuali format tanggal. */
export function executeSkills(skillIds: string[], ctx: SkillContext): SkillResult[] {
  const out: SkillResult[] = [];
  for (const id of skillIds) {
    switch (id) {
    case 'tender-search': {
        const open = ctx.liveTenders.filter((t) => !['Won', 'Lost'].includes(t.status));
        const byStatus = new Map<string, number>();
        for (const t of ctx.liveTenders) byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1);
        const withRelations = (t: Tender): string => {
          const quotes = ctx.quotations.filter((q) => q.tenderId === t.id);
          const openDrafts = ctx.drafts.filter(
            (d) => (d.tenderIds ?? []).includes(t.id) && (d.status === 'draft' || d.status === 'in_review'),
          ).length;
          const rel: string[] = [];
          if (quotes.length) rel.push(`quotes: ${quotes.map((q) => `${q.number} (${q.status})`).join(', ')}`);
          if (openDrafts) rel.push(`open drafts: ${openDrafts}`);
          return tenderLine(t) + (rel.length ? ` [${rel.join(' · ')}]` : '');
        };
        out.push({
          skillId: id,
          label: 'Tender Search',
          text: open.length
            ? `${ctx.liveTenders.length} tenders tracked (${[...byStatus.entries()].map(([s, n]) => `${n} ${s}`).join(' · ')}):\n${open.slice(0, 5).map(withRelations).join('\n')}`
            : 'No tenders in the pipeline.',
          empty: ctx.liveTenders.length === 0,
        });
        break;
      }
      case 'tender-analyze': {
        const files = [...new Set(ctx.chunks.map((h) => h.fileName))];
        out.push({
          skillId: id,
          label: 'Tender Analyze',
          text: files.length
            ? `Related tender documents indexed: ${files.join(', ')}. Requirements and risks are quoted from DOCUMENT CONTEXT.`
            : 'No tender documents indexed yet — analysis falls back to pipeline rows only.',
          empty: files.length === 0,
        });
        break;
      }
      case 'quotation-check': {
        const pending = ctx.quotations.filter((q) => q.status === 'draft' || q.status === 'sent');
        const tenderName = (qid: string | undefined): string => {
          if (!qid) return '';
          const t = ctx.liveTenders.find((x) => x.id === qid);
          return t ? ` | tender: ${t.name} (${t.status})` : ` | tender ${qid}`;
        };
        out.push({
          skillId: id,
          label: 'Quotation Check',
          text: pending.length
            ? `${pending.length} quotation(s) awaiting action:\n${pending.slice(0, 5).map((q) => `- ${q.number}: ${q.title} | ${q.partner} | ${formatMoney(q.amountCents, q.currency)} | ${q.status}${tenderName(q.tenderId)}`).join('\n')}`
            : 'No quotations awaiting action.',
          empty: pending.length === 0,
        });
        break;
      }
      case 'sales-compare': {
        const nz = ctx.sales.filter((r) => /zealand/i.test(r.country));
        const au = ctx.sales.filter((r) => /australia/i.test(r.country));
        const units = (rows: DistributorSale[]) => rows.reduce((a, r) => a + r.units, 0);
        out.push({
          skillId: id,
          label: 'Sales Compare',
          text: ctx.sales.length
            ? `NZ ${units(nz).toLocaleString()} units vs AU ${units(au).toLocaleString()} units (${ctx.sales.length} rows). Full breakdown in the distributor report.`
            : 'No distributor sales rows.',
          empty: ctx.sales.length === 0,
        });
        break;
      }
      case 'invoice-lookup': {
        const open = (d: 'AR' | 'AP') => ctx.invoices.filter((i) => i.direction === d && i.status !== 'PAID');
        const overdue = ctx.invoices.filter((i) => i.status === 'OVERDUE');
        const cur = ctx.invoices[0]?.currency ?? 'NZD';
        out.push({
          skillId: id,
          label: 'Invoice Lookup',
          text: ctx.invoices.length
            ? `Open AR ${formatMoney(sum(open('AR')), cur)} (${open('AR').length}) · open AP ${formatMoney(sum(open('AP')), cur)} (${open('AP').length})${overdue.length ? ` · OVERDUE: ${overdue.map((i) => `${i.id} (${i.partner}, due ${i.dueLabel})`).join('; ')}` : ' · nothing overdue'}.`
            : 'No invoices in the database.',
          empty: ctx.invoices.length === 0,
        });
        break;
      }
      case 'accrual-summary': {
        const done = ctx.checklist.filter((c) => c.done).length;
        const open = ctx.checklist.filter((c) => !c.done);
        out.push({
          skillId: id,
          label: 'Accrual Summary',
          text: ctx.checklist.length
            ? `Closing ${ctx.checklist[0]?.period ?? ''}: ${done}/${ctx.checklist.length} done${open.length ? ` — remaining: ${open.map((c) => c.item).join('; ')}` : ' — ready to lock'}.`
            : 'No closing checklist rows.',
          empty: ctx.checklist.length === 0,
        });
        break;
      }
      case 'payment-status': {
        // Consequential: TIDAK PERNAH dieksekusi — hanya usul draft + antrean.
        const unpaid = ctx.invoices.filter((i) => i.direction === 'AP' && i.status !== 'PAID');
        out.push({
          skillId: id,
          label: 'Payment Status',
          text: unpaid.length
            ? `Payment execution is approval-gated (never automatic). ${unpaid.length} AP invoice(s) open: ${unpaid.slice(0, 5).map((i) => `${i.id} ${formatMoney(i.amountCents, i.currency)}`).join('; ')}. Propose a payment-approval draft for a human to decide.`
            : 'No open AP invoices — nothing to propose.',
          empty: unpaid.length === 0,
        });
        break;
      }
      case 'leave-policy-qa': {
        const q = ctx.message.toLowerCase();
        const hit = ctx.policies.filter((p) => q.includes(p.topic) || q.includes(p.title.toLowerCase().split(' ')[0]));
        const list = hit.length ? hit : ctx.policies;
        out.push({
          skillId: id,
          label: 'Leave & Policy Q&A',
          text: list.length
            ? list.map((p) => `- ${p.title}: ${p.summary}`).join('\n')
            : 'No HR policies in the database.',
          empty: list.length === 0,
        });
        break;
      }
      case 'team-capacity-summary': {
        const head = ctx.roster.reduce((a, r) => a + r.headcount, 0);
        const off = ctx.roster.reduce((a, r) => a + r.onLeave, 0);
        out.push({
          skillId: id,
          label: 'Team Capacity Summary',
          text: ctx.roster.length
            ? `Aggregate: ${head} people, ${off} on leave (${ctx.roster.map((r) => `${r.team} ${r.onLeave}/${r.headcount}`).join(', ')}). Individual data never shown.`
            : 'No roster rows.',
          empty: ctx.roster.length === 0,
        });
        break;
      }
      case 'distributor-import-status': {
        const rel = ctx.jobs.filter((j) => /import|sync|distributor/i.test(`${j.name} ${j.agent}`));
        const list = rel.length ? rel : ctx.jobs;
        out.push({
          skillId: id,
          label: 'Distributor Import Status',
          text: list.length
            ? list.slice(0, 5).map((j) => `- ${j.name} | ${j.agent} | ${j.state} | last ${j.lastRun}`).join('\n')
            : 'No jobs tracked.',
          empty: list.length === 0,
        });
        break;
      }
      case 'deadline-monitor': {
        const soon = ctx.liveTenders
          .filter((t) => !['Won', 'Lost'].includes(t.status))
          .map((t) => ({ t, d: parseCloseLabel(t.date) }))
          .filter((x): x is { t: Tender; d: Date } => x.d !== null)
          .sort((a, b) => a.d.getTime() - b.d.getTime());
        out.push({
          skillId: id,
          label: 'Deadline Monitor',
          text: soon.length
            ? `Upcoming deadlines:\n${soon.slice(0, 5).map((x) => `- ${x.t.id} ${x.t.name} — closes ${x.t.date}`).join('\n')}`
            : 'No dated tenders to monitor.',
          empty: soon.length === 0,
        });
        break;
      }
      case 'doc-extract-status': {
        const proc = ctx.docs.processing;
        out.push({
          skillId: id,
          label: 'Document Extract Status',
          text: ctx.docs.total
            ? `${ctx.docs.total} documents (${Object.entries(ctx.docs.byStatus).map(([s, n]) => `${n} ${s}`).join(', ')})${proc.length ? ` — extracting: ${proc.slice(0, 3).join(', ')}` : ''}.`
            : 'No documents uploaded yet.',
          empty: ctx.docs.total === 0,
        });
        break;
      }
      case 'cross-domain-summary': {
        // Management: gabungkan skill lain, bukan baca tabel langsung.
        const parts = executeSkills(['tender-search', 'sales-compare', 'accrual-summary', 'deadline-monitor'], ctx);
        out.push({
          skillId: id,
          label: 'Cross-domain Summary',
          text: parts.map((p) => `[${p.label}] ${p.text}`).join('\n'),
          empty: parts.every((p) => p.empty),
        });
        break;
      }
      default:
        break;
    }
  }
  return out;
}
