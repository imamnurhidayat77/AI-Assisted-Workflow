import type { DocumentExtraction, ExtractionField, ExtractionSource } from '@street-smart/shared';

// Batas konteks agar biaya/kuota terkendali — preview route tetap 400 char.
const MAX_CHARS = 8000;
const MAX_FIELDS = 12;
const MAX_MISSING = 10;

/**
 * Ekstraksi field terstruktur via LLM (Responses API — pola sama seperti chatWithHttp).
 * Return null bila provider tidak dikonfigurasi ATAU kapan pun gagal — caller WAJIB
 * fallback ke ekstraksi deterministik agar preview tidak pernah rusak.
 * Duplikasi boilerplate HTTP disengaja: jalur chat tidak disentuh (minim konflik).
 */
export async function extractWithLLM(fileName: string, text: string): Promise<DocumentExtraction | null> {
  if ((process.env.EXTRACT_PROVIDER ?? 'mock').toLowerCase() !== 'http') return null;
  const base = process.env.LLM_BASE_URL?.replace(/\/$/, '');
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL ?? 'muse-spark-1.3-contributor';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!base || !key || !clean) return null;
  const input = [
    'Extract structured business-document fields. Classify the document (Government Tender, Distributor Sales, Quotation, Invoice, HR Policy, or General Document).',
    'For EACH field report: label, value (exact text when present), confidence 0..1, source ("extracted" = read directly, "inferred" = completed from context, "missing" = not found with value "—"), needsReview (true when a human should verify).',
    'List data that is absent but expected under missingFields (max 10). Max 12 fields, most decision-relevant first.',
    'OUTPUT CONTRACT: your entire response is exactly one valid JSON object and nothing else — no intro, no explanation, no code fences:',
    '{"kind":string,"fields":[{"label":string,"value":string,"confidence":number,"source":"extracted"|"inferred"|"missing","needsReview":boolean}],"missingFields":string[]}',
    '',
    `File: ${fileName.slice(0, 120)}`,
    `Text: ${clean.slice(0, MAX_CHARS)}`,
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
        'User-Agent': 'street-smart-cockpit/0.1.0',
      },
      body: JSON.stringify({ model, input, reasoning: { effort: 'low' }, max_output_tokens: 2000 }),
    });
    if (!res.ok) return null;
    const parsed: unknown = JSON.parse(stripFences(extractOutputText(await res.json())));
    return sanitizeExtraction(parsed);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Validasi + clamp output model — pure, unit-tested. Return null bila tak dapat dipakai. */
export function sanitizeExtraction(raw: unknown): DocumentExtraction | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as { kind?: unknown; fields?: unknown; missingFields?: unknown };
  const kind = typeof o.kind === 'string' && o.kind.trim() ? o.kind.trim().slice(0, 80) : 'General Document';
  if (!Array.isArray(o.fields) || !o.fields.length) return null;
  const fields: ExtractionField[] = [];
  for (const f of o.fields.slice(0, MAX_FIELDS)) {
    if (typeof f !== 'object' || f === null) continue;
    const r = f as { label?: unknown; value?: unknown; confidence?: unknown; source?: unknown; needsReview?: unknown };
    if (typeof r.label !== 'string' || !r.label.trim()) continue;
    const source: ExtractionSource =
      r.source === 'extracted' || r.source === 'inferred' || r.source === 'missing' ? r.source : 'inferred';
    const confidence =
      typeof r.confidence === 'number' && Number.isFinite(r.confidence)
        ? Math.min(1, Math.max(0, r.confidence))
        : 0.5;
    fields.push({
      label: r.label.trim().slice(0, 80),
      value: typeof r.value === 'string' && r.value ? r.value.slice(0, 500) : '—',
      confidence: Math.round(confidence * 100) / 100,
      source,
      // Aturan: bukan-bacaan-langsung atau keyakinan rendah selalu minta verifikasi manusia.
      needsReview: typeof r.needsReview === 'boolean' ? r.needsReview : source !== 'extracted' || confidence < 0.85,
    });
  }
  if (!fields.length) return null;
  const missingFields = Array.isArray(o.missingFields)
    ? o.missingFields.filter((m): m is string => typeof m === 'string' && !!m.trim()).slice(0, MAX_MISSING).map((m) => m.trim().slice(0, 80))
    : [];
  const confidence = Math.round((fields.reduce((s, f) => s + f.confidence, 0) / fields.length) * 100) / 100;
  return { kind, confidence, fields, missingFields };
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
