import { randomUUID } from 'node:crypto';
import {
  financeAnswer,
  greetingAnswer,
  hrAnswer,
  isGreeting,
  opsAnswer,
  resolveAssistant,
  salesAnswer,
  sanitizeActions,
  type Draft,
  type ChatResponse,
  type CloseCheckItem,
  type DistributorSale,
  type DocStats,
  type HrPolicy,
  type Invoice,
  type JobItem,
  type LeaveRow,
  type Quotation,
  type RoleId,
  type Tender,
} from '@street-smart/shared';
import { getTenders } from './tenders.js';
import { listDrafts } from './drafts.js';
import { getFinanceSnapshot, type FinanceSnapshot } from './finance.js';
import { getSalesSnapshot } from './sales.js';
import { getHrSnapshot } from './hr.js';
import { getOpsSnapshot } from './ops.js';
import { getQuotationSnapshot } from './quotations.js';
import { executeSkills, selectSkills, type SkillResult } from './skills.js';
import { formatSpaceContext, hasSpaceContent, type SpaceContext } from './spaceContext.js';
import { isSqlIntent, mockAnswerSql } from './sql.js';
import { isDocIntent, recentChunks, retrieveChunks, type ChunkHit } from './retrieval.js';

export interface DomainSnapshots {
  invoices: Invoice[];
  checklist: CloseCheckItem[];
  policies: HrPolicy[];
  roster: LeaveRow[];
  jobs: JobItem[];
  docs: DocStats;
  sales: DistributorSale[];
  financeVia: 'db' | 'mock';
  hrVia: 'db' | 'mock';
  opsVia: 'db' | 'mock';
  salesVia: 'db' | 'mock';
}

export interface ChatOpts {
  assistantId?: string;
  role?: RoleId;
  /** AppUser.id — untuk scoping quotations milik sendiri (sales). */
  userId?: string;
  /** Konteks space aktif (sudah role-filtered oleh requireSpaceContext). */
  spaceContext?: SpaceContext | null;
  /** Progress callback for realtime (Socket.IO) updates. */
  onStage?: (stage: ChatStage) => void;
  /** Per-conversation client session id (gateway routing + prompt caching). */
  sessionId?: string;
}

// Orkestrasi chat mengikuti kontrak 6 tahap (T10):
//  1. resolve assistant (route, resolveAssistant) → 2. enforce role (route + socket,
//     canUseAssistant) → 3. select grounding path (assistant.dataScopes, di bawah) →
//  4. retrieve context (gatherGrounding: structured + doc + template) →
//  5. compose answer (chatWithMock / chatWithHttp) → 6. persist + audit (route).
// Tahap 1–2 dan 6 hidup di route (sumber kebenaran untuk auth); file ini tahap 3–5.

/** Konteks grounding hasil tahap 4: structured snapshots + doc chunks + template. */
export interface GroundingContext {
  liveTenders: Tender[];
  tenderVia: 'db' | 'mock';
  snap: DomainSnapshots;
  dataVia: 'db' | 'mock';
  chunks: ChunkHit[];
  templateFiles: string[];
  quotations: Quotation[];
  /** Draft terlihat viewer — untuk relasi workflow (tender ↔ draft). */
  drafts: Draft[];
}

export type ChatStage = 'tenders' | 'docs' | 'ai' | 'done';

// Stable per-process session (required by OpenCode Go for routing + prompt caching).
const OPENCODE_SESSION = process.env.LLM_SESSION_ID ?? randomUUID();

export interface LlmChatResult extends ChatResponse {
  tenders: Tender[];
  /** 'mock' = simulated data, 'http' = real model via API */
  via: 'mock' | 'http';
  /** grounding data source: 'db' = real Postgres, 'mock' = simulation fallback */
  dataVia: 'db' | 'mock';
}

const SIMULATED_LATENCY_MS = 600;

/** Tahap 3 (select grounding path) + 4 (retrieve context).
 * Per-assistant grounding (least-privilege): live tenders only for
 * sales/management/ops; finance/hr ground on DB snapshots + documents. */
export async function gatherGrounding(
  message: string,
  assistant: { dataScopes: string[] },
  onStage?: (stage: ChatStage) => void,
  viewer?: { id: string; role: RoleId },
): Promise<GroundingContext> {
  const needsTenders = assistant.dataScopes.includes('tenders');
  const needsFinance = assistant.dataScopes.includes('invoices_ar_ap');
  const needsHr = assistant.dataScopes.includes('hr_policies');
  const needsOps = assistant.dataScopes.includes('jobs');
  const needsSales = assistant.dataScopes.includes('distributor_sales');
  const needsQuotations = assistant.dataScopes.includes('quotations');
  const needsDrafts = needsTenders || needsQuotations;
  const { rows: liveTenders, via: tenderVia } = needsTenders
    ? await getTenders(message)
    : { rows: [], via: 'mock' as const };
  const [finance, hr, ops, sales, quotations, drafts] = await Promise.all([
    needsFinance ? getFinanceSnapshot() : Promise.resolve(null),
    needsHr ? getHrSnapshot() : Promise.resolve(null),
    needsOps ? getOpsSnapshot() : Promise.resolve(null),
    needsSales ? getSalesSnapshot() : Promise.resolve(null),
    needsQuotations ? getQuotationSnapshot(viewer) : Promise.resolve(null),
    needsDrafts && viewer ? listDrafts(viewer).catch(() => []) : Promise.resolve([]),
  ]);
  const snap: DomainSnapshots = {
    invoices: finance?.invoices ?? [],
    checklist: finance?.checklist ?? [],
    policies: hr?.policies ?? [],
    roster: hr?.roster ?? [],
    jobs: ops?.jobs ?? [],
    docs: ops?.docs ?? { total: 0, byStatus: {}, processing: [] },
    sales: sales?.rows ?? [],
    financeVia: finance?.via ?? 'mock',
    hrVia: hr?.via ?? 'mock',
    opsVia: ops?.via ?? 'mock',
    salesVia: sales?.via ?? 'mock',
  };
  const dataVia = needsTenders ? tenderVia : needsFinance ? snap.financeVia : needsHr ? snap.hrVia : needsOps ? snap.opsVia : needsSales ? snap.salesVia : ('mock' as const);
  onStage?.('tenders');
  // Most relevant document chunks (empty when no chunks / DB down).
  const chunks = await retrieveChunks(message);
  // Template learning: brief/draft/RFP intent → contoh struktur dari dokumen lampau
  // ikut diambil agar jawaban meniru bentuknya (diisi live data).
  const briefIntent = /(brief|draft|\bRFP\b|template|proposal|quotation|tender response|approval summary)/i.test(message);
  let templateFiles: string[] = [];
  if (briefIntent) {
    const extra = await retrieveChunks(`${message} template structure sections headings`, 3);
    const seen = new Set(chunks.map((h) => `${h.documentId}#${h.chunkIndex}`));
    for (const h of extra) {
      const k = `${h.documentId}#${h.chunkIndex}`;
      if (!seen.has(k)) {
        seen.add(k);
        chunks.push(h);
      }
    }
    templateFiles = [...new Set(chunks.map((h) => h.fileName))].slice(0, 3);
  }
  return { liveTenders, tenderVia, snap, dataVia, chunks, templateFiles, quotations: quotations?.rows ?? [], drafts };
}

/**
 * Single AI entry point. Default: simulation (no API key, no cost).
 * For the real model (e.g. muse-spark via API key):
 *   AI_PROVIDER=http LLM_BASE_URL=... LLM_API_KEY=... LLM_MODEL=...
 */
export async function chatWithAI(message: string, opts: ChatOpts = {}): Promise<LlmChatResult> {
  const provider = (process.env.AI_PROVIDER ?? 'mock').toLowerCase();
  // Joule-style routing: 1 copilot → assistant per-role. Default = assistant role user
  // (infer dari pesan hanya bila role tak dikenal — backward-compat).
  const assistant = resolveAssistant({ assistantId: opts.assistantId, role: opts.role, message });
  // Tahap 3–4: pilih jalur grounding dari dataScopes + ambil konteks.
  const { liveTenders, snap, dataVia, chunks, templateFiles, quotations, drafts } = await gatherGrounding(
    message,
    assistant,
    opts.onStage,
    opts.role && opts.userId ? { id: opts.userId, role: opts.role } : undefined,
  );
  // Planning loop langkah 1–2: pilih skill dari intent, eksekusi di atas snapshot live.
  const skillIds = selectSkills(assistant, message);
  const skillOutputs = executeSkills(skillIds, {
    message,
    role: opts.role,
    liveTenders,
    invoices: snap.invoices,
    checklist: snap.checklist,
    policies: snap.policies,
    roster: snap.roster,
    jobs: snap.jobs,
    docs: snap.docs,
    sales: snap.sales,
    quotations,
    drafts,
    chunks,
  });
  const spaceCtx = hasSpaceContent(opts.spaceContext) ? opts.spaceContext! : null;
  const spaceLines = spaceCtx ? formatSpaceContext(spaceCtx) : [];
  // Document intent ("the document I just uploaded"): top up with newest chunks
  // so general document questions still get answered despite low word overlap.
  const docIntent = isDocIntent(message);
  if (docIntent) {
    const recent = await recentChunks(4);
    const seen = new Set(chunks.map((c) => `${c.documentId}#${c.chunkIndex}`));
    for (const r of recent) {
      if (chunks.length >= 4) break;
      const k = `${r.documentId}#${r.chunkIndex}`;
      if (!seen.has(k)) { seen.add(k); chunks.push(r); }
    }
  }
  opts.onStage?.('docs');
  // Sitasi wajib bila space aktif dan berisi konten (bukan klaim model).
  const citeSpace = <T extends { sources: { label: string; detail: string }[] }>(r: T): T => {
    if (!spaceCtx) return r;
    if (r.sources.some((s) => s.label.startsWith('Space context:'))) return r;
    return {
      ...r,
      sources: [
        { label: `Space context: ${spaceCtx.name}`, detail: `${spaceCtx.items.length} items · ${spaceCtx.pendingDrafts.length} pending drafts` },
        ...r.sources,
      ].slice(0, 6),
    };
  };
  if (provider !== 'mock') {
    opts.onStage?.('ai');
    try {
      const res = await chatWithHttp(message, liveTenders, chunks, assistant.id, assistant.systemPrompt, skillOutputs, opts.sessionId, templateFiles, skillIds, spaceLines);
      opts.onStage?.('done');
      return { ...citeSpace(res), dataVia };
    } catch (err) {
      // PRD §13.3: provider http gagal = 503 eksplisit, JANGAN diam-diam ke simulasi.
      throw Object.assign(new Error(`AI provider unreachable: ${(err as Error).message}`), { status: 503 });
    }
  }
  await new Promise((r) => setTimeout(r, SIMULATED_LATENCY_MS));
  opts.onStage?.('done');
  const mocked = chatWithMock(message, liveTenders, chunks, assistant.id, snap, opts.role, templateFiles);
  // skillsUsed jujur: gabungan builder + skill yang benar dieksekusi di atas.
  // Builder tanpa skills (greeting/no-data) dibiarkan kosong — memang tidak ada yang jalan.
  if (mocked.skillsUsed && mocked.skillsUsed.length) {
    mocked.skillsUsed = [...new Set([...mocked.skillsUsed, ...skillIds])].slice(0, 6);
  }
  // Tahap 5 (mock): actions kontekstual bila builder tidak mengisi sendiri.
  // Greeting/no-data/doc-only → [] (tidak ada tombol).
  if (!mocked.actions) {
    const hasT = mocked.tenderIds.length > 0;
    const act = assistant.id;
    mocked.actions =
      hasT ? [
        { label: 'Prepare tender brief', kind: 'draft', draftKind: 'tender-brief' as const },
        { label: 'Open tender pipeline', kind: 'link', href: '/data' as const },
      ]
      : act === 'finance-assistant' ? [
        { label: 'Draft payment approval', kind: 'draft', draftKind: 'payment-approval' as const },
      ]
      : act === 'management-assistant' ? [
        { label: 'Draft management brief', kind: 'draft', draftKind: 'general' as const },
        { label: 'Open executive overview', kind: 'link', href: '/executive' as const },
      ]
      : act === 'ops-assistant' ? [{ label: 'Open jobs queue', kind: 'link', href: '/jobs' as const }]
      : act === 'sales-assistant' ? [{ label: 'Open distributor report', kind: 'link', href: '/reports' as const }]
      : [];
  }
  return { ...citeSpace(mocked), dataVia };
}

/** Document-intent answer — never falls back to generic tender cards. English only. */
function docAnswer(message: string, chunks: ChunkHit[]): Omit<LlmChatResult, 'dataVia'> {
  const files = [...new Set(chunks.map((h) => h.fileName))];
  const sources = chunks.map((h) => ({ label: h.fileName, detail: `part #${h.chunkIndex + 1}` }));
  if (!chunks.length) {
    return {
      answerTitle: 'No documents available to read yet',
      answerCopy: 'Upload a document on the Document ingestion page first and wait until it is Processed, then ask me again — I will read it for you.',
      tenderIds: [],
      recommendation: '',
      sources: [],
      followUps: ['Open Document ingestion', 'Which documents are supported?', 'Example tender questions'],
      tenders: [],
      via: 'mock',
    };
  }
  const first = chunks[0];
  return {
    answerTitle: `Yes, I can read ${first.fileName}`,
    answerCopy: `Latest documents: ${files.join(', ')}. It contains, among others: "${first.content.slice(0, 280)}…" Ask me anything in detail about these documents.`,
    tenderIds: [],
    recommendation: '',
    sources,
    followUps: ['Summarize this document', 'Any tender matching this document?', 'Which documents have been processed?'],
    tenders: [],
    via: 'mock',
  };
}

/** Explicit empty-state: DB hidup tapi tabel domain kosong. Jujur, tanpa angka karangan. */
function noDataAnswer(assistantId: string, copy: string, liveTenders: Tender[]): Omit<LlmChatResult, 'dataVia'> {
  return {
    answerTitle: 'No data yet',
    answerCopy: copy,
    tenderIds: [],
    recommendation: 'Add the source records first, then ask again.',
    sources: [],
    followUps: ['What data is available?', 'Show the database explorer'],
    assistantId,
    skillsUsed: [],
    tenders: [],
    via: 'mock',
  };
}

/** Prioritas tender dihitung murni dari baris live: hitung per status + 3 teratas (urutan DB). */
function tenderPriorityAnswer(liveTenders: Tender[], assistantId: string): ChatResponse {
  const byStatus: Record<string, number> = {};
  for (const t of liveTenders) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  const top = liveTenders.slice(0, 3);
  return {
    answerTitle: top.length ? 'Priorities from the live pipeline' : 'No tenders in the pipeline',
    answerCopy: top.length
      ? `${liveTenders.length} tenders tracked (${Object.entries(byStatus)
        .map(([s, n]) => `${n} ${s}`)
        .join(' · ')}).\n\n` +
        top.map((t, i) => `${i + 1}. ${t.id} — ${t.name} (${t.agency}, closes ${t.date}, ${t.value})`).join('\n')
      : 'The tender pipeline is empty.',
    tenderIds: top.map((t) => t.id),
    recommendation: top.length
      ? `Start with ${top[0].id} and work down the list; check compliance docs for each.`
      : 'Add tenders first, then ask for priorities.',
    sources: top.map((t) => ({ label: `Tender Pipeline / ${t.id}`, detail: 'Live database row' })),
    followUps: ['Show deadlines on a timeline', 'Which tenders close soonest?', 'Compare the technical requirements'],
    assistantId,
    skillsUsed: ['tender-search'],
  };
}

function chatWithMock(
  message: string,
  liveTenders: Tender[],
  chunks: ChunkHit[],
  assistantId: string,
  snap: DomainSnapshots,
  role?: RoleId,
  templateFiles: string[] = [],
): Omit<LlmChatResult, 'dataVia'> {
  // Sapaan/basa-basi → jawaban singkat, tanpa kartu, tabel, maupun tombol.
  if (isGreeting(message)) {
    const g = greetingAnswer(assistantId);
    return { ...g, tenders: [], via: 'mock' };
  }
  if (isDocIntent(message)) return { ...docAnswer(message, chunks), assistantId, skillsUsed: ['doc-extract-status'] };
  // Ad-hoc data questions: rule-engine SQL dulu (hanya bila role diketahui agar
  // scoping tabel berlaku); tidak cocok → jatuh ke jawaban builder biasa.
  if (role && isSqlIntent(message)) {
    const hit = mockAnswerSql(message, role, {
      tenders: liveTenders.map((t) => ({ id: t.id, status: t.status })),
      invoices: snap.invoices,
      checklist: snap.checklist,
      policies: snap.policies,
      roster: snap.roster,
      jobs: snap.jobs,
      docs: snap.docs,
      sales: snap.sales,
    });
    if (hit) return {
      answerTitle: `Query result — ${hit.rowCount} row${hit.rowCount === 1 ? '' : 's'}`,
      answerCopy: `Ran read-only query over live data:\n${hit.sql}\n` +
        hit.rows.slice(0, 3).map((r) => JSON.stringify(r)).join('\n') +
        (hit.rowCount > 3 ? `\n…+${hit.rowCount - 3} more (open Database explorer for the full table)` : ''),
      tenderIds: [],
      recommendation: 'Refine with the Text-to-SQL box in Database explorer for full tables and filters.',
      sources: [{ label: 'Text-to-SQL', detail: hit.sql }],
      followUps: ['Show the full table', 'Filter by status', 'Ask another data question'],
      assistantId,
      skillsUsed: ['text-to-sql'],
      tenders: [],
      via: 'mock',
    };
  }
  // Semua jawaban dihitung dari snapshot live DB — tidak ada narasi canned / data hardcode.
  // Snapshot kosong untuk domain assistant → jawaban "belum ada data" yang eksplisit.
  const isSalesQuestion = /(sales|distributor|revenue|units|quarter|q[234]|compare|growth|sku)/i.test(message);
  if (assistantId === 'finance-assistant' && !snap.invoices.length) {
    return noDataAnswer(assistantId, 'No invoices in the database yet. Import AR/AP invoices first, then ask again.', liveTenders);
  }
  if (assistantId === 'hr-assistant' && !snap.policies.length) {
    return noDataAnswer(assistantId, 'No HR policies in the database yet. Add policy records first, then ask again.', liveTenders);
  }
  if (assistantId === 'ops-assistant' && !snap.jobs.length && !snap.docs.total) {
    return noDataAnswer(assistantId, 'No jobs or documents in the database yet.', liveTenders);
  }
  if ((assistantId === 'sales-assistant' || assistantId === 'management-assistant') && isSalesQuestion && !/tender|quot/i.test(message) && !snap.sales.length) {
    return noDataAnswer(assistantId, 'No distributor sales rows in the database yet.', liveTenders);
  }
  if (!liveTenders.length && (assistantId === 'sales-assistant' || assistantId === 'management-assistant') && !isSalesQuestion) {
    return noDataAnswer(assistantId, 'No tenders in the pipeline yet. Add tenders first, then ask for priorities.', liveTenders);
  }
  let answer =
    (assistantId === 'sales-assistant' || assistantId === 'management-assistant') && snap.sales.length && isSalesQuestion && !/tender|quot/i.test(message)
      ? salesAnswer(snap.sales, 'live')
      : assistantId === 'finance-assistant'
      ? financeAnswer(snap.invoices, snap.checklist, 'live')
      : assistantId === 'hr-assistant'
        ? hrAnswer(snap.policies, snap.roster, 'live')
        : assistantId === 'ops-assistant'
          ? opsAnswer(snap.jobs, snap.docs, 'live')
          : tenderPriorityAnswer(liveTenders, assistantId);
  // Template learning (mock): sebutkan dokumen lampau yang strukturnya ditiru —
  // fakta tetap dari live data, tidak menyalin angka dokumen lama.
  if (templateFiles.length) {
    answer = {
      ...answer,
      recommendation: `${answer.recommendation} Structured after ${templateFiles.join(', ')} (past uploads — facts still from live data).`,
    };
  }
  // Kartu tender hanya untuk assistant yang scope-nya mencakup tenders (sales/management/ops);
  // finance/hr tetap tanpa kartu agar tidak membingungkan. ID selalu dari live rows.
  const wantsCards = answer.tenderIds.length > 0 && liveTenders.length > 0;
  const matched = liveTenders.filter((t) => answer.tenderIds.includes(t.id));
  const cards = wantsCards ? (matched.length ? matched : liveTenders.slice(0, 3)).slice(0, 3) : [];
  // Sitasi RAG: lampirkan chunk relevan bila ada.
  const ragSources = chunks.map((h) => ({ label: h.fileName, detail: `part #${h.chunkIndex + 1}` }));
  const ragNote = chunks.length
    ? `\n\nFrom documents ${[...new Set(chunks.map((h) => h.fileName))].join(', ')}: "${chunks[0].content.slice(0, 220)}…"`
    : '';
  return {
    answerTitle: answer.answerTitle,
    answerCopy: answer.answerCopy + ragNote,
    tenderIds: cards.map((t) => t.id),
    recommendation: answer.recommendation,
    sources: [...answer.sources, ...ragSources].slice(0, 6),
    followUps: answer.followUps,
    assistantId: answer.assistantId ?? assistantId,
    skillsUsed: answer.skillsUsed ?? [],
    tenders: cards,
    via: 'mock',
  };
}

/** OpenCode Go — Responses API (`POST {base}/responses`).
 * Pattern copied from the EQIndex implementation proven to work with the same key:
 * body { model, input, reasoning, max_output_tokens }, baca output_text/output[]. */
async function chatWithHttp(
  message: string,
  liveTenders: Tender[],
  chunks: ChunkHit[],
  assistantId: string,
  systemPrompt: string,
  skillOutputs: SkillResult[],
  sessionId?: string,
  templateFiles: string[] = [],
  executedSkills: string[] = [],
  spaceLines: string[] = [],
): Promise<Omit<LlmChatResult, 'dataVia'>> {
  const base = process.env.LLM_BASE_URL?.replace(/\/$/, '');
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL ?? 'muse-spark-1.3-contributor';
  if (!base || !key) throw new Error('LLM_BASE_URL / LLM_API_KEY not configured');

  const input = [
    'You are Street Smart AI, the business operations assistant for Smart City Street Ltd NZ.',
    systemPrompt,
    `Active assistant: ${assistantId}. Include assistantId + skillsUsed in the JSON.`,
    'Only cite tenders from the following LIVE list (never invent IDs). If the list is empty (non-sales assistant), do not show tender cards — answer from the DOCUMENT CONTEXT / aggregate summary:',
    ...liveTenders.slice(0, 20).map((t) => `- ${t.id}: ${t.name} | ${t.agency} | ${t.country} | closes ${t.date} | ${t.value} | ${t.product} | ${t.status}`),
    ...(skillOutputs.length
      ? ['', 'SKILL RESULTS (computed live by the system — cite these numbers, never invent):',
        ...skillOutputs.flatMap((s) => [`[${s.skillId}] ${s.label}:`, ...s.text.split('\n').slice(0, 12)])]
      : ['No skill data available — answer from DOCUMENT CONTEXT only, or say what data is missing.']),
    ...(spaceLines.length
      ? ['', 'SPACE CONTEXT (the user\'s active workspace — trusted context for THIS question, cite file/tender/draft names exactly):',
        ...spaceLines]
      : []),
    ...(chunks.length
      ? ['', 'DOCUMENT CONTEXT (cite using the exact labels as written):',
        ...chunks.map((h, i) => `[${i + 1}] ${h.fileName} part #${h.chunkIndex + 1}: ${h.content.slice(0, 600)}`)]
      : []),
    ...(isDocIntent(message)
      ? ['', 'This question is about DOCUMENTS, not tenders: answer from the DOCUMENT CONTEXT above. If the context is empty or irrelevant, honestly say which documents are available and upload one first. Never answer with a generic tender list.']
      : []),
    'Small talk rule: if the user only greets or chats briefly with no business question (e.g. "hi", "thanks", "ok"), reply with ONE short greeting line + one line on what you can do. Empty tenderIds, empty sources, no tables, no cards.',
    ...(templateFiles.length
      ? ['', `TEMPLATE GUIDANCE: the user wants a brief/draft/RFP. Past uploads (${templateFiles.join(', ')}) contain brief structures — mirror their section headings and table layouts in your answer. Fill every fact ONLY from the LIVE data above, never copy numbers from the old documents. Name the mirrored file(s) in sources.`]
      : []),
    '',
    'OUTPUT CONTRACT: your entire response is exactly one valid JSON object and nothing else — no intro, no explanation, no code fences:',
    '{"answerTitle":string,"answerCopy":string,"tenderIds":string[],"recommendation":string,',
    '"sources":[{"label":string,"detail":string}],"followUps":string[],"skillsUsed":string[],',
    '"actions":[{"label":string,"kind":"draft"|"link","draftKind"?:"tender-brief"|"approval-summary"|"quotation-review"|"sales-summary"|"payment-approval"|"general","href"?:"/data"|"/inbox"|"/documents"|"/jobs"|"/quotations"|"/deadlines"|"/reports"|"/finance"|"/hr"|"/spaces"}]',
    'Readability: answerCopy must be scannable — key figures first, one item per line starting with "• ", blank line between sections. Never one long paragraph.',
    'Actions: 0-3 contextual next steps ONLY when the answer creates follow-up work (tender answer → draft tender-brief; invoice answer → draft payment-approval; jobs answer → link /jobs). Greetings, no-data and denied answers get []. Never emit the same fixed buttons: tailor labels to THIS answer.',
    'Language: English.',
    '',
    `User: ${message.slice(0, 4000)}`,
  ].join('\n');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(`${base}/responses`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'x-opencode-session': sessionId ? `${sessionId}-chat` : `${OPENCODE_SESSION}-chat`,
        'User-Agent': 'street-smart-cockpit/0.1.0',
      },
      body: JSON.stringify({ model, input, reasoning: { effort: 'low' }, max_output_tokens: 2000 }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { status?: string };
    const text = extractOutputText(body);
    // Respons incomplete (budget habis di reasoning) → error, biarkan caller 503. Jangan fallback diam-diam.
    if (!text.trim()) throw new Error(`LLM returned no text (status: ${body.status ?? 'unknown'})`);
    const parsed = JSON.parse(stripFences(text)) as ChatResponse;
    // Validate IDs against live data — foreign IDs are dropped to prevent hallucination.
    const validIds = new Set(liveTenders.map((t) => t.id));
    const tenderIds = (parsed.tenderIds ?? []).filter((id) => validIds.has(id)).slice(0, 3);
    // Merge model citations with RAG chunk citations (exact file labels).
    const ragSources = chunks.map((h) => ({ label: `${h.fileName} part #${h.chunkIndex + 1}`, detail: h.content.slice(0, 160) }));
    const seen = new Set<string>();
    const sources = [...(parsed.sources ?? []), ...ragSources]
      .filter((s) => { const k = `${s.label}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 6);
    return {
      answerTitle: String(parsed.answerTitle ?? 'AI answer'),
      answerCopy: String(parsed.answerCopy ?? ''),
      tenderIds,
      recommendation: String(parsed.recommendation ?? ''),
      sources,
      followUps: (parsed.followUps ?? []).slice(0, 4),
      assistantId,
      // skillsUsed = skill yang BENAR-BENAR dieksekusi sistem, bukan klaim model.
      skillsUsed: executedSkills.length ? executedSkills.slice(0, 6) : (parsed.skillsUsed ?? []).slice(0, 6),
      actions: sanitizeActions((parsed as { actions?: unknown }).actions),
      tenders: liveTenders.filter((t) => tenderIds.includes(t.id)),
      via: 'http',
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractOutputText(j: unknown): string {
  const obj = (j ?? {}) as { output_text?: unknown; output?: { content?: { text?: unknown }[] }[] };
  if (typeof obj.output_text === 'string' && obj.output_text) return obj.output_text;
  const parts: string[] = [];
  for (const item of obj.output ?? []) {
    for (const c of item.content ?? []) {
      if (typeof c.text === 'string') parts.push(c.text);
    }
  }
  return parts.join('\n');
}

function stripFences(text: string): string {
  return String(text || '').replace(/```(?:json)?/gi, '').trim();
}
