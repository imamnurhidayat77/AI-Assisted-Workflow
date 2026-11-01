import { randomUUID } from 'node:crypto';
import {
  financeAnswer,
  formatMoney,
  hrAnswer,
  mockChatAnswer,
  resolveAssistant,
  type ChatResponse,
  type CloseCheckItem,
  type HrPolicy,
  type Invoice,
  type LeaveRow,
  type RoleId,
  type Tender,
} from '@street-smart/shared';
import { getTenders } from './tenders.js';
import { getFinanceSnapshot } from './finance.js';
import { getHrSnapshot } from './hr.js';
import { isDocIntent, recentChunks, retrieveChunks, type ChunkHit } from './retrieval.js';

export interface DomainSnapshots {
  invoices: Invoice[];
  checklist: CloseCheckItem[];
  policies: HrPolicy[];
  roster: LeaveRow[];
  financeVia: 'db' | 'mock';
  hrVia: 'db' | 'mock';
}

export interface ChatOpts {
  assistantId?: string;
  role?: RoleId;
  /** Progress callback for realtime (Socket.IO) updates. */
  onStage?: (stage: ChatStage) => void;
  /** Per-conversation client session id (gateway routing + prompt caching). */
  sessionId?: string;
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

/**
 * Single AI entry point. Default: simulation (no API key, no cost).
 * For the real model (e.g. muse-spark via API key):
 *   AI_PROVIDER=http LLM_BASE_URL=... LLM_API_KEY=... LLM_MODEL=...
 */
export async function chatWithAI(message: string, opts: ChatOpts = {}): Promise<LlmChatResult> {
  const provider = (process.env.AI_PROVIDER ?? 'mock').toLowerCase();
  // Joule-style routing: 1 copilot → assistant per-role. Default infer dari pesan (backward-compat).
  const assistant = resolveAssistant({ assistantId: opts.assistantId, role: opts.role, message });
  // Per-assistant grounding (least-privilege): live tenders only for
  // sales/management/ops; finance/hr ground on DB snapshots + documents.
  const needsTenders = assistant.dataScopes.includes('tenders');
  const needsFinance = assistant.dataScopes.includes('invoices_ar_ap');
  const needsHr = assistant.dataScopes.includes('hr_policies');
  const { rows: liveTenders, via: tenderVia } = needsTenders
    ? await getTenders(message)
    : { rows: [], via: 'mock' as const };
  const [finance, hr] = await Promise.all([
    needsFinance ? getFinanceSnapshot() : Promise.resolve(null),
    needsHr ? getHrSnapshot() : Promise.resolve(null),
  ]);
  const snap: DomainSnapshots = {
    invoices: finance?.invoices ?? [],
    checklist: finance?.checklist ?? [],
    policies: hr?.policies ?? [],
    roster: hr?.roster ?? [],
    financeVia: finance?.via ?? 'mock',
    hrVia: hr?.via ?? 'mock',
  };
  const dataVia = needsTenders ? tenderVia : needsFinance ? snap.financeVia : needsHr ? snap.hrVia : ('mock' as const);
  opts.onStage?.('tenders');
  // Most relevant document chunks (empty when no chunks / DB down).
  let chunks = await retrieveChunks(message);
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
  if (provider !== 'mock') {
    opts.onStage?.('ai');
    try {
      const res = await chatWithHttp(message, liveTenders, chunks, assistant.id, assistant.systemPrompt, snap, opts.sessionId);
      opts.onStage?.('done');
      return { ...res, dataVia };
    } catch (err) {
      console.warn('[llm] HTTP provider failed, falling back to simulation:', (err as Error).message);
    }
  }
  await new Promise((r) => setTimeout(r, SIMULATED_LATENCY_MS));
  opts.onStage?.('done');
  return { ...chatWithMock(message, liveTenders, chunks, assistant.id, snap), dataVia };
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

function chatWithMock(
  message: string,
  liveTenders: Tender[],
  chunks: ChunkHit[],
  assistantId: string,
  snap: DomainSnapshots,
): Omit<LlmChatResult, 'dataVia'> {
  if (isDocIntent(message)) return { ...docAnswer(message, chunks), assistantId, skillsUsed: ['doc-extract-status'] };
  // Finance/HR answers are computed from live snapshots (DB or mock fallback) — never hardcoded.
  const answer =
    assistantId === 'finance-assistant' && snap.invoices.length
      ? financeAnswer(snap.invoices, snap.checklist, snap.financeVia === 'db' ? 'live' : 'simulated')
      : assistantId === 'hr-assistant' && snap.policies.length
        ? hrAnswer(snap.policies, snap.roster, snap.hrVia === 'db' ? 'live' : 'simulated')
        : mockChatAnswer(message, assistantId);
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
  snap: DomainSnapshots,
  sessionId?: string,
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
    ...(snap.invoices.length
      ? ['', 'FINANCE SNAPSHOT (aggregate only, compute from these rows):',
        ...snap.invoices.map((i) => `- ${i.id} ${i.direction} ${i.partner} ${formatMoney(i.amountCents, i.currency)} ${i.status} due ${i.dueLabel}`),
        `Close checklist (${snap.checklist[0]?.period ?? ''}): ` + snap.checklist.map((c) => `${c.done ? '[x]' : '[ ]'} ${c.item}`).join(' | '),
        'Payment actions MUST ask for human approval first — draft only, never execute.']
      : []),
    ...(snap.policies.length
      ? ['', 'HR SNAPSHOT (policies + aggregate roster, never show individual salaries):',
        ...snap.policies.map((p) => `- ${p.title}: ${p.summary}`),
        'Roster: ' + snap.roster.map((r) => `${r.team} ${r.onLeave}/${r.headcount} on leave (${r.weekLabel})`).join(' | ')]
      : []),
    ...(chunks.length
      ? ['', 'DOCUMENT CONTEXT (cite using the exact labels as written):',
        ...chunks.map((h, i) => `[${i + 1}] ${h.fileName} part #${h.chunkIndex + 1}: ${h.content.slice(0, 600)}`)]
      : []),
    ...(isDocIntent(message)
      ? ['', 'This question is about DOCUMENTS, not tenders: answer from the DOCUMENT CONTEXT above. If the context is empty or irrelevant, honestly say which documents are available and ask the user to upload one first. Never answer with a generic tender list.']
      : []),
    '',
    'OUTPUT CONTRACT: your entire response is exactly one valid JSON object and nothing else — no intro, no explanation, no code fences:',
    '{"answerTitle":string,"answerCopy":string,"tenderIds":string[],"recommendation":string,',
    '"sources":[{"label":string,"detail":string}],"followUps":string[],"skillsUsed":string[]}',
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
    const text = extractOutputText(await res.json());
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
      skillsUsed: (parsed.skillsUsed ?? []).slice(0, 6),
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
