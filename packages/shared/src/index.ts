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
  | 'status';

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

export type QuotationStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'expired';

export interface Quotation {
  id: string;
  number: string;
  title: string;
  partner: string;
  tenderId?: string;
  amountCents: number;
  currency: string;
  status: QuotationStatus;
  validUntil?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

/** Parse label "24 Nov 2026" (closeLabel tender) → Date. Null bila tak terbaca. */
export function parseCloseLabel(label: string): Date | null {
  const MONTHS: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const m = label.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return null;
  const mon = MONTHS[m[2]];
  if (mon === undefined) return null;
  const d = new Date(Number(m[3]), mon, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface JobItem {
  name: string;
  agent: string;
  state: 'Running' | 'Completed' | 'Active' | 'Scheduled';
  trigger: string;
  lastRun: string;
  progress: string;
  /** Filled when this job is an approval request for a draft. */
  draftId?: string;
  draftStatus?: DraftStatus;
}

export type SpaceItemKind = 'conversation' | 'document' | 'tender' | 'note';

export interface SpaceItem {
  id: string;
  spaceId: string;
  kind: string;
  refId: string;
  /** ID stabil record sumber bila ada (mis. conversation id) — dipakai untuk
   * tautan draft yang eksplisit. Item lama mungkin kosong (hanya teks bebas). */
  sourceId?: string;
  title: string;
  preview: string;
  createdAt: string;
  /** Siapa menambah + kapan + catatan singkat (opsional, diisi server). */
  addedById?: string;
  addedAt?: string;
  note?: string;
}

export type SpaceVisibility = 'PRIVATE' | 'ROLE';
export type SpaceStatus = 'ACTIVE' | 'ARCHIVED';

export interface SpaceActivity {
  id: string;
  type: string;
  actorId: string;
  actorRole: string;
  refId?: string;
  summary: string;
  createdAt: string;
}

/** Aksi turunan data (bukan karangan) untuk halaman workspace. */
export interface SpaceAction {
  type: 'REVIEW_DRAFT' | 'FOLLOW_UP' | 'OPEN_ITEM';
  title: string;
  reason: string;
  targetId?: string;
  href: string;
  requiresApproval: boolean;
}

/** Saran simpan ke space (deterministik, bukan tebakan LLM). */
export interface SuggestedSpace {
  spaceId: string;
  name: string;
  reason: string;
}

/** Preset pembuatan space — user tetap pemilik & pengatur isinya. */
export interface SpaceTemplate {
  id: string;
  name: string;
  purpose: string;
  visibility: SpaceVisibility;
  itemKinds: string[];
  assistantId: string;
}

export interface SpaceSummary {
  id: string;
  name: string;
  description: string;
  tone: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  byKind: Record<string, number>;
  /** Ownership & visibility (diisi server; legacy = undefined). */
  ownerId?: string;
  ownerRole?: string;
  visibility?: SpaceVisibility;
  status?: SpaceStatus;
  /** Ringkasan turunan (diisi server bila tersedia). */
  pendingActions?: number;
  lastActivityAt?: string;
}

export interface SpaceDetail extends Omit<SpaceSummary, 'itemCount' | 'byKind'> {
  items: SpaceItem[];
  activities?: SpaceActivity[];
  drafts?: Draft[];
}

export const SPACE_TEMPLATES: SpaceTemplate[] = [
  {
    id: 'tpl-tender-review',
    name: 'Tender Opportunity Review',
    purpose: 'Review and prioritize active government tenders with linked briefs and deadlines.',
    visibility: 'ROLE',
    itemKinds: ['tender', 'conversation', 'document', 'note'],
    assistantId: 'sales-assistant',
  },
  {
    id: 'tpl-finance-close',
    name: 'Monthly Finance Close',
    purpose: 'Track invoices, accruals and closing checklist readiness for the current period.',
    visibility: 'ROLE',
    itemKinds: ['document', 'note', 'conversation'],
    assistantId: 'finance-assistant',
  },
  {
    id: 'tpl-distributor',
    name: 'Distributor Performance',
    purpose: 'Analyze sales by region, product, and quarter with import status.',
    visibility: 'ROLE',
    itemKinds: ['document', 'note', 'conversation'],
    assistantId: 'sales-assistant',
  },
];

export function isSpaceVisibility(v: unknown): v is SpaceVisibility {
  return v === 'PRIVATE' || v === 'ROLE';
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

export interface DistributorSale {
  id: string;
  distributor: string;
  country: string;
  product: string;
  sku: string;
  quarter: string;
  units: number;
  amountCents: number;
  currency: string;
}

/** Aksi kontekstual yang disarankan AI untuk jawaban ini (ala Joule):
 * draft = buat draft kind tersebut; link = navigasi ke halaman app. */
export interface SuggestedAction {
  label: string;
  kind: 'draft' | 'link';
  draftKind?: DraftKind;
  href?: string;
}

const ACTION_HREFS = ['/data', '/inbox', '/documents', '/jobs', '/quotations', '/deadlines', '/reports', '/finance', '/hr', '/spaces', '/executive'];

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
  /** Aksi kontekstual dari AI (disanitasi server). Kosong = tidak ada tombol. */
  actions?: SuggestedAction[];
  /** Saran simpan ke space (deterministik per domain, bukan tebakan model). */
  suggestedSpace?: SuggestedSpace;
}

/** Sanitasi actions dari AI: whitelist kind/href, label pendek, maks 3. Pure. */
export function sanitizeActions(input: unknown): SuggestedAction[] {
  if (!Array.isArray(input)) return [];
  const out: SuggestedAction[] = [];
  for (const a of input) {
    if (out.length >= 3) break;
    if (typeof a !== 'object' || a === null) continue;
    const o = a as { label?: unknown; kind?: unknown; draftKind?: unknown; href?: unknown };
    if (typeof o.label !== 'string' || !o.label.trim()) continue;
    if (o.kind === 'draft' && isDraftKind(o.draftKind)) {
      out.push({ label: o.label.trim().slice(0, 48), kind: 'draft', draftKind: o.draftKind });
    } else if (o.kind === 'link' && typeof o.href === 'string' && ACTION_HREFS.includes(o.href)) {
      out.push({ label: o.label.trim().slice(0, 48), kind: 'link', href: o.href });
    }
  }
  return out;
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
  { id: 'text-to-sql', name: 'Text-to-SQL', description: 'Answer ad-hoc data questions via validated read-only SQL (allowlisted tables/columns)', kind: 'analyze', consequential: false },
  { id: 'cross-domain-summary', name: 'Cross-domain Summary', description: 'Read-only cross-domain summary for management', kind: 'analyze', consequential: false },
];

// --- Text-to-SQL scope: tabel apa boleh dibaca role apa (server enforcement).
// Kolom sensitif (extractedText, hash, body draft) tidak masuk allowlist mana pun.
export const SQL_TABLE_COLUMNS: Record<string, string[]> = {
  Tender: ['id', 'name', 'agency', 'country', 'closesOn', 'closeLabel', 'value', 'product', 'status', 'priority'],
  Invoice: ['id', 'direction', 'partner', 'amountCents', 'currency', 'status', 'dueLabel'],
  CloseCheckItem: ['id', 'period', 'item', 'done', 'owner'],
  HrPolicy: ['id', 'topic', 'title', 'summary'],
  LeaveRow: ['id', 'team', 'weekLabel', 'headcount', 'onLeave'],
  Job: ['id', 'name', 'agent', 'state', 'trigger', 'lastRun', 'progress'],
  Document: ['id', 'fileName', 'sizeLabel', 'status', 'domain', 'createdAt'],
  DistributorSale: ['id', 'distributor', 'country', 'product', 'sku', 'quarter', 'units', 'amountCents', 'currency'],
  Quotation: ['id', 'number', 'title', 'partner', 'tenderId', 'amountCents', 'currency', 'status', 'validUntil', 'createdBy', 'createdAt', 'updatedAt'],
};

export const SQL_TABLE_ROLES: Record<string, RoleId[]> = {
  Tender: ['sales', 'operations', 'management'],
  Invoice: ['finance', 'management'],
  CloseCheckItem: ['finance', 'management'],
  HrPolicy: ['hr', 'management'],
  LeaveRow: ['hr', 'management'],
  Job: ['operations', 'sales', 'management'],
  Document: ['sales', 'finance', 'hr', 'operations', 'management'],
  DistributorSale: ['sales', 'operations', 'management'],
  Quotation: ['sales', 'operations', 'management'],
};

export function sqlTablesFor(role: RoleId | undefined): string[] {
  if (!role) return [];
  return Object.keys(SQL_TABLE_ROLES).filter((t) => SQL_TABLE_ROLES[t].includes(role));
}

export const ASSISTANTS: AssistantDefinition[] = [
  {
    id: 'sales-assistant',
    role: 'sales',
    name: 'Sales Assistant',
    tagline: 'Tender, quotation & distributor sales',
    description: 'Government tender priorities, quotation checks, distributor sales comparison.',
    skillIds: ['tender-search', 'tender-analyze', 'quotation-check', 'sales-compare', 'text-to-sql'],
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
    skillIds: ['invoice-lookup', 'accrual-summary', 'payment-status', 'text-to-sql'],
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
    skillIds: ['leave-policy-qa', 'team-capacity-summary', 'text-to-sql'],
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
    skillIds: ['distributor-import-status', 'deadline-monitor', 'doc-extract-status', 'text-to-sql'],
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
    skillIds: ['cross-domain-summary', 'tender-search', 'sales-compare', 'accrual-summary', 'deadline-monitor', 'text-to-sql'],
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

// --- RBAC minimal: role apa boleh memakai assistant apa (server = enforcement,
// web = UI gating saja). Management bisa memakai semua kecuali ringkasan eksekutif
// yang memang khusus management.
export const ASSISTANT_ROLES: Record<string, RoleId[]> = {
  'sales-assistant': ['sales', 'operations', 'management'],
  'finance-assistant': ['finance', 'management'],
  'hr-assistant': ['hr', 'management'],
  'ops-assistant': ['operations', 'sales', 'management'],
  'management-assistant': ['management'],
};

export function canUseAssistant(role: RoleId | undefined, assistantId: string): boolean {
  if (!role || role === 'general') return false;
  return ASSISTANT_ROLES[assistantId]?.includes(role) ?? false;
}

export function allowedAssistants(role: RoleId | undefined): AssistantDefinition[] {
  if (!role || role === 'general') return [];
  return ASSISTANTS.filter((a) => canUseAssistant(role, a.id));
}

// --- Document domain scoping: dokumen general dibaca semua role aktif;
// finance/hr hanya oleh role sepadan + management (server enforcement).
export type DocDomain = 'general' | 'finance' | 'hr';

export function docVisibleToRole(role: RoleId | undefined, domain: string): boolean {
  if (domain === 'general') return true;
  if (role === 'management') return true;
  if (domain === 'finance') return role === 'finance';
  if (domain === 'hr') return role === 'hr';
  return false;
}

export function canUploadDomain(role: RoleId | undefined, domain: string): boolean {
  if (domain === 'general') return true;
  if (role === 'management') return true;
  if (domain === 'finance') return role === 'finance';
  if (domain === 'hr') return role === 'hr';
  return false;
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
  actor: 'ai' | 'human' | 'system';
  action: 'created' | 'edited' | 'submitted' | 'approved' | 'rejected' | 'escalated';
  note?: string;
}

// SLA review draft (hari). Override via env DRAFT_SLA_DAYS di API.
export const DRAFT_SLA_DAYS = 3;

/** True bila draft masih in_review melewati SLA — pure, dipakai API + tests. */
export function isDraftOverdue(
  draft: { status: DraftStatus; updatedAt: string },
  nowMs: number = Date.now(),
  slaDays: number = DRAFT_SLA_DAYS,
): boolean {
  if (draft.status !== 'in_review') return false;
  const t = Date.parse(draft.updatedAt);
  if (Number.isNaN(t)) return false;
  return nowMs - t > slaDays * 86_400_000;
}

/** True bila draft sudah pernah dieskalasi (idempotensi sweep) — pure. */
export function wasEscalated(draft: { history: DraftHistoryEntry[] }): boolean {
  return draft.history.some((h) => h.action === 'escalated');
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
  /** Tautan balik ke quotation (diisi saat request approval dari /quotations) —
   * approve draft → quotation approved; reject → quotation kembali draft. */
  sourceQuotationId?: string;
  /** Tautan balik ke space (diisi saat draft dibuat dengan space aktif). */
  spaceId?: string;
  /** Conversation asal draft (eksplisit, bukan tebakan). Diisi saat draft dibuat
   * dari halaman conversation dengan thread aktif. */
  sourceConversationId?: string;
  createdAt: string;
  updatedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  /** AppUser.id pembuat — list difilter per user (management: semua). */
  createdBy?: string;
  history: DraftHistoryEntry[];
}

/** Draft final (approved/rejected) tidak boleh diedit diam-diam — pure, dipakai API + tests. */
export function canEditDraftStatus(status: DraftStatus): boolean {
  return status === 'draft' || status === 'in_review';
}

// --- Approval chain (maker-checker): siapa boleh approve draft apa -----------------
// Aturan:
// - payment-approval (uang keluar): hanya management.
// - tender-brief / quotation-review / sales-summary / approval-summary:
//   approver harus operations/management DAN bukan pembuatnya (maker ≠ checker).
//   Draft lama tanpa createdBy tidak digantung: cukup cek role.
// - general (risiko rendah): pemilik atau management (ownership dicek di route).
// Pure — dipakai API + tests. Reject/withdraw tidak dibatasi chain ini
// (menolak = fail-safe; route tetap wajib owner/management).

export type ApproverKind = 'tender-brief' | 'quotation-review' | 'sales-summary' | 'approval-summary' | 'payment-approval' | 'general';

const CHECKED_KINDS: ApproverKind[] = [
  'tender-brief',
  'quotation-review',
  'sales-summary',
  'approval-summary',
];

export function canApproveDraft(
  draft: { kind: DraftKind | string; createdBy?: string | null },
  approver: { id: string; role: RoleId | string },
): boolean {
  if (draft.kind === 'payment-approval') return approver.role === 'management';
  if ((CHECKED_KINDS as string[]).includes(draft.kind)) {
    if (approver.role !== 'operations' && approver.role !== 'management') return false;
    if (draft.createdBy && draft.createdBy === approver.id) return false;
    return true;
  }
  return true;
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

/** Template isi draft per kind — satu bentuk baku agar brief/ringkasan selalu
 * punya struktur yang sama: ringkasan, fakta kunci, rekomendasi, sumber.
 * Fakta hanya diisi dari data nyata (kartu tender live / field ekstraksi),
 * tidak pernah dikarang. Pure, dipakai FE + tests. */
export interface DraftBodyInput {
  summary: string;
  facts?: string[];
  recommendation?: string;
  sources?: { label: string; detail: string }[];
  assistantName?: string;
  /** Dokumen lampau yang strukturnya ditiru (dari RAG) — ditulis jujur di footer. */
  templateRefs?: string[];
}

/** Satu seksi hasil parse body draft — pure, dipakai renderer kartu dokumen. */
export interface DraftSection {
  heading: string | null;
  paragraphs: string[];
  bullets: string[];
  table?: { head: string[]; rows: string[][] };
  footer?: boolean;
}

/** Serialize seksi kembali ke markdown template (invers parseDraftBody) — dipakai
 * editor terstruktur agar hasil edit tetap dalam format baku. Pure. */
export function serializeDraftBody(sections: DraftSection[]): string {
  const out: string[] = [];
  for (const s of sections) {
    if (s.footer) {
      out.push('---');
      for (const p of s.paragraphs) out.push(p);
      continue;
    }
    if (s.heading) out.push(`## ${s.heading}`);
    for (const p of s.paragraphs) out.push(p);
    for (const b of s.bullets) out.push(`- ${b}`);
    if (s.table) {
      out.push(`| ${s.table.head.join(' | ')} |`);
      for (const r of s.table.rows) out.push(`| ${r.join(' | ')} |`);
    }
  }
  return out.join('\n\n');
}

/** Parse body template (## heading, - bullet, | tabel |, --- footer) jadi seksi
 * terstruktur untuk kartu dokumen ala Joule. Pure, dipakai FE + tests. */
export function parseDraftBody(body: string): DraftSection[] {
  const sections: DraftSection[] = [];
  let cur: DraftSection = { heading: null, paragraphs: [], bullets: [] };
  let tableRows: string[][] = [];

  const flushTable = () => {
    if (tableRows.length >= 2) {
      const [head, ...rest] = tableRows;
      const rows = rest.filter((r) => !r.every((c) => /^:?-+:?$/.test(c.trim())));
      cur.table = { head, rows };
    } else if (tableRows.length === 1) {
      cur.paragraphs.push(tableRows[0].join(' | '));
    }
    tableRows = [];
  };
  const push = () => {
    flushTable();
    if (cur.heading || cur.paragraphs.length || cur.bullets.length || cur.table || cur.footer) {
      sections.push(cur);
    }
    cur = { heading: null, paragraphs: [], bullets: [] };
  };

  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line === '---') {
      push();
      cur.footer = true;
      continue;
    }
    if (cur.footer) {
      cur.paragraphs.push(line);
      continue;
    }
    if (line.startsWith('## ')) {
      push();
      cur.heading = line.slice(3).trim();
      continue;
    }
    if (line.startsWith('- ')) {
      flushTable();
      cur.bullets.push(line.slice(2).trim());
      continue;
    }
    if (line.includes('|') && line.split('|').filter((c) => c.trim()).length >= 2) {
      const cells = line.split('|').map((c) => c.trim()).filter((c) => c !== '');
      if (cells.length >= 2) {
        tableRows.push(cells);
        continue;
      }
    }
    flushTable();
    cur.paragraphs.push(line);
  }
  push();
  return sections;
}

const FACTS_LABEL: Record<DraftKind, string> = {
  'tender-brief': 'Key tender facts',
  'approval-summary': 'Key facts',
  'quotation-review': 'Key quotation facts',
  'sales-summary': 'Key sales facts',
  'payment-approval': 'Key payment facts',
  general: 'Key facts',
};

export function renderDraftBody(kind: DraftKind, input: DraftBodyInput): string {
  const parts: string[] = [input.summary.trim()];
  if (input.facts?.length) {
    parts.push(`## ${FACTS_LABEL[kind]}\n${input.facts.map((f) => `- ${f}`).join('\n')}`);
  }
  if (input.recommendation?.trim()) {
    parts.push(`## Recommendation\n${input.recommendation.trim()}`);
  }
  if (input.sources?.length) {
    parts.push(`## Sources\n${input.sources.map((s) => `- ${s.label}${s.detail ? ` — ${s.detail}` : ''}`).join('\n')}`);
  }
  const footer = [`Prepared by ${input.assistantName ?? 'Street Smart AI'} · ${new Date().toISOString().slice(0, 10)} · Status: draft — AI drafts, humans decide.`];
  if (input.templateRefs?.length) {
    footer.push(`Structure follows: ${input.templateRefs.join(', ')} (past uploads — facts still from live data).`);
  }
  parts.push(`---\n${footer.join(' ')}`);
  return parts.filter(Boolean).join('\n\n');
}

function tenderFactLine(id: string): string | null {
  const t = tenders.find((x) => x.id === id);
  return t ? `${t.id} — ${t.name} (${t.agency}, ${t.value}, closes ${t.date}, ${t.status})` : null;
}

/** Nama file dokumen lampau dari sitasi RAG (detail 'part #N') — dipakai sebagai
 * referensi template yang jujur. Pure. */
export function templateRefsFromSources(sources: { label: string; detail: string }[] | undefined): string[] {
  if (!sources) return [];
  const out: string[] = [];
  for (const s of sources) {
    if (/^part #\d+/.test(s.detail.trim()) && !out.includes(s.label)) out.push(s.label);
  }
  return out.slice(0, 3);
}

/** Bangun draft awal dari jawaban chat — dipakai FE saat API tidak terjangkau. */
export function buildDraftFromChat(
  question: string,
  answer: ChatResponse,
  kind: DraftKind = 'general',
): Draft {
  const now = new Date().toISOString();
  const assistantName = ASSISTANTS.find((a) => a.id === answer.assistantId)?.name;
  return {
    id: `local-${Date.now()}`,
    kind,
    title: answer.answerTitle || `Draft for: ${question.slice(0, 60)}`,
    body: renderDraftBody(kind, {
      summary: answer.answerCopy,
      facts: (answer.tenderIds ?? []).map(tenderFactLine).filter((f): f is string => Boolean(f)),
      recommendation: answer.recommendation,
      sources: answer.sources ?? [],
      assistantName,
      templateRefs: templateRefsFromSources(answer.sources),
    }),
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

/** Map extraction kind → draft kind so "Create draft" reuses the /api/drafts API. */
export function draftKindForExtraction(kind: string): DraftKind {
  const k = kind.toLowerCase();
  if (k.includes('tender')) return 'tender-brief';
  if (k.includes('quotation')) return 'approval-summary';
  if (k.includes('sales')) return 'sales-summary';
  if (k.includes('invoice') || k.includes('payment')) return 'payment-approval';
  return 'general';
}

/** Offline fallback for the Spaces list (same 4 workspaces as the DB seed). */
export const fallbackSpaces: SpaceSummary[] = [
  { id: 'sp-tender-review', name: 'Tender Opportunity Review', description: 'Review and prioritize active government tenders.', tone: 'amber', icon: 'file', createdAt: '', updatedAt: '', itemCount: 1, byKind: { tender: 1 } },
  { id: 'sp-distributor', name: 'Distributor Performance', description: 'Analyze sales by region, product, and quarter.', tone: 'blue', icon: 'chart', createdAt: '', updatedAt: '', itemCount: 1, byKind: { note: 1 } },
  { id: 'sp-product', name: 'Product Portfolio Intelligence', description: 'Explore catalogue, pricing, and sales trends.', tone: 'green', icon: 'grid', createdAt: '', updatedAt: '', itemCount: 0, byKind: {} },
  { id: 'sp-response', name: 'Government Tender Response', description: 'Organize requirements, compliance, and tasks.', tone: 'purple', icon: 'check', createdAt: '', updatedAt: '', itemCount: 0, byKind: {} },
];

// --- Fixture data (originally from Figma Make App.tsx) --------------------------------
// NOTE: the arrays below are NOT runtime fallbacks. The API never serves them when
// the DB is down (services throw 503 instead). Remaining uses:
//   1. `apps/api/prisma/seed.ts` — initial database content,
//   2. unit tests as deterministic fixtures,
//   3. `mockChatAnswer` — used by tests + labelled offline-emergency answers in web.
// Do not add new live-path usages.

export const prompts: string[] = [
  'Which government tenders should we prioritize this month?',
  'Show overdue invoices and what blocks month-end close.',
  'How much leave is the team taking this week?',
  'Compare distributor sales in New Zealand and Australia.',
  'Which jobs or documents need attention right now?',
  'Give me a cross-domain risk summary for this week.',
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
  { id: 'HR-POL-LEAVE', topic: 'leave', title: 'Annual & sick leave', summary: '20 days annual leave, 10 days sick leave per year. Apply H-7 via HR.' },
  { id: 'HR-POL-REMOTE', topic: 'remote', title: 'Hybrid work', summary: 'Up to 2 remote days per week with team lead approval.' },
  { id: 'HR-POL-TRAVEL', topic: 'travel', title: 'Site travel', summary: 'NZ site trips need ops lead approval; claims within 14 days after the trip.' },
];

export const leaveRoster: LeaveRow[] = [
  { id: 'LV-2026-W46-OPS', team: 'Operations', weekLabel: 'W46 (9–15 Nov)', headcount: 8, onLeave: 2 },
  { id: 'LV-2026-W46-SALES', team: 'Sales', weekLabel: 'W46 (9–15 Nov)', headcount: 6, onLeave: 1 },
  { id: 'LV-2026-W46-FIN', team: 'Finance', weekLabel: 'W46 (9–15 Nov)', headcount: 4, onLeave: 0 },
];

/** Distributor sales (aggregate, no customer PII). Story: NZ flat on units, AU +14% Q2→Q3, SRS-8 leads (+22% NZ). */
export const distributorSales: DistributorSale[] = [
  { id: 'DS-NZ-Q2-SRS8', distributor: 'Auckland Distributor Ltd', country: 'New Zealand', product: 'Smartstud', sku: 'SRS-8', quarter: '2026-Q2', units: 1000, amountCents: 14500000, currency: 'NZD' },
  { id: 'DS-NZ-Q3-SRS8', distributor: 'Auckland Distributor Ltd', country: 'New Zealand', product: 'Smartstud', sku: 'SRS-8', quarter: '2026-Q3', units: 1220, amountCents: 17690000, currency: 'NZD' },
  { id: 'DS-NZ-Q2-SPD4', distributor: 'Auckland Distributor Ltd', country: 'New Zealand', product: 'Smartped', sku: 'SPD-4', quarter: '2026-Q2', units: 800, amountCents: 7600000, currency: 'NZD' },
  { id: 'DS-NZ-Q3-SPD4', distributor: 'Auckland Distributor Ltd', country: 'New Zealand', product: 'Smartped', sku: 'SPD-4', quarter: '2026-Q3', units: 680, amountCents: 6460000, currency: 'NZD' },
  { id: 'DS-NZ-Q2-TNL2', distributor: 'Auckland Distributor Ltd', country: 'New Zealand', product: 'Tunnel markers', sku: 'TNL-2', quarter: '2026-Q2', units: 500, amountCents: 3000000, currency: 'NZD' },
  { id: 'DS-NZ-Q3-TNL2', distributor: 'Auckland Distributor Ltd', country: 'New Zealand', product: 'Tunnel markers', sku: 'TNL-2', quarter: '2026-Q3', units: 400, amountCents: 2400000, currency: 'NZD' },
  { id: 'DS-AU-Q2-SRS8', distributor: 'Brisbane Road Systems', country: 'Australia', product: 'Smartstud', sku: 'SRS-8', quarter: '2026-Q2', units: 1200, amountCents: 17400000, currency: 'AUD' },
  { id: 'DS-AU-Q3-SRS8', distributor: 'Brisbane Road Systems', country: 'Australia', product: 'Smartstud', sku: 'SRS-8', quarter: '2026-Q3', units: 1500, amountCents: 21750000, currency: 'AUD' },
  { id: 'DS-AU-Q2-SPD4', distributor: 'Brisbane Road Systems', country: 'Australia', product: 'Smartped', sku: 'SPD-4', quarter: '2026-Q2', units: 900, amountCents: 8550000, currency: 'AUD' },
  { id: 'DS-AU-Q3-SPD4', distributor: 'Brisbane Road Systems', country: 'Australia', product: 'Smartped', sku: 'SPD-4', quarter: '2026-Q3', units: 990, amountCents: 9405000, currency: 'AUD' },
  { id: 'DS-AU-Q2-TNL2', distributor: 'Brisbane Road Systems', country: 'Australia', product: 'Tunnel markers', sku: 'TNL-2', quarter: '2026-Q2', units: 600, amountCents: 3600000, currency: 'AUD' },
  { id: 'DS-AU-Q3-TNL2', distributor: 'Brisbane Road Systems', country: 'Australia', product: 'Tunnel markers', sku: 'TNL-2', quarter: '2026-Q3', units: 600, amountCents: 3600000, currency: 'AUD' },
];

export function formatMoney(cents: number, currency: string): string {
  const n = cents / 100;
  return `${currency} ${n.toLocaleString('en-NZ', { maximumFractionDigits: 0 })}`;
}

/** Sales answer computed from live distributor rows — never hardcoded. */
export function salesAnswer(rows: DistributorSale[], viaLabel: string): ChatResponse {
  const by = (country: string, quarter: string) => rows.filter((r) => r.country === country && r.quarter === quarter);
  const units = (rs: DistributorSale[]) => rs.reduce((a, r) => a + r.units, 0);
  const nzQ2 = by('New Zealand', '2026-Q2');
  const nzQ3 = by('New Zealand', '2026-Q3');
  const auQ2 = by('Australia', '2026-Q2');
  const auQ3 = by('Australia', '2026-Q3');
  const pct = (a: number, b: number) => (a ? `${(((b - a) / a) * 100).toFixed(1)}%` : 'n/a');
  const prod = (sku: string) => {
    const q2 = rows.filter((r) => r.sku === sku && r.quarter === '2026-Q2').reduce((a, r) => a + r.units, 0);
    const q3 = rows.filter((r) => r.sku === sku && r.quarter === '2026-Q3').reduce((a, r) => a + r.units, 0);
    return { q2, q3, sku };
  };
  const skus = [...new Set(rows.map((r) => r.sku))].map(prod).sort((a, b) => b.q3 - a.q3);
  const top = skus[0];
  return {
    answerTitle: `Distributor snapshot: NZ vs AU (${viaLabel})`,
    answerCopy:
      `New Zealand ${units(nzQ2).toLocaleString()} → ${units(nzQ3).toLocaleString()} units Q2→Q3 (${pct(units(nzQ2), units(nzQ3))}, essentially flat). ` +
      `Australia ${units(auQ2).toLocaleString()} → ${units(auQ3).toLocaleString()} units (${pct(units(auQ2), units(auQ3))} growth). ` +
      (top ? `Top SKU: ${top.sku} at ${top.q3.toLocaleString()} units in Q3 (${pct(top.q2, top.q3)} vs Q2). ` : '') +
      `Full breakdown is in Distributor Performance space.`,
    tenderIds: [],
    recommendation: 'Follow up on declining NZ distributors first, and replicate the successful AU bundling.',
    sources: [
      { label: 'Distributor sales (live rows)', detail: `${rows.length} rows · ${viaLabel}` },
      { label: 'Distributor Performance Space', detail: 'Updated yesterday' },
    ],
    followUps: ['Show NZ distributors with declining sales', 'Which SKUs drive growth?', 'Total revenue by quarter'],
    assistantId: 'sales-assistant',
    skillsUsed: ['sales-compare'],
  };
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
  const lines = [
    `Open AR ${formatMoney(sum(open('AR')), cur)} (${open('AR').length} invoices) · Open AP ${formatMoney(sum(open('AP')), cur)} (${open('AP').length} invoices)`,
    '',
    ...(overdue.length
      ? ['Overdue — needs action:', ...overdue.map((i) => `• ${i.id} — ${i.partner} — ${formatMoney(i.amountCents, i.currency)} (due ${i.dueLabel})`), '']
      : ['No overdue invoices.', '']),
    `Month-end close ${cc[0]?.period ?? ''}: ${done}/${cc.length} done` +
      (pending.length ? '\n' + pending.map((p) => `• [ ] ${p}`).join('\n') : ' — all clear'),
    '',
    'Payment actions need human approval — I prepare the draft, never execute directly.',
  ];
  return {
    answerTitle: `Finance snapshot (${viaLabel})`,
    answerCopy: lines.join('\n'),
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

/** Ops answer computed from live jobs + document stats — never hardcoded. */
export interface DocStats {
  total: number;
  byStatus: Record<string, number>;
  processing: string[];
}

export function opsAnswer(jobsList: JobItem[], docs: DocStats, viaLabel: string): ChatResponse {
  const running = jobsList.filter((j) => /running|active/i.test(j.state));
  const byState = (s: string) => jobsList.filter((j) => j.state.toLowerCase() === s).length;
  const alerts: string[] = [];
  if (docs.byStatus.Processing) alerts.push(`${docs.byStatus.Processing} document(s) still extracting`);
  const stale = jobsList.find((j) => /behind|delay/i.test(`${j.name} ${j.agent} ${j.lastRun}`));
  const lines = [
    `${jobsList.length} tracked jobs · ${running.length} active · ${byState('completed')} completed · ${byState('scheduled')} scheduled`,
    '',
    `Documents: ${docs.total} total` +
      (Object.keys(docs.byStatus).length ? ` (${Object.entries(docs.byStatus).map(([s, n]) => `${n} ${s}`).join(' · ')})` : ''),
    ...(docs.processing.length ? [`Extracting now:\n` + docs.processing.slice(0, 3).map((f) => `• ${f}`).join('\n')] : []),
    ...(stale ? ['', `Watch: ${stale.name} (${stale.lastRun})`] : []),
    ...(alerts.length ? ['', `Alerts: ${alerts.join(' · ')}`] : []),
  ];
  return {
    answerTitle: `Operations status (${viaLabel})`,
    answerCopy: lines.join('\n'),
    tenderIds: [],
    recommendation: docs.byStatus.Processing
      ? 'Wait for extraction to finish before tender analysis; check Data connections for delays.'
      : 'Queue is clear — safe to run tender analysis and weekly summaries.',
    sources: [
      { label: 'Jobs queue', detail: viaLabel },
      { label: 'Document ingestion', detail: viaLabel },
    ],
    followUps: ['Show running jobs', 'Which documents are still processing?', 'Show upcoming deadlines'],
    assistantId: 'ops-assistant',
    skillsUsed: ['distributor-import-status', 'doc-extract-status', 'deadline-monitor'],
  };
}

/** HR answer from policies + aggregate roster (no individual names/salaries). */
export function hrAnswer(pol: HrPolicy[], ros: LeaveRow[], viaLabel: string): ChatResponse {
  const headcount = ros.reduce((a, r) => a + r.headcount, 0);
  const onLeave = ros.reduce((a, r) => a + r.onLeave, 0);
  const leave = pol.find((p) => p.topic === 'leave');
  const lines = [
    ...(leave ? [`Policy: ${leave.summary}`, ''] : []),
    `Capacity: ${headcount} people, ${onLeave} on leave`,
    ...ros.map((r) => `• ${r.team}: ${r.onLeave}/${r.headcount} on leave (${r.weekLabel})`),
    '',
    'Individual salary details are never shown.',
  ];
  return {
    answerTitle: `HR snapshot (${viaLabel})`,
    answerCopy: lines.join('\n'),
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

/** Sapaan / basa-basi pendek — dijawab singkat tanpa kartu, tabel, maupun tombol. */
export function isGreeting(question: string): boolean {
  const t = question.trim().toLowerCase();
  return t.length > 0 && t.length <= 20 && /^(hi|hello|hey|hei|hai|halo|yo|pagi|siang|sore|malam|thanks|thank you|terima kasih|ok|oke|test)\b/.test(t);
}

export function greetingAnswer(assistantId?: string): ChatResponse {
  return {
    answerTitle: 'Hi there — how can I help?',
    answerCopy: 'Ask me about tenders, invoices, leave, jobs, documents, or distributor sales — in your own words.',
    tenderIds: [],
    recommendation: '',
    sources: [],
    followUps: ['What can you help me with?', 'Show my pending items'],
    assistantId,
    skillsUsed: [],
  };
}

export function mockChatAnswer(question: string, assistantId?: string): ChatResponse {
  const q = question.toLowerCase();
  if (isGreeting(question)) return greetingAnswer(assistantId);
  const aid = assistantId ?? inferAssistantId(question);
  if (aid === 'finance-assistant') return financeAnswer(invoices, closeChecklist, 'simulated');
  if (aid === 'hr-assistant') return hrAnswer(hrPolicies, leaveRoster, 'simulated');
  if (aid === 'ops-assistant') {
    return opsAnswer(jobs, { total: 3, byStatus: { Processed: 1, Processing: 1, Completed: 1 }, processing: ['Distributor_Sales_Q3.xlsx'] }, 'simulated');
  }
  if (aid === 'management-assistant') {
    return {
      answerTitle: 'Executive summary (simulated, read-only)',
      answerCopy:
        'Pipeline: 6 tenders (3 NZ priorities)\n' +
        '• Sales: AU +14%, NZ flat\n' +
        '• Finance: closing 3/5 ready\n' +
        '• Ops: 1 sync delay\n' +
        '\nTop risks: Auckland deadline in 5 days + incomplete accruals.',
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
        '• Australia: +14% in Q3\n' +
        '• New Zealand: flat\n' +
        '• Top SKU: Smartstud SRS-8 (+22% QoQ)\n' +
        '\nFull breakdown is in Distributor Performance space.',
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
        '• Total value: ~NZD 310K (Smartstud + Smartped lines)\n' +
        '• 2 linked to Auckland and Wellington tenders closing within 30 days',
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
