import { PrismaClient } from '@prisma/client';
import {
  SQL_TABLE_COLUMNS,
  sqlTablesFor,
  type DistributorSale,
  type RoleId,
} from '@street-smart/shared';

let client: PrismaClient | null = null;

async function db(): Promise<PrismaClient | null> {
  if (client) return client;
  if (!process.env.DATABASE_URL) return null;
  try {
    const c = new PrismaClient();
    await c.$queryRaw`SELECT 1`;
    client = c;
    return c;
  } catch {
    return null;
  }
}

const MAX_LIMIT = 50;

// Kata/karakter yang tidak pernah boleh ada di query user/LLM.
const FORBIDDEN = /;|--|\/\*|\*\/|\b(union|join|insert|update|delete|drop|alter|create|truncate|grant|revoke|exec|execute|copy|pg_|information_schema)\b/i;

// SELECT [DISTINCT] col|*|COUNT(*)|SUM(col) FROM Tabel [WHERE ...] [ORDER BY col[, col...] [ASC|DESC]] [LIMIT n]
const SHAPE =
  /^select\s+(distinct\s+)?(\*|[\w\s,()*]+?)\s+from\s+"?(\w+)"?(?:\s+where\s+(.+?))?(?:\s+order\s+by\s+((?:"?\w+"?)(?:\s*,\s*"?\w+"?)*)(?:\s+(asc|desc))?)?(?:\s+limit\s+(\d+))?\s*$/i;

export interface ValidatedQuery {
  table: string;
  columns: string[];
  aggregate: { fn: 'COUNT' | 'SUM'; column: string } | null;
}

function splitColumns(select: string): string[] {
  // Pisah koma level-atas (abaikan koma di dalam COUNT()/SUM()).
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of select) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Validasi ketat: bentuk, tabel, kolom, dan operator WHERE melawan allowlist role. */
export function validateSql(sql: string, role: RoleId | undefined): ValidatedQuery {
  const cleaned = sql.trim().replace(/\s+/g, ' ');
  if (!cleaned || cleaned.length > 2000) throw Object.assign(new Error('query too long'), { status: 400 });
  if (FORBIDDEN.test(cleaned)) throw Object.assign(new Error('forbidden token in query'), { status: 400 });
  const m = cleaned.match(SHAPE);
  if (!m) throw Object.assign(new Error('only simple SELECT … FROM … [WHERE …] [ORDER BY …] [LIMIT n] allowed'), { status: 400 });
  const [, , selectPart, rawTable, rawWhere, rawOrder, , rawLimit] = m;
  const table = rawTable;
  const allowedTables = new Set(sqlTablesFor(role));
  if (!SQL_TABLE_COLUMNS[table] || !allowedTables.has(table)) {
    throw Object.assign(new Error(`table '${table}' not allowed for this role`), { status: 403 });
  }
  const cols = SQL_TABLE_COLUMNS[table];
  const limit = rawLimit ? Number(rawLimit) : MAX_LIMIT;
  if (!Number.isFinite(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw Object.assign(new Error(`LIMIT must be 1–${MAX_LIMIT}`), { status: 400 });
  }
  let aggregate: ValidatedQuery['aggregate'] = null;
  const selected = splitColumns(selectPart);
  const columns: string[] = [];
  for (const part of selected) {
    const agg = part.match(/^(count|sum)\(\s*(\*|\w+)\s*\)$/i);
    if (agg) {
      if (aggregate) throw Object.assign(new Error('at most one aggregate per query'), { status: 400 });
      const fn = agg[1].toUpperCase() as 'COUNT' | 'SUM';
      const col = agg[2];
      if (fn === 'SUM' && (col === '*' || !cols.includes(col))) {
        throw Object.assign(new Error(`SUM column '${col}' not allowed`), { status: 400 });
      }
      aggregate = { fn, column: col };
      continue;
    }
    const bare = part.replace(/^"|"$/g, '');
    if (part === '*') { columns.push(...cols); continue; }
    if (!cols.includes(bare)) throw Object.assign(new Error(`column '${bare}' not allowed on ${table}`), { status: 400 });
    columns.push(bare);
  }
  // WHERE: hanya AND dari perbandingan sederhana col OP 'literal'/angka.
  if (rawWhere) {
    const conds = rawWhere.split(/\s+and\s+/i);
    if (!conds.length) throw Object.assign(new Error('empty WHERE'), { status: 400 });
    for (const c of conds) {
      const cm = c.trim().match(/^"?(\w+)"?\s*(=|!=|<>|>|>=|<|<=|ilike|like)\s*('(?:[^']|'')*'|\d+(?:\.\d+)?)$/i);
      if (!cm) throw Object.assign(new Error(`WHERE condition not allowed: '${c.trim().slice(0, 60)}'`), { status: 400 });
      if (!cols.includes(cm[1])) throw Object.assign(new Error(`WHERE column '${cm[1]}' not allowed`), { status: 400 });
      if (/^(ilike|like)$/i.test(cm[2]) && !/^'[^']*'$/.test(cm[3])) {
        throw Object.assign(new Error('LIKE needs a quoted literal'), { status: 400 });
      }
    }
  }
  if (rawOrder) {
    const orderCols = rawOrder.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    for (const c of orderCols) {
      if (!cols.includes(c)) throw Object.assign(new Error(`ORDER BY column '${c}' not allowed`), { status: 400 });
    }
  }
  return { table, columns, aggregate };
}

function quoteIdent(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

/** Bangun ulang SQL dari hasil validasi (tidak pakai string mentah user/LLM). */
export function buildSql(v: ValidatedQuery, rawWhere: string | undefined, rawOrder: string | undefined, rawDir: string | undefined, rawLimit: string | undefined): string {
  const select = v.aggregate
    ? `${v.aggregate.fn}(${v.aggregate.column === '*' ? '*' : quoteIdent(v.aggregate.column)})`
    : v.columns.map(quoteIdent).join(', ');
  let q = `SELECT ${select} FROM ${quoteIdent(v.table)}`;
  if (rawWhere) {
    // Bentuk sudah divalidasi; normalisasi identifier tanpa mengubah literal.
    const conds = rawWhere.split(/\s+and\s+/i).map((c) => {
      const cm = c.trim().match(/^"?(\w+)"?\s*(=|!=|<>|>|>=|<|<=|ilike|like)\s*('(?:[^']|'')*'|\d+(?:\.\d+)?)$/i);
      if (!cm) throw new Error('unreachable: WHERE re-check failed');
      return `${quoteIdent(cm[1])} ${cm[2].toUpperCase()} ${cm[3]}`;
    });
    q += ` WHERE ${conds.join(' AND ')}`;
  }
  if (rawOrder) {
    const orderCols = rawOrder.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    q += ` ORDER BY ${orderCols.map(quoteIdent).join(', ')}${rawDir ? ` ${rawDir.toUpperCase()}` : ''}`;
  }
  q += ` LIMIT ${Math.min(rawLimit ? Number(rawLimit) : MAX_LIMIT, MAX_LIMIT)}`;
  return q;
}

export interface SqlResult {
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  via: 'db' | 'mock';
}

/** Jalankan query yang SUDAH tervalidasi. Tabel/kolom dijamin dari allowlist. */
export async function runValidatedSql(sql: string, role: RoleId | undefined): Promise<SqlResult> {
  const v = validateSql(sql, role);
  const m = sql.trim().replace(/\s+/g, ' ').match(SHAPE);
  const rebuilt = buildSql(v, m?.[4], m?.[5], m?.[6], m?.[7]);
  const prisma = await db();
  if (!prisma) throw Object.assign(new Error('database unreachable'), { status: 503 });
  const raw = (await prisma.$queryRawUnsafe(rebuilt)) as Record<string, unknown>[];
  // Postgres COUNT/SUM datang sebagai BigInt — ubah ke Number agar bisa di-JSON-kan.
  const rows = raw.map((r) => Object.fromEntries(
    Object.entries(r).map(([k, val]) => [k, typeof val === 'bigint' ? Number(val) : val]),
  ));
  const columns = v.aggregate
    ? [Object.keys(rows[0] ?? { count: 0 })[0]]
    : v.columns;
  return { sql: rebuilt, columns, rows: rows.slice(0, MAX_LIMIT), rowCount: rows.length, via: 'db' };
}

// --- Rule engine mock: pola agregasi umum tanpa LLM (offline-friendly). ---------
// Mengembalikan null bila pertanyaan tidak cocok pola → caller fallback ke jawaban mock biasa.
export function mockAnswerSql(
  question: string,
  role: RoleId | undefined,
  snap: {
    tenders: { id: string; status: string }[];
    invoices: { id: string; direction: string; partner: string; amountCents: number; currency: string; status: string }[];
    checklist: { done: boolean }[];
    policies: { id: string }[];
    roster: { headcount: number; onLeave: number }[];
    jobs: { state: string }[];
    docs: { total: number; byStatus: Record<string, number> };
    sales: DistributorSale[];
  },
): SqlResult | null {
  const q = question.toLowerCase();
  const tables = new Set(sqlTablesFor(role));
  const like = (re: RegExp) => re.test(q);

  if (tables.has('Invoice') && like(/invoice|overdue|tagihan|ar\b|hutang|piutang/)) {
    const overdue = snap.invoices.filter((i) => i.status === 'OVERDUE');
    if (like(/berapa|how many|total|jumlah|sum|list|tampilkan|show/)) {
      return {
        sql: `SELECT id, direction, partner, amountCents, status FROM "Invoice" WHERE status = 'OVERDUE' LIMIT ${MAX_LIMIT}`,
        columns: ['id', 'direction', 'partner', 'amountCents', 'status'],
        rows: overdue.map((i) => ({ id: i.id, direction: i.direction, partner: i.partner, amountCents: i.amountCents, status: i.status })),
        rowCount: overdue.length,
        via: 'mock',
      };
    }
  }
  if (tables.has('Tender') && like(/tender/)) {
    if (like(/berapa|how many|count|jumlah/)) {
      return {
        sql: `SELECT COUNT(*) FROM "Tender" LIMIT ${MAX_LIMIT}`,
        columns: ['count'],
        rows: [{ count: snap.tenders.length }],
        rowCount: 1,
        via: 'mock',
      };
    }
  }
  if (tables.has('Job') && like(/job|running|antrean|queue/)) {
    if (like(/berapa|how many|count|jumlah|running|aktif|active/)) {
      const n = snap.jobs.filter((j) => /running|active/i.test(j.state)).length;
      return {
        sql: `SELECT COUNT(*) FROM "Job" LIMIT ${MAX_LIMIT}`,
        columns: ['count'],
        rows: [{ count: n }],
        rowCount: 1,
        via: 'mock',
      };
    }
  }
  if (tables.has('LeaveRow') && like(/cuti|leave|capacity|kapasitas|headcount/)) {
    if (like(/berapa|how many|total|jumlah/)) {
      return {
        sql: `SELECT * FROM "LeaveRow" LIMIT ${MAX_LIMIT}`,
        columns: ['team', 'headcount', 'onLeave'],
        rows: snap.roster.map((r) => ({ team: (r as { team?: string }).team ?? '', headcount: r.headcount, onLeave: r.onLeave })),
        rowCount: snap.roster.length,
        via: 'mock',
      };
    }
  }
  if (tables.has('DistributorSale') && like(/sales|revenue|units|distributor|quarter|q[234]\b/)) {
    const mentionsNZ = /new zealand|\bnz\b/i.test(q);
    const mentionsAU = /australia|\bau\b/i.test(q);
    // Compare/both regions → no country filter so both sides show up.
    const bothOrCompare = (mentionsNZ && mentionsAU) || /compare|banding|\bvs\b/i.test(q);
    const country = bothOrCompare ? null : mentionsNZ ? 'New Zealand' : mentionsAU ? 'Australia' : null;
    const quarter = /q3\b|2026-q3/i.test(q) ? '2026-Q3' : /q2\b|2026-q2/i.test(q) ? '2026-Q2' : null;
    const scoped = snap.sales.filter((r) => (!country || r.country === country) && (!quarter || r.quarter === quarter));
    if (like(/compare|banding|\bvs\b/)) {
      const rows = [...scoped].sort((a, b) => a.quarter.localeCompare(b.quarter) || a.country.localeCompare(b.country));
      return {
        sql: `SELECT country, quarter, product, sku, units, amountCents FROM "DistributorSale" ORDER BY quarter, country LIMIT ${MAX_LIMIT}`,
        columns: ['country', 'quarter', 'product', 'sku', 'units', 'amountCents'],
        rows: rows.map((r) => ({ country: r.country, quarter: r.quarter, product: r.product, sku: r.sku, units: r.units, amountCents: r.amountCents })),
        rowCount: rows.length,
        via: 'mock',
      };
    }
    if (like(/top|teratas|highest|best|terlaris/)) {
      const rows = [...scoped].sort((a, b) => b.units - a.units).slice(0, 5);
      return {
        sql: `SELECT product, sku, units FROM "DistributorSale"${country ? ` WHERE country = '${country}'` : ''} ORDER BY units DESC LIMIT 5`,
        columns: ['product', 'sku', 'units'],
        rows: rows.map((r) => ({ product: r.product, sku: r.sku, units: r.units })),
        rowCount: rows.length,
        via: 'mock',
      };
    }
    if (like(/total|sum|jumlah|revenue|berapa|how many/)) {
      const units = scoped.reduce((a, r) => a + r.units, 0);
      const amount = scoped.reduce((a, r) => a + r.amountCents, 0);
      const where = [country ? `country = '${country}'` : null, quarter ? `quarter = '${quarter}'` : null].filter(Boolean).join(' AND ');
      return {
        sql: `SELECT SUM(units), SUM(amountCents) FROM "DistributorSale"${where ? ` WHERE ${where}` : ''} LIMIT ${MAX_LIMIT}`,
        columns: ['sum_units', 'sum_amountCents'],
        rows: [{ sum_units: units, sum_amountCents: amount }],
        rowCount: 1,
        via: 'mock',
      };
    }
  }
  return null;
}

export function isSqlIntent(question: string): boolean {
  return /(berapa|how many|count|total|sum|jumlah|rata|average|list|daftar|tampilkan|show|bandingkan|compare|overdue|rekap)/i.test(question);
}

const OPENCODE_SESSION = process.env.LLM_SESSION_ID ?? 'street-smart-sql';

function extractText(j: unknown): string {
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

/** Nilai enum yang valid — disuntik ke prompt agar LLM tidak mengarang varian case.
 * (Postgres enum case-sensitive; 'overdue' ≠ 'OVERDUE'.) */
const ENUM_HINTS: Record<string, string> = {
  Invoice: `direction IN ('AR','AP'), status IN ('UNPAID','PARTIAL','PAID','OVERDUE')`,
  Tender: `status IN ('IDENTIFIED','PENDING','SUBMITTED','WON','LOST')`,
  Document: `status IN ('Processing','Processed','Completed'), domain IN ('general','finance','hr')`,
  Job: `state IN ('Running','Completed','Active','Scheduled')`,
};

/** Minta LLM menulis SATU query SELECT dari tabel/kolom yang diizinkan role.
 * Hasil SELALU lewat validateSql sebelum dijalankan — LLM tidak dipercaya buta. */
export async function proposeSql(question: string, role: RoleId | undefined): Promise<string> {
  const base = process.env.LLM_BASE_URL?.replace(/\/$/, '');
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL ?? 'muse-spark-1.3-contributor';
  if (!base || !key) throw Object.assign(new Error('LLM not configured'), { status: 503 });
  const allowed = sqlTablesFor(role);
  if (!allowed.length) throw Object.assign(new Error('no queryable tables for this role'), { status: 403 });
  const catalog = allowed
    .map((t) => `- ${t}(${(SQL_TABLE_COLUMNS[t] ?? []).join(', ')})${ENUM_HINTS[t] ? ` — ${ENUM_HINTS[t]}` : ''}`)
    .join('\n');
  const input = [
    'You translate a business question into ONE read-only SQL query.',
    'Rules: single SELECT only. Allowed tables and columns (nothing else):',
    catalog,
    `Always add LIMIT ${MAX_LIMIT} (or smaller). WHERE: only AND of simple comparisons column OP literal, OP in = != <> > >= < <= LIKE ILIKE.`,
    'No JOIN, UNION, subqueries, functions except COUNT(*)/SUM(col), no comments.',
    'OUTPUT CONTRACT: exactly one JSON object, nothing else: {"sql": "SELECT ..."}',
    '',
    `Question: ${question.slice(0, 1000)}`,
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
        'x-opencode-session': `${OPENCODE_SESSION}-sql`,
        'User-Agent': 'street-smart-cockpit/0.1.0',
      },
      body: JSON.stringify({ model, input, reasoning: { effort: 'low' }, max_output_tokens: 4000 }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { status?: string };
    // Reasoning bisa memakan budget token (status incomplete) — jangan parse buta.
    // shortcut: budget lebih besar + cek status; kalau masih incomplete, naikkan lagi / sederhanakan prompt.
    const text = extractText(body).replace(/```(?:json)?/gi, '').trim();
    if (!text) throw Object.assign(new Error(`LLM returned no text (status: ${body.status ?? 'unknown'}) — retry`), { status: 502 });
    const parsed = JSON.parse(text) as { sql?: unknown };
    if (typeof parsed.sql !== 'string' || !parsed.sql.trim()) throw new Error('LLM returned no SQL');
    return parsed.sql;
  } finally {
    clearTimeout(timer);
  }
}
