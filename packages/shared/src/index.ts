export type PageId =
  | 'discover'
  | 'conversation'
  | 'conversations'
  | 'spaces'
  | 'jobs'
  | 'documents'
  | 'data'
  | 'connections'
  | 'reports'
  | 'status'
  | 'alerts';

export interface Tender {
  id: string;
  name: string;
  agency: string;
  country: string;
  date: string;
  value: string;
  product: string;
  status: 'Submitted' | 'Pending' | 'Identified' | 'Won' | 'Lost';
  priority?: 'High' | 'Medium' | 'Low';
}

export interface JobItem {
  name: string;
  agent: string;
  state: 'Running' | 'Completed' | 'Active' | 'Scheduled';
  trigger: string;
  lastRun: string;
  progress: string;
  /** Diisi bila job ini adalah permintaan approval atas sebuah draft. */
  draftId?: string;
  draftStatus?: DraftStatus;
}

export interface AlertItem {
  severity: 'High' | 'Medium' | 'Resolved';
  title: string;
  desc: string;
  module: string;
  time: string;
}

export interface ConversationItem {
  title: string;
  preview: string;
  date: string;
}

// --- Finance & HR domain types (agregat-safe: tanpa gaji individu / bank detail) ---

export type InvoiceDirection = 'AR' | 'AP';
export type InvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE';

export interface Invoice {
  id: string;
  direction: InvoiceDirection;
  partner: string;
  amountCents: number;
  currency: string;
  status: InvoiceStatus;
  dueLabel: string;
}

export interface CloseCheckItem {
  id: string;
  period: string;
  item: string;
  done: boolean;
  owner: string;
}

export interface HrPolicy {
  id: string;
  topic: string;
  title: string;
  summary: string;
}

export interface LeaveRow {
  id: string;
  team: string;
  weekLabel: string;
  headcount: number;
  onLeave: number;
}

export interface ChatResponse {
  answerTitle: string;
  answerCopy: string;
  tenderIds: string[];
  recommendation: string;
  sources: { label: string; detail: string }[];
  followUps: string[];
  /** Filled by server: handling assistant + skills used (Joule-style). */
  assistantId?: string;
  skillsUsed?: string[];
}

// --- Joule-style Assistant + Skill registry ---------------------------------
// Satu copilot (Street Smart AI) me-routing ke assistant per-role.
// Tambah role baru = tambah 1 entri ASSISTANTS + skills-nya, tanpa endpoint baru.

export type RoleId = 'sales' | 'finance' | 'hr' | 'operations' | 'management' | 'general';

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  /** read = fetch data, analyze = process/summarize, action = consequential (needs approval). */
  kind: 'read' | 'analyze' | 'action';
  consequential: boolean;
}

export interface AssistantDefinition {
  id: string;
  role: RoleId;
  name: string;
  tagline: string;
  description: string;
  skillIds: string[];
  /** Data sources this assistant may read (least-privilege per role). */
  dataScopes: string[];
  systemPrompt: string;
  triggers: string[];
}

export const SKILLS: SkillDefinition[] = [
  { id: 'tender-search', name: 'Tender Search', description: 'Search tenders in the live pipeline', kind: 'read', consequential: false },
  { id: 'tender-analyze', name: 'Tender Analyze', description: 'Extract requirements + risks from tender documents', kind: 'analyze', consequential: false },
  { id: 'quotation-check', name: 'Quotation Check', description: 'Check quotations awaiting approval + tender links', kind: 'read', consequential: false },
  { id: 'sales-compare', name: 'Sales Compare', description: 'Compare NZ vs AU distributor sales', kind: 'analyze', consequential: false },
  { id: 'invoice-lookup', name: 'Invoice Lookup', description: 'Look up invoice/AR-AP status (aggregate, no sensitive detail in logs)', kind: 'read', consequential: false },
  { id: 'accrual-summary', name: 'Accrual Summary', description: 'Summarize accruals/closing readiness per period', kind: 'analyze', consequential: false },
  { id: 'payment-status', name: 'Payment Status', description: 'Request payment status updates (approval required)', kind: 'action', consequential: true },
  { id: 'leave-policy-qa', name: 'Leave & Policy Q&A', description: 'Answer leave/policy questions from HR documents', kind: 'read', consequential: false },
  { id: 'team-capacity-summary', name: 'Team Capacity Summary', description: 'Summarize aggregate capacity/headcount (no individual salaries)', kind: 'analyze', consequential: false },
  { id: 'distributor-import-status', name: 'Distributor Import Status', description: 'Check distributor sales import job status', kind: 'read', consequential: false },
  { id: 'deadline-monitor', name: 'Deadline Monitor', description: 'Monitor tender deadlines + send alerts', kind: 'read', consequential: false },
  { id: 'doc-extract-status', name: 'Document Extract Status', description: 'Check uploaded document extraction status', kind: 'read', consequential: false },
  { id: 'cross-domain-summary', name: 'Cross-domain Summary', description: 'Read-only cross-domain summary for management', kind: 'analyze', consequential: false },
];

export const ASSISTANTS: AssistantDefinition[] = [
  {
    id: 'sales-assistant',
    role: 'sales',
    name: 'Sales Assistant',
    tagline: 'Tender, quotation & distributor sales',
    description: 'Government tender priorities, quotation checks, distributor sales comparison.',
    skillIds: ['tender-search', 'tender-analyze', 'quotation-check', 'sales-compare'],
    dataScopes: ['tenders', 'quotations', 'distributor_sales', 'documents'],
    systemPrompt:
      'You are the Smart City Street Sales Assistant. Only answer from the LIVE tender list + provided documents. Never invent tender IDs.',
    triggers: ['direct chat', 'new tender arrives', 'Monday 08:00 schedule'],
  },
  {
    id: 'finance-assistant',
    role: 'finance',
    name: 'Finance Assistant',
    tagline: 'Invoices, accruals & closing readiness',
    description: 'Invoice status, accrual summary, closing readiness. Payments need human approval.',
    skillIds: ['invoice-lookup', 'accrual-summary', 'payment-status'],
    dataScopes: ['invoices_ar_ap', 'accruals', 'documents'],
    systemPrompt:
      'You are the Finance Assistant. Answer from the aggregate data provided; never show bank/salary details. Consequential actions (payment updates) MUST request approval first, never execute directly.',
    triggers: ['direct chat', 'monthly closing schedule'],
  },
  {
    id: 'hr-assistant',
    role: 'hr',
    name: 'HR Assistant',
    tagline: 'Cuti, kebijakan & kapasitas tim',
    description: 'Policy/leave Q&A from HR documents + aggregate capacity summary. No individual salary data.',
    skillIds: ['leave-policy-qa', 'team-capacity-summary'],
    dataScopes: ['hr_policies', 'leave_aggregate', 'documents'],
    systemPrompt:
      'You are the HR Assistant. Answer from the policy documents provided. Only show aggregate data (headcount, team leave); NEVER show individual salaries/performance.',
    triggers: ['direct chat'],
  },
  {
    id: 'ops-assistant',
    role: 'operations',
    name: 'Operations Assistant',
    tagline: 'Import, dokumen & deadline monitoring',
    description: 'Import job status, document extraction, and tender deadline monitoring.',
    skillIds: ['distributor-import-status', 'deadline-monitor', 'doc-extract-status'],
    dataScopes: ['jobs', 'documents', 'tenders'],
    systemPrompt:
      'You are the Operations Assistant. Report job/document/deadline status from the live data provided.',
    triggers: ['direct chat', 'PDF upload', 'every 6 hours'],
  },
  {
    id: 'management-assistant',
    role: 'management',
    name: 'Management Assistant',
    tagline: 'Ringkasan lintas-domain read-only',
    description: 'Read-only cross sales/finance/ops orchestration for decisions. No transaction execution.',
    skillIds: ['cross-domain-summary', 'tender-search', 'sales-compare', 'accrual-summary', 'deadline-monitor'],
    dataScopes: ['tenders', 'distributor_sales', 'invoices_ar_ap', 'jobs'],
    systemPrompt:
      'You are the Management Assistant. Give a cross-domain summary from the data provided, read-only. Highlight risks + priority recommendations, without executing transactions.',
    triggers: ['direct chat', 'weekly report schedule'],
  },
];

const ASSISTANT_BY_ID: Record<string, AssistantDefinition> = Object.fromEntries(
  ASSISTANTS.map((a) => [a.id, a]),
);

export function getAssistant(id?: string): AssistantDefinition | undefined {
  if (!id) return undefined;
  return ASSISTANT_BY_ID[id];
}

export function listAssistantsByRole(role?: RoleId): AssistantDefinition[] {
  if (!role || role === 'general') return ASSISTANTS;
  return ASSISTANTS.filter((a) => a.role === role || a.role === 'management');
}

/** Infer assistant from keywords — used when the client omits assistantId (backward-compat). Keeps both EN + ID keywords so old queries still route. */
export function inferAssistantId(message: string): string {
  const q = message.toLowerCase();
  if (/(invoice|accrual|akrual|cash|payment|pembayaran|closing|ar\b|ap\b|finance|keuangan)/.test(q)) return 'finance-assistant';
  if (/(leave|cuti|\bhr\b|payroll|policy|kebijakan|headcount|hiring|rekrut|capacity|kapasitas|roster|workload|on leave|time off|\bteam\b|\btim\b)/.test(q)) return 'hr-assistant';
  if (/(import|sync|deadline|tenggat|job|status dokumen|extraction)/.test(q)) return 'ops-assistant';
  if (/(summary|ringkas.*semua|kpi|management|manajemen|board|report mingguan)/.test(q)) return 'management-assistant';
  return 'sales-assistant';
}

export interface ResolveOpts {
  assistantId?: string;
  role?: RoleId;
  message?: string;
}

export function resolveAssistant(opts: ResolveOpts = {}): AssistantDefinition {
  const byId = opts.assistantId ? getAssistant(opts.assistantId) : undefined;
  if (byId) return byId;
  if (opts.role && opts.role !== 'general') {
    const match = ASSISTANTS.find((a) => a.role === opts.role);
    if (match) return match;
  }
  return getAssistant(inferAssistantId(opts.message ?? '')) ?? ASSISTANTS[0];
}

export function skillsFor(assistantId: string): SkillDefinition[] {
  const a = getAssistant(assistantId);
  if (!a) return [];
  return a.skillIds
    .map((id) => SKILLS.find((s) => s.id === id))
    .filter((s): s is SkillDefinition => Boolean(s));
}

// --- Human-in-the-loop Drafts (AI menyusun, manusia memutuskan) ----------------
// AI tidak pernah mengeksekusi aksi consequential langsung — hanya menghasilkan
// Draft berstatus draft → in_review → approved / rejected. Semua edit manusia
// tercatat di history. shortcut: penyimpanan masih in-memory di apps/api,
// upgrade ke tabel Draft Postgres saat butuh audit lintas-restart.

export type DraftKind =
  | 'tender-brief'
  | 'approval-summary'
  | 'quotation-review'
  | 'sales-summary'
  | 'payment-approval'
  | 'general';

export type DraftStatus = 'draft' | 'in_review' | 'approved' | 'rejected';

export interface DraftHistoryEntry {
  at: string;
  actor: 'ai' | 'human';
  action: 'created' | 'edited' | 'submitted' | 'approved' | 'rejected';
  note?: string;
}

export interface Draft {
  id: string;
  kind: DraftKind;
  title: string;
  body: string;
  status: DraftStatus;
  assistantId?: string;
  skillsUsed?: string[];
  sources?: { label: string; detail: string }[];
  tenderIds?: string[];
  /** Tautan balik ke dokumen sumber (diisi saat draft dibuat dari /documents). */
  sourceDocumentId?: string;
  sourceDocumentName?: string;
  createdAt: string;
  updatedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  history: DraftHistoryEntry[];
}

/** Draft final (approved/rejected) tidak boleh diedit diam-diam — pure, dipakai API + tests. */
export function canEditDraftStatus(status: DraftStatus): boolean {
  return status === 'draft' || status === 'in_review';
}

/** Aturan transisi status — pure, dipakai API + tests. Final (approved) terkunci. */
export function canMoveDraftStatus(from: DraftStatus, to: DraftStatus): boolean {
  const allowed: Record<DraftStatus, DraftStatus[]> = {
    draft: ['in_review', 'approved', 'rejected'],
    in_review: ['approved', 'rejected', 'draft'],
    approved: [],
    rejected: ['draft'],
  };
  return allowed[from].includes(to);
}

export const DRAFT_KINDS: DraftKind[] = [
  'tender-brief',
  'approval-summary',
  'quotation-review',
  'sales-summary',
  'payment-approval',
  'general',
];

export const DRAFT_STATUSES: DraftStatus[] = ['draft', 'in_review', 'approved', 'rejected'];

export function isDraftKind(v: unknown): v is DraftKind {
  return typeof v === 'string' && (DRAFT_KINDS as string[]).includes(v);
}

export function isDraftStatus(v: unknown): v is DraftStatus {
  return typeof v === 'string' && (DRAFT_STATUSES as string[]).includes(v);
}

/** Bangun draft awal dari jawaban chat — dipakai FE saat API tidak terjangkau. */
export function buildDraftFromChat(
  question: string,
  answer: ChatResponse,
  kind: DraftKind = 'general',
): Draft {
  const now = new Date().toISOString();
  return {
    id: `local-${Date.now()}`,
    kind,
    title: answer.answerTitle || `Draft for: ${question.slice(0, 60)}`,
    body: [answer.answerCopy, answer.recommendation ? `Rekomendasi: ${answer.recommendation}` : '']
      .filter(Boolean)
      .join('\n\n'),
    status: 'draft',
    assistantId: answer.assistantId,
    skillsUsed: answer.skillsUsed ?? [],
    sources: answer.sources ?? [],
    tenderIds: answer.tenderIds ?? [],
    createdAt: now,
    updatedAt: now,
    history: [{ at: now, actor: 'ai', action: 'created' }],
  };
}

// --- Document extraction review (Receipt Analysis Agent pattern) ----------------
// Setiap field membawa confidence + source agar manusia tahu apa yang perlu
// diverifikasi: extracted (terbaca langsung) vs inferred (dilengkapi AI dari
// konteks) vs missing (tidak ditemukan). needsReview = sorotan untuk human.

export type ExtractionSource = 'extracted' | 'inferred' | 'missing';

export interface ExtractionField {
  label: string;
  value: string;
  confidence: number; // 0..1
  source: ExtractionSource;
  needsReview: boolean;
}

export interface DocumentExtraction {
  kind: string;
  confidence: number; // rata-rata confidence field
  fields: ExtractionField[];
  missingFields: string[];
}

export function extractionNeedsReview(e: DocumentExtraction): boolean {
  return e.fields.some((f) => f.needsReview) || e.missingFields.length > 0;
}

/** Petakan draft yang butuh manusia → baris antrean jobs. Draft approved/completed
 * tidak masuk antrean (sudah final). */
export function draftToJob(d: Draft): JobItem {
  return {
    name: `Review draft: ${d.title.slice(0, 60)}`,
    agent: d.assistantId ?? 'Draft Approval',
    state: d.status === 'in_review' ? 'Running' : 'Scheduled',
    trigger: 'Human approval',
    lastRun: d.updatedAt,
    progress: '—',
    draftId: d.id,
    draftStatus: d.status,
  };
}

/** Petakan jenis ekstraksi → kind draft agar "Buat draft" reuse API /api/drafts. */
export function draftKindForExtraction(kind: string): DraftKind {
  const k = kind.toLowerCase();
  if (k.includes('tender')) return 'tender-brief';
  if (k.includes('quotation')) return 'approval-summary';
  if (k.includes('sales')) return 'sales-summary';
  if (k.includes('invoice') || k.includes('payment')) return 'payment-approval';
  return 'general';
}

// --- Mock data (moved from Figma Make App.tsx, single source of truth) ---

export const prompts: string[] = [
  'Which government tenders should we prioritize this month?',
  'Summarize all open tenders closing in the next 30 days.',
  'Compare distributor sales in New Zealand and Australia.',
  'Which Smartstud products have the highest sales growth?',
  'Find quotations waiting for approval.',
  'Prepare a tender opportunity brief for Auckland.',
];

export const tenders: Tender[] = [
  { id: 'TND-2026-001', name: 'Auckland Smart Road Upgrade', agency: 'NZ Transport Agency', country: 'New Zealand', date: '24 Nov 2026', value: 'NZD 1,250,000', product: 'Smartstud', status: 'Submitted', priority: 'High' },
  { id: 'TND-2026-002', name: 'Wellington Tunnel Safety Upgrade', agency: 'Wellington Infrastructure', country: 'New Zealand', date: '03 Dec 2026', value: 'NZD 840,000', product: 'Tunnel markers', status: 'Pending', priority: 'High' },
  { id: 'TND-2026-003', name: 'Christchurch Pedestrian Safety', agency: 'Christchurch City Council', country: 'New Zealand', date: '15 Dec 2026', value: 'NZD 420,000', product: 'Smartped', status: 'Identified', priority: 'Medium' },
  { id: 'TND-2026-004', name: 'Brisbane Active Crossing Program', agency: 'Brisbane City Council', country: 'Australia', date: '08 Jan 2027', value: 'AUD 690,000', product: 'Smartped', status: 'Won', priority: 'Medium' },
  { id: 'TND-2026-005', name: 'Oslo Winter Road Visibility', agency: 'Norwegian Roads Authority', country: 'Norway', date: '19 Jan 2027', value: 'EUR 580,000', product: 'Smartstud', status: 'Pending', priority: 'Medium' },
  { id: 'TND-2026-006', name: 'Singapore Tunnel Guidance', agency: 'Land Transport Authority', country: 'Singapore', date: '28 Jan 2027', value: 'SGD 1,100,000', product: 'Tunnel markers', status: 'Submitted', priority: 'Low' },
];

export const jobs: JobItem[] = [
  { name: 'Tender Document Extraction', agent: 'Document Intelligence Agent', state: 'Running', trigger: 'PDF upload', lastRun: '2 min ago', progress: '68%' },
  { name: 'Distributor Sales Import', agent: 'Distributor Sales Agent', state: 'Completed', trigger: 'New file', lastRun: '35 min ago', progress: '100%' },
  { name: 'Quotation Classification', agent: 'Product & Quotation Agent', state: 'Running', trigger: 'Inbox item', lastRun: '8 min ago', progress: '42%' },
  { name: 'Tender Deadline Monitoring', agent: 'Tender Intelligence Agent', state: 'Active', trigger: 'Every 6 hours', lastRun: '3 hours ago', progress: '—' },
  { name: 'Weekly Sales Summary', agent: 'Distributor Sales Agent', state: 'Scheduled', trigger: 'Monday, 8:00 AM', lastRun: 'Yesterday', progress: '—' },
];

export const alerts: AlertItem[] = [
  { severity: 'High', title: 'Tender deadline in 5 days', desc: 'Auckland Smart Road Upgrade requires final compliance review.', module: 'Tender pipeline', time: '12 minutes ago' },
  { severity: 'Medium', title: 'API sync delayed', desc: 'Distributor Sales Warehouse synchronization is running 18 minutes behind.', module: 'Data connections', time: '42 minutes ago' },
  { severity: 'Resolved', title: 'Document extraction retried', desc: 'A scanned appendix was successfully processed on the second attempt.', module: 'Document ingestion', time: 'Yesterday' },
];

export const invoices: Invoice[] = [
  { id: 'INV-AR-2101', direction: 'AR', partner: 'Auckland Distributor Ltd', amountCents: 18400000, currency: 'NZD', status: 'UNPAID', dueLabel: '28 Nov 2026' },
  { id: 'INV-AR-2098', direction: 'AR', partner: 'Wellington Infra Supplies', amountCents: 9600000, currency: 'NZD', status: 'OVERDUE', dueLabel: '17 Nov 2026' },
  { id: 'INV-AR-2095', direction: 'AR', partner: 'Brisbane Road Systems', amountCents: 13000000, currency: 'AUD', status: 'PARTIAL', dueLabel: '05 Dec 2026' },
  { id: 'INV-AP-3310', direction: 'AP', partner: 'Optics Component Co', amountCents: 7200000, currency: 'NZD', status: 'UNPAID', dueLabel: '25 Nov 2026' },
  { id: 'INV-AP-3307', direction: 'AP', partner: 'Solar Cell Supply', amountCents: 10800000, currency: 'NZD', status: 'OVERDUE', dueLabel: '14 Nov 2026' },
];

export const closeChecklist: CloseCheckItem[] = [
  { id: 'CC-2026-11-01', period: '2026-11', item: 'Accrue supplier invoices received', done: true, owner: 'Finance' },
  { id: 'CC-2026-11-02', period: '2026-11', item: 'Reconcile distributor AR balances', done: true, owner: 'Finance' },
  { id: 'CC-2026-11-03', period: '2026-11', item: 'Review warranty provision', done: false, owner: 'Finance' },
  { id: 'CC-2026-11-04', period: '2026-11', item: 'Confirm FX revaluation NZD/AUD', done: false, owner: 'Finance' },
  { id: 'CC-2026-11-05', period: '2026-11', item: 'Lock period after approvals', done: false, owner: 'Management' },
];

export const hrPolicies: HrPolicy[] = [
  { id: 'HR-POL-LEAVE', topic: 'leave', title: 'Annual & sick leave', summary: 'Cuti tahunan 20 hari, sick leave 10 hari per tahun. Pengajuan H-7 via HR.' },
  { id: 'HR-POL-REMOTE', topic: 'remote', title: 'Hybrid work', summary: 'Maks 2 hari remote per minggu dengan persetujuan lead tim.' },
  { id: 'HR-POL-TRAVEL', topic: 'travel', title: 'Site travel', summary: 'Perjalanan site NZ butuh approval ops lead; klaim maksimal 14 hari setelah trip.' },
];

export const leaveRoster: LeaveRow[] = [
  { id: 'LV-2026-W46-OPS', team: 'Operations', weekLabel: 'W46 (9–15 Nov)', headcount: 8, onLeave: 2 },
  { id: 'LV-2026-W46-SALES', team: 'Sales', weekLabel: 'W46 (9–15 Nov)', headcount: 6, onLeave: 1 },
  { id: 'LV-2026-W46-FIN', team: 'Finance', weekLabel: 'W46 (9–15 Nov)', headcount: 4, onLeave: 0 },
];

export function formatMoney(cents: number, currency: string): string {
  const n = cents / 100;
  return `${currency} ${n.toLocaleString('en-NZ', { maximumFractionDigits: 0 })}`;
}

export const conversationHistory: ConversationItem[] = [
  { title: 'Tender priorities for New Zealand', preview: 'Based on the current pipeline, I recommend prioritizing...', date: '10 min ago' },
  { title: 'Q3 distributor sales comparison', preview: 'Australia grew 14% while New Zealand remained...', date: 'Yesterday' },
  { title: 'Smartstud product growth', preview: 'The SRS-8 solar road stud leads with 22% growth...', date: 'Monday' },
  { title: 'Quotation approval queue', preview: 'Five quotations are awaiting approval, totaling...', date: '18 Nov' },
];

/** Finance answer computed from invoice + checklist rows (live DB or mock) — never hardcoded. */
export function financeAnswer(inv: Invoice[], cc: CloseCheckItem[], viaLabel: string): ChatResponse {
  const open = (d: InvoiceDirection) => inv.filter((i) => i.direction === d && i.status !== 'PAID');
  const sum = (rows: Invoice[]) => rows.reduce((a, i) => a + i.amountCents, 0);
  const cur = inv[0]?.currency ?? 'NZD';
  const overdue = inv.filter((i) => i.status === 'OVERDUE');
  const done = cc.filter((c) => c.done).length;
  const pending = cc.filter((c) => !c.done).map((c) => c.item);
  return {
    answerTitle: `Finance snapshot (${viaLabel})`,
    answerCopy:
      `Open AR ${formatMoney(sum(open('AR')), cur)} (${open('AR').length} invoices), ` +
      `open AP ${formatMoney(sum(open('AP')), cur)} (${open('AP').length} invoices). ` +
      (overdue.length ? `Overdue: ${overdue.map((i) => `${i.id} (${i.partner}, due ${i.dueLabel})`).join('; ')}. ` : 'No overdue invoices. ') +
      `Closing ${cc[0]?.period ?? ''}: ${done}/${cc.length} checklist items done` +
      (pending.length ? ` — remaining: ${pending.join('; ')}` : '') +
      `. Payment actions need human approval — I prepare the draft, never execute directly.`,
    tenderIds: [],
    recommendation: pending.length
      ? `Finish "${pending[0]}" first, then approve the overdue AP payments.`
      : 'All checklist items done — ready to lock the period after management approval.',
    sources: [
      { label: 'Finance close checklist', detail: viaLabel },
      { label: 'Invoices AR/AP', detail: `Aggregate only (${viaLabel})` },
    ],
    followUps: ['Show overdue invoices', 'What blocks month-end close?', 'Draft payment approval summary'],
    assistantId: 'finance-assistant',
    skillsUsed: ['invoice-lookup', 'accrual-summary'],
  };
}

/** HR answer from policies + aggregate roster (no individual names/salaries). */
export function hrAnswer(pol: HrPolicy[], ros: LeaveRow[], viaLabel: string): ChatResponse {
  const headcount = ros.reduce((a, r) => a + r.headcount, 0);
  const onLeave = ros.reduce((a, r) => a + r.onLeave, 0);
  const leave = pol.find((p) => p.topic === 'leave');
  return {
    answerTitle: `HR snapshot (${viaLabel})`,
    answerCopy:
      (leave ? `Policy: ${leave.summary} ` : '') +
      `Aggregate capacity: ${headcount} people, ${onLeave} on leave (${ros.map((r) => `${r.team} ${r.onLeave}/${r.headcount}`).join(', ')}). ` +
      `Individual salary details are never shown.`,
    tenderIds: [],
    recommendation: 'Apply for leave 7 days ahead via HR; check the weekly summary before assigning new projects.',
    sources: [
      { label: 'HR policy handbook', detail: viaLabel },
      { label: 'Leave roster (aggregate)', detail: viaLabel },
    ],
    followUps: ['How many annual leave days?', 'Team capacity this week?', 'What is the remote work policy?'],
    assistantId: 'hr-assistant',
    skillsUsed: ['leave-policy-qa', 'team-capacity-summary'],
  };
}

export function mockChatAnswer(question: string, assistantId?: string): ChatResponse {
  const q = question.toLowerCase();
  const aid = assistantId ?? inferAssistantId(question);
  if (aid === 'finance-assistant') return financeAnswer(invoices, closeChecklist, 'simulated');
  if (aid === 'hr-assistant') return hrAnswer(hrPolicies, leaveRoster, 'simulated');
  if (aid === 'ops-assistant') {
    return {
      answerTitle: 'Operations status (simulated)',
      answerCopy:
        'Distributor Sales Import: completed 35 min ago. Document Extraction: running at 68%. Tender Deadline Monitoring: active (checks every 6 hours). 1 alert: 18 min sync delay.',
      tenderIds: [],
      recommendation: 'Wait for extraction to finish before tender analysis; check Data connections for the sync delay.',
      sources: [
        { label: 'Jobs queue', detail: 'Live' },
        { label: 'Document ingestion', detail: 'Live' },
      ],
      followUps: ['Show running jobs', 'Which documents are still processing?', 'Show upcoming deadlines'],
      assistantId: 'ops-assistant',
      skillsUsed: ['distributor-import-status', 'doc-extract-status', 'deadline-monitor'],
    };
  }
  if (aid === 'management-assistant') {
    return {
      answerTitle: 'Executive summary (simulated, read-only)',
      answerCopy:
        'Active pipeline: 6 tenders (3 NZ priorities). Sales AU +14%, NZ flat. Finance: closing 3/5 ready. Ops: 1 sync delay. Top risks: Auckland deadline in 5 days + incomplete accruals.',
      tenderIds: ['TND-2026-001', 'TND-2026-002', 'TND-2026-003'],
      recommendation: 'This week focus: Auckland compliance review + complete accruals + follow up NZ distributors.',
      sources: [
        { label: 'Tender Pipeline', detail: 'Updated today' },
        { label: 'Distributor Performance Space', detail: 'Updated yesterday' },
        { label: 'Finance close checklist', detail: 'Simulated' },
      ],
      followUps: ['Top 3 risks this week', 'Compare NZ vs AU sales', 'What blocks month-end close?'],
      assistantId: 'management-assistant',
      skillsUsed: ['cross-domain-summary'],
    };
  }
  if (q.includes('sales') || q.includes('distributor')) {
    return {
      answerTitle: 'Distributor snapshot: NZ vs AU',
      answerCopy:
        'Australia grew ~14% in Q3 while New Zealand stayed flat. Smartstud SRS-8 leads growth at +22% QoQ. Full breakdown is in Distributor Performance space.',
      tenderIds: [],
      recommendation: 'Follow up on declining NZ distributors first, and replicate the successful AU bundling.',
      sources: [
        { label: 'Distributor_Sales_Q3.xlsx', detail: 'Sheet Summary' },
        { label: 'Distributor Performance Space', detail: 'Updated yesterday' },
      ],
      followUps: ['Show NZ distributors with declining sales', 'Which Smartstud SKUs drive growth?', 'Prepare weekly sales summary'],
      assistantId: 'sales-assistant',
      skillsUsed: ['sales-compare'],
    };
  }
  if (q.includes('quotation') || q.includes('approval')) {
    return {
      answerTitle: 'Five quotations await approval',
      answerCopy:
        'Total value ~NZD 310K across Smartstud and Smartped lines. Two are linked to Auckland and Wellington tenders closing within 30 days.',
      tenderIds: ['TND-2026-001', 'TND-2026-002'],
      recommendation: 'Approve Auckland-linked quotations first to unblock tender compliance.',
      sources: [
        { label: 'Past quotations / Q-1042', detail: 'Smartstud_Quotation_1042.pdf' },
        { label: 'Tender Pipeline', detail: 'Updated today' },
      ],
      followUps: ['List quotations by value', 'Which quotations link to tenders?', 'Draft approval summary'],
      assistantId: 'sales-assistant',
      skillsUsed: ['quotation-check', 'tender-search'],
    };
  }
  return {
    answerTitle: 'Three opportunities stand out',
    answerCopy:
      'Based on estimated value, product fit, deadline proximity, and submission readiness, I recommend prioritizing these New Zealand opportunities.',
    tenderIds: ['TND-2026-001', 'TND-2026-002', 'TND-2026-003'],
    recommendation:
      'Prioritize Auckland first because of its higher value and strong fit with the current Smartstud range. Begin technical compliance checks for Wellington in parallel.',
    sources: [
      { label: 'NZTA_Tender_2026.pdf', detail: 'Page 4' },
      { label: 'Tender Pipeline / TND-2026-001', detail: 'Updated today' },
      { label: 'Product Catalogue / Smartstud', detail: 'Version 3.4' },
    ],
    followUps: ['Compare the technical requirements', 'Show deadlines on a timeline', 'Prepare a tender response checklist'],
    assistantId: 'sales-assistant',
    skillsUsed: ['tender-search', 'tender-analyze'],
  };
}
