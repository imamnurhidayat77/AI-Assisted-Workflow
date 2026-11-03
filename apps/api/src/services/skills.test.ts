import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ASSISTANTS } from '@street-smart/shared';
import { executeSkills, selectSkills, type SkillContext } from './skills.js';

const sales = ASSISTANTS.find((a) => a.id === 'sales-assistant')!;
const finance = ASSISTANTS.find((a) => a.id === 'finance-assistant')!;
const ops = ASSISTANTS.find((a) => a.id === 'ops-assistant')!;
const hr = ASSISTANTS.find((a) => a.id === 'hr-assistant')!;
const mgmt = ASSISTANTS.find((a) => a.id === 'management-assistant')!;

function ctx(partial: Partial<SkillContext> = {}): SkillContext {
  return {
    message: '',
    liveTenders: [],
    invoices: [],
    checklist: [],
    policies: [],
    roster: [],
    jobs: [],
    docs: { total: 0, byStatus: {}, processing: [] },
    sales: [],
    quotations: [],
    drafts: [],
    chunks: [],
    ...partial,
  };
}

describe('selectSkills — intent-driven, maks 3, tanpa text-to-sql', () => {
  it('pertanyaan tender → tender-search (sales)', () => {
    assert.deepEqual(selectSkills(sales, 'Which tenders should we prioritize?'), ['tender-search']);
  });

  it('tidak pernah memilih text-to-sql (jalur khusus)', () => {
    const picked = selectSkills(finance, 'how many overdue invoices? show sql');
    assert.ok(!picked.includes('text-to-sql'));
    assert.ok(picked.includes('invoice-lookup'));
  });

  it('fallback ke default role bila tidak ada keyword', () => {
    assert.deepEqual(selectSkills(hr, 'halo'), ['leave-policy-qa']);
    assert.deepEqual(selectSkills(mgmt, 'halo'), ['cross-domain-summary']);
  });

  it('ops bisa dapat deadline-monitor + doc-extract-status', () => {
    const picked = selectSkills(ops, 'which documents are still processing and what deadlines are near?');
    assert.ok(picked.includes('doc-extract-status'));
    assert.ok(picked.length <= 3);
  });
});

describe('executeSkills — hitung dari snapshot live, bukan karangan', () => {
  it('tender-search merangkum pipeline + top list', () => {
    const [r] = executeSkills(['tender-search'], ctx({
      liveTenders: [
        { id: 'T1', name: 'A', agency: 'X', country: 'NZ', date: '24 Nov 2026', value: 'NZD 1', product: 'P', status: 'Submitted' },
        { id: 'T2', name: 'B', agency: 'Y', country: 'AU', date: '25 Nov 2026', value: 'AUD 2', product: 'P', status: 'Won' },
      ],
    }));
    assert.equal(r.empty, false);
    assert.match(r.text, /2 tenders/);
    assert.match(r.text, /T1/);
  });

  it('invoice-lookup jujur saat kosong + tandai overdue', () => {
    const [empty] = executeSkills(['invoice-lookup'], ctx());
    assert.equal(empty.empty, true);
    const [full] = executeSkills(['invoice-lookup'], ctx({
      invoices: [
        { id: 'I1', direction: 'AR', partner: 'P', amountCents: 100, currency: 'NZD', status: 'OVERDUE', dueLabel: 'besok' },
      ],
    }));
    assert.equal(full.empty, false);
    assert.match(full.text, /OVERDUE/);
  });

  it('payment-status TIDAK PERNAH mengeksekusi — hanya usul draft', () => {
    const [r] = executeSkills(['payment-status'], ctx({
      invoices: [{ id: 'I1', direction: 'AP', partner: 'P', amountCents: 100, currency: 'NZD', status: 'UNPAID', dueLabel: 'besok' }],
    }));
    assert.match(r.text, /approval-gated|never automatic/i);
  });

  it('cross-domain-summary menggabungkan skill lain', () => {
    const [r] = executeSkills(['cross-domain-summary'], ctx());
    assert.match(r.text, /Tender Search/);
    assert.match(r.text, /Sales Compare/);
    assert.match(r.text, /Accrual Summary/);
    assert.match(r.text, /Deadline Monitor/);
    assert.equal(r.empty, true);
  });

  it('relasi tender ↔ quotation ↔ draft ikut di grounding', () => {
    const [r] = executeSkills(['tender-search'], ctx({
      liveTenders: [
        { id: 'T1', name: 'A', agency: 'X', country: 'NZ', date: '24 Nov 2026', value: 'NZD 1', product: 'P', status: 'Submitted' },
      ],
      quotations: [{
        id: 'q1', number: 'Q-2026-0007', title: 'SRS', partner: 'P', tenderId: 'T1', amountCents: 100,
        currency: 'NZD', status: 'draft', createdAt: '', updatedAt: '',
      }],
      drafts: [{
        id: 'd1', kind: 'tender-brief', title: 'Brief', body: 'x', status: 'in_review',
        tenderIds: ['T1'], createdBy: 'u-sales', createdAt: '', updatedAt: '', history: [],
      }],
    }));
    assert.match(r.text, /Q-2026-0007 \(draft\)/);
    assert.match(r.text, /open drafts: 1/);
    const [q] = executeSkills(['quotation-check'], ctx({
      liveTenders: [
        { id: 'T1', name: 'Auckland Job', agency: 'X', country: 'NZ', date: '24 Nov 2026', value: 'NZD 1', product: 'P', status: 'Pending' },
      ],
      quotations: [{
        id: 'q1', number: 'Q-2026-0007', title: 'SRS', partner: 'P', tenderId: 'T1', amountCents: 100,
        currency: 'NZD', status: 'draft', createdAt: '', updatedAt: '',
      }],
    }));
    assert.match(q.text, /tender: Auckland Job \(Pending\)/);
  });

  it('quotation-check dari baris DB (bukan mock)', () => {
    const [r] = executeSkills(['quotation-check'], ctx({
      quotations: [{
        id: 'q1', number: 'Q-2026-0001', title: 'SRS', partner: 'P', amountCents: 100,
        currency: 'NZD', status: 'draft', createdAt: '', updatedAt: '',
      }],
    }));
    assert.equal(r.empty, false);
    assert.match(r.text, /Q-2026-0001/);
  });
});
