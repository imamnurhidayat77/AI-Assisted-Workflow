import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDraftFromChat,
  canEditDraftStatus,
  canMoveDraftStatus,
  draftToJob,
  mockChatAnswer,
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
