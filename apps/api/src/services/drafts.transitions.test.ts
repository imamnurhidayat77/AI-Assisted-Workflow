import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDraftFromChat,
  canApproveDraft,
  canEditDraftStatus,
  canMoveDraftStatus,
  DRAFT_SLA_DAYS,
  draftToJob,
  isDraftOverdue,
  mockChatAnswer,
  wasEscalated,
  type DraftStatus,
} from '@street-smart/shared';

describe('draft status machine (AI drafter, human decider)', () => {
  it('draft → in_review / approved / rejected, tapi tidak diam di tempat', () => {
    assert.equal(canMoveDraftStatus('draft', 'in_review'), true);
    assert.equal(canMoveDraftStatus('draft', 'approved'), true);
    assert.equal(canMoveDraftStatus('draft', 'rejected'), true);
    assert.equal(canMoveDraftStatus('draft', 'draft'), false);
  });

  it('in_review → approved / rejected / kembali ke draft', () => {
    for (const to of ['approved', 'rejected', 'draft'] as DraftStatus[]) {
      assert.equal(canMoveDraftStatus('in_review', to), true);
    }
    assert.equal(canMoveDraftStatus('in_review', 'in_review'), false);
  });

  it('approved terkunci total — anti eksekusi/ubah ganda', () => {
    for (const to of ['draft', 'in_review', 'approved', 'rejected'] as DraftStatus[]) {
      assert.equal(canMoveDraftStatus('approved', to), false);
    }
    assert.equal(canEditDraftStatus('approved'), false);
  });

  it('rejected hanya bisa reopen ke draft, tidak bisa diedit diam-diam', () => {
    assert.equal(canMoveDraftStatus('rejected', 'draft'), true);
    assert.equal(canMoveDraftStatus('rejected', 'approved'), false);
    assert.equal(canMoveDraftStatus('rejected', 'in_review'), false);
    assert.equal(canEditDraftStatus('rejected'), false);
    assert.equal(canEditDraftStatus('draft'), true);
    assert.equal(canEditDraftStatus('in_review'), true);
  });

  it('maker-checker: pembuat tidak boleh approve draft consequential miliknya', () => {
    const salesDraft = { kind: 'tender-brief' as const, createdBy: 'u-sales' };
    assert.equal(canApproveDraft(salesDraft, { id: 'u-sales', role: 'sales' }), false);
    assert.equal(canApproveDraft(salesDraft, { id: 'u-ops', role: 'operations' }), true);
    assert.equal(canApproveDraft(salesDraft, { id: 'u-mgmt', role: 'management' }), true);
    assert.equal(canApproveDraft(salesDraft, { id: 'u-finance', role: 'finance' }), false);
    // Draft lama tanpa createdBy: cukup cek role (jangan digantung).
    assert.equal(canApproveDraft({ kind: 'quotation-review' }, { id: 'u-ops', role: 'operations' }), true);
  });

  it('payment-approval: hanya management, siapa pun pembuatnya', () => {
    const pay = { kind: 'payment-approval' as const, createdBy: 'u-finance' };
    assert.equal(canApproveDraft(pay, { id: 'u-finance', role: 'finance' }), false);
    assert.equal(canApproveDraft(pay, { id: 'u-ops', role: 'operations' }), false);
    assert.equal(canApproveDraft(pay, { id: 'u-mgmt', role: 'management' }), true);
  });

  it('general: risiko rendah, tidak dibatasi chain (ownership di route)', () => {
    assert.equal(canApproveDraft({ kind: 'general', createdBy: 'u-sales' }, { id: 'u-sales', role: 'sales' }), true);
  });

  it('SLA: in_review melewati batas = overdue, sekali eskalasi saja', () => {
    const now = Date.parse('2026-11-10T00:00:00Z');
    const old = new Date(now - (DRAFT_SLA_DAYS + 1) * 86_400_000).toISOString();
    const fresh = new Date(now - 3600_000).toISOString();
    assert.equal(isDraftOverdue({ status: 'in_review', updatedAt: old }, now), true);
    assert.equal(isDraftOverdue({ status: 'in_review', updatedAt: fresh }, now), false);
    assert.equal(isDraftOverdue({ status: 'approved', updatedAt: old }, now), false);
    assert.equal(isDraftOverdue({ status: 'in_review', updatedAt: 'bukan-tanggal' }, now), false);
    assert.equal(wasEscalated({ history: [{ at: old, actor: 'system', action: 'escalated' }] }), true);
    assert.equal(wasEscalated({ history: [{ at: old, actor: 'human', action: 'submitted' }] }), false);
  });

  it('draft pending masuk antrean jobs dengan pemetaan state benar', () => {
    const base = buildDraftFromChat('q', mockChatAnswer('tender?'));
    assert.equal(base.status, 'draft');
    assert.deepEqual(base.history.at(-1)?.action, 'created');
    const asReview = { ...base, status: 'in_review' as const };
    assert.equal(draftToJob(asReview).state, 'Running');
    assert.equal(draftToJob(base).state, 'Scheduled');
    assert.equal(draftToJob(base).draftId, base.id);
  });
});
