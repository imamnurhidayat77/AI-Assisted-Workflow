import { describe, expect, it } from 'vitest';
import {
  allowedAssistants,
  buildDraftFromChat,
  canUploadDomain,
  canUseAssistant,
  docVisibleToRole,
  financeAnswer,
  greetingAnswer,
  hrAnswer,
  isGreeting,
  mockChatAnswer,
  opsAnswer,
  parseDraftBody,
  renderDraftBody,
  sanitizeActions,
  serializeDraftBody,
  SPACE_TEMPLATES,
  SQL_TABLE_COLUMNS,
  sqlTablesFor,
  templateRefsFromSources,
  isSpaceVisibility,
  type CloseCheckItem,
  type HrPolicy,
  type Invoice,
  type JobItem,
  type LeaveRow,
} from './index.js';

describe('assistant RBAC matrix', () => {
  it('finance hanya untuk finance + management', () => {
    expect(canUseAssistant('finance', 'finance-assistant')).toBe(true);
    expect(canUseAssistant('management', 'finance-assistant')).toBe(true);
    expect(canUseAssistant('sales', 'finance-assistant')).toBe(false);
    expect(canUseAssistant('hr', 'finance-assistant')).toBe(false);
  });

  it('management-assistant eksklusif management', () => {
    expect(canUseAssistant('management', 'management-assistant')).toBe(true);
    for (const r of ['sales', 'finance', 'hr', 'operations'] as const) {
      expect(canUseAssistant(r, 'management-assistant')).toBe(false);
    }
  });

  it('sales-assistant untuk sales + operations + management', () => {
    expect(canUseAssistant('sales', 'sales-assistant')).toBe(true);
    expect(canUseAssistant('operations', 'sales-assistant')).toBe(true);
    expect(canUseAssistant('finance', 'sales-assistant')).toBe(false);
  });

  it('role tak dikenal / general / undefined selalu ditolak', () => {
    expect(canUseAssistant(undefined, 'sales-assistant')).toBe(false);
    expect(canUseAssistant('general', 'sales-assistant')).toBe(false);
    expect(canUseAssistant('finance', 'nope-assistant')).toBe(false);
  });

  it('allowedAssistants konsisten dengan matrix', () => {
    expect(allowedAssistants('hr').map((a) => a.id)).toEqual(['hr-assistant']);
    expect(allowedAssistants('management').map((a) => a.id)).toContain('management-assistant');
    expect(allowedAssistants(undefined)).toEqual([]);
  });
});

describe('document domain scoping', () => {
  it('general terlihat semua; finance/hr terkunci role', () => {
    expect(docVisibleToRole('sales', 'general')).toBe(true);
    expect(docVisibleToRole(undefined, 'general')).toBe(true);
    expect(docVisibleToRole('finance', 'finance')).toBe(true);
    expect(docVisibleToRole('sales', 'finance')).toBe(false);
    expect(docVisibleToRole('hr', 'hr')).toBe(true);
    expect(docVisibleToRole('finance', 'hr')).toBe(false);
    expect(docVisibleToRole('management', 'hr')).toBe(true);
    expect(docVisibleToRole('management', 'finance')).toBe(true);
  });

  it('upload mengikuti aturan yang sama', () => {
    expect(canUploadDomain('sales', 'hr')).toBe(false);
    expect(canUploadDomain('hr', 'hr')).toBe(true);
    expect(canUploadDomain('management', 'finance')).toBe(true);
    expect(canUploadDomain('sales', 'general')).toBe(true);
  });
});

describe('text-to-SQL table scope', () => {
  it('sales tidak melihat tabel finance/hr; kolom sensitif tidak ada di mana pun', () => {
    expect(sqlTablesFor('sales')).not.toContain('Invoice');
    expect(sqlTablesFor('sales')).toContain('Tender');
    expect(sqlTablesFor('finance')).toContain('Invoice');
    expect(sqlTablesFor('finance')).not.toContain('HrPolicy');
    expect(sqlTablesFor('sales')).toContain('DistributorSale');
    expect(sqlTablesFor('operations')).toContain('DistributorSale');
    expect(sqlTablesFor('finance')).not.toContain('DistributorSale');
    expect(sqlTablesFor('sales')).toContain('Quotation');
    expect(sqlTablesFor('operations')).toContain('Quotation');
    expect(sqlTablesFor('management')).toContain('Quotation');
    expect(sqlTablesFor('finance')).not.toContain('Quotation');
    expect(sqlTablesFor('hr')).not.toContain('Quotation');
    expect(sqlTablesFor(undefined)).toEqual([]);
    const allCols = Object.values(SQL_TABLE_COLUMNS).flat();
    for (const secret of ['extractedText', 'apiKeyHash', 'body', 'decidedBy']) {
      expect(allCols).not.toContain(secret);
    }
  });
});

describe('aggregate builders menghitung dari baris (bukan hardcode)', () => {
  const inv: Invoice[] = [
    { id: 'A', direction: 'AR', partner: 'P1', amountCents: 10000, currency: 'NZD', status: 'OVERDUE', dueLabel: 'd1' },
    { id: 'B', direction: 'AR', partner: 'P2', amountCents: 5000, currency: 'NZD', status: 'PAID', dueLabel: 'd2' },
    { id: 'C', direction: 'AP', partner: 'P3', amountCents: 7000, currency: 'NZD', status: 'UNPAID', dueLabel: 'd3' },
  ];
  const cc: CloseCheckItem[] = [
    { id: '1', period: '2026-11', item: 'x', done: true, owner: 'Finance' },
    { id: '2', period: '2026-11', item: 'y', done: false, owner: 'Finance' },
  ];

  it('financeAnswer: AR terbuka tidak termasuk PAID; checklist dihitung', () => {
    const a = financeAnswer(inv, cc, 'live');
    expect(a.answerTitle).toContain('live');
    expect(a.answerCopy).toContain('NZD 100');
    expect(a.answerCopy).not.toContain('NZD 150');
    expect(a.answerCopy).toContain('1/2');
    expect(a.assistantId).toBe('finance-assistant');
  });

  it('hrAnswer agregat roster tanpa individu', () => {
    const pol: HrPolicy[] = [{ id: 'P', topic: 'leave', title: 'Leave', summary: '20 days' }];
    const ros: LeaveRow[] = [{ id: 'R', team: 'Ops', weekLabel: 'W1', headcount: 8, onLeave: 2 }];
    const a = hrAnswer(pol, ros, 'live');
    expect(a.answerCopy).toContain('8 people');
    expect(a.answerCopy).toContain('2 on leave');
  });

  it('opsAnswer menghitung jobs + dokumen', () => {
    const jobs: JobItem[] = [
      { name: 'a', agent: 'x', state: 'Running', trigger: 't', lastRun: 'now', progress: '—' },
      { name: 'b', agent: 'x', state: 'Completed', trigger: 't', lastRun: 'now', progress: '—' },
    ];
    const a = opsAnswer(jobs, { total: 3, byStatus: { Processed: 2, Processing: 1 }, processing: ['f.pdf'] }, 'live');
    expect(a.answerCopy).toContain('2 tracked jobs');
    expect(a.answerCopy).toContain('f.pdf');
    expect(a.assistantId).toBe('ops-assistant');
  });
});

describe('draft body template', () => {
  it('punya seksi baku per kind dan tidak mengarang fakta', () => {
    const body = renderDraftBody('tender-brief', {
      summary: 'Ringkasan singkat.',
      facts: ['TND-2026-001 — Auckland (NZTA, NZD 1,250,000)'],
      recommendation: 'Prioritaskan Auckland.',
      sources: [{ label: 'NZTA_Tender_2026.pdf', detail: 'Page 4' }],
      assistantName: 'Sales Assistant',
    });
    expect(body).toContain('## Key tender facts');
    expect(body).toContain('## Recommendation');
    expect(body).toContain('## Sources');
    expect(body).toContain('AI drafts, humans decide');
  });

  it('buildDraftFromChat memakai template + fakta tender nyata', () => {
    const d = buildDraftFromChat('tender?', mockChatAnswer('tender?'), 'tender-brief');
    expect(d.body).toContain('## Key tender facts');
    expect(d.body).toContain('TND-2026-001');
  });

  it('templateRefs hanya dari sitasi RAG (detail part #N)', () => {
    expect(templateRefsFromSources([
      { label: 'RFP-2024.pdf', detail: 'part #2' },
      { label: 'Tender Pipeline / TND-2026-001', detail: 'Live database row' },
    ])).toEqual(['RFP-2024.pdf']);
    expect(templateRefsFromSources(undefined)).toEqual([]);
  });

  it('sapaan dijawab singkat tanpa kartu/tabel/tombol', () => {
    expect(isGreeting('hi')).toBe(true);
    expect(isGreeting('  Hello  ')).toBe(true);
    expect(isGreeting('hi, which tenders should we prioritize?')).toBe(false);
    expect(isGreeting('')).toBe(false);
    const g = greetingAnswer('sales-assistant');
    expect(g.tenderIds).toEqual([]);
    expect(g.sources).toEqual([]);
    const m = mockChatAnswer('hei');
    expect(m.tenderIds).toEqual([]);
    expect(m.answerTitle).toMatch(/Hi there/);
  });

  it('sanitizeActions hanya lolos draft/link valid, maks 3', () => {
    expect(sanitizeActions([
      { label: 'Prepare tender brief', kind: 'draft', draftKind: 'tender-brief' },
      { label: 'Open pipeline', kind: 'link', href: '/data' },
      { label: 'Evil', kind: 'link', href: 'https://evil.com' },
      { label: 'Bad kind', kind: 'draft', draftKind: 'nuklir' },
      { label: '  ', kind: 'draft', draftKind: 'general' },
      'bukan-objek',
    ])).toEqual([
      { label: 'Prepare tender brief', kind: 'draft', draftKind: 'tender-brief' },
      { label: 'Open pipeline', kind: 'link', href: '/data' },
    ]);
    expect(sanitizeActions('bukan-array')).toEqual([]);
  });

  it('serializeDraftBody roundtrip stabil + edit tercermin', () => {
    const body = 'Intro.\n\n## Facts\n- a\n- b\n\n| H1 | H2 |\n| v1 | v2 |\n\n---\nFooter note';
    const once = parseDraftBody(body);
    const twice = parseDraftBody(serializeDraftBody(once));
    expect(twice).toEqual(once);
    const edited = once.map((s) => s.heading === 'Facts' ? { ...s, bullets: [...s.bullets, 'c baru'] } : s);
    expect(serializeDraftBody(edited)).toContain('- c baru');
  });

  it('template & visibility guard valid', () => {
    expect(SPACE_TEMPLATES.length).toBeGreaterThan(0);
    for (const t of SPACE_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(isSpaceVisibility(t.visibility)).toBe(true);
      expect(Array.isArray(t.itemKinds)).toBe(true);
    }
    expect(isSpaceVisibility('PUBLIC')).toBe(false);
  });

  it('parseDraftBody memecah heading/bullet/tabel/footer', () => {
    const sections = parseDraftBody('Intro line.\n\n## Facts\n- a\n- b\n\n| H1 | H2 |\n| v1 | v2 |\n\n---\nPrepared by X');
    expect(sections[0].paragraphs).toEqual(['Intro line.']);
    expect(sections[1].heading).toBe('Facts');
    expect(sections[1].bullets).toEqual(['a', 'b']);
    expect(sections[1].table?.head).toEqual(['H1', 'H2']);
    expect(sections[1].table?.rows).toEqual([['v1', 'v2']]);
    expect(sections[2].footer).toBe(true);
  });
});
