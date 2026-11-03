import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSpaceContext, hasLinkedDraft, requireSpaceContext, scoreSpaces, type ContextLoaders } from './spaceContext.js';

function loaders(over: Partial<ContextLoaders> = {}): ContextLoaders {
  return {
    loadSpace: async () => ({ id: 'sp-1', name: 'Tender War Room', description: 'Win TND', ownerId: 'u-sales', ownerRole: 'sales', visibility: 'ROLE' as const, status: 'ACTIVE' as const }),
    loadItems: async () => [
      { id: 'i1', kind: 'conversation', refId: 'c-mine', title: 't1', preview: '' },
      { id: 'i2', kind: 'conversation', refId: 'c-theirs', title: 't2', preview: '' },
      { id: 'i3', kind: 'document', refId: 'd-ok', title: 'a.pdf', preview: '' },
      { id: 'i4', kind: 'document', refId: 'd-hr', title: 'hr.pdf', preview: '' },
      { id: 'i5', kind: 'tender', refId: 'TND-1', title: 'T', preview: '' },
      { id: 'i6', kind: 'note', refId: '', title: 'n', preview: 'remember this' },
    ],
    loadConversation: async (refId) => (refId === 'c-mine' ? { title: 'Mine', preview: 'hello world' } : null),
    loadDocument: async (refId) => (refId === 'd-ok' ? { title: 'a.pdf', status: 'Processed', excerpt: 'abc' } : null),
    loadTender: async () => ({ title: 'Auckland', detail: 'NZD 1 · Submitted' }),
    loadDrafts: async () => [
      { id: 'd1', title: 'Brief', kind: 'tender-brief', status: 'in_review', spaceId: 'sp-1', createdBy: 'u-sales' },
      { id: 'd2', title: 'Old', kind: 'general', status: 'approved', spaceId: 'sp-1', createdBy: 'u-sales' },
    ],
    loadActivity: async () => [{ type: 'ITEM_ADDED', actorRole: 'sales', summary: 'x', createdAt: new Date('2026-01-01T00:00:00Z') }],
    ...over,
  };
}

const sales = { id: 'u-sales', role: 'sales' as const };

describe('buildSpaceContext filtering', () => {
  it('melewatkan item yang tak boleh diakses user (tanpa bocor)', async () => {
    const ctx = await buildSpaceContext('sp-1', sales, loaders());
    const kinds = ctx.items.map((i) => i.kind);
    assert.deepEqual(kinds, ['conversation', 'document', 'tender', 'note']);
    assert.ok(!JSON.stringify(ctx).includes('c-theirs'));
    assert.ok(!JSON.stringify(ctx).includes('hr.pdf'));
  });

  it('tender disembunyikan untuk finance/hr (space se-role tetap terlihat)', async () => {
    const sameRole = loaders({
      loadSpace: async () => ({ id: 'sp-1', name: 'Close', description: '', ownerId: 'u-fin', ownerRole: 'finance', visibility: 'ROLE' as const, status: 'ACTIVE' as const }),
    });
    const ctx = await buildSpaceContext('sp-1', { id: 'u-fin', role: 'finance' }, sameRole);
    assert.ok(!ctx.items.some((i) => i.kind === 'tender'));
    assert.ok(ctx.items.some((i) => i.kind === 'document'));
  });

  it('hanya draft pending milik space yang masuk', async () => {
    const ctx = await buildSpaceContext('sp-1', sales, loaders());
    assert.deepEqual(ctx.pendingDrafts.map((d) => d.id), ['d1']);
  });

  it('404 bila space tak ada atau tak boleh dilihat', async () => {
    await assert.rejects(buildSpaceContext('sp-1', sales, loaders({ loadSpace: async () => null })), /not found/);
    await assert.rejects(
      buildSpaceContext('sp-1', { id: 'u-hr', role: 'hr' }, loaders({
        loadSpace: async () => ({ id: 'sp-1', name: 'x', description: '', ownerId: 'u-sales', ownerRole: 'sales', visibility: 'PRIVATE' as const, status: 'ACTIVE' as const }),
      })),
      /not found/,
    );
  });

  it('requireSpaceContext: tak boleh lihat → 403 jelas; DB mati → 503 terus', async () => {
    const denied = loaders({
      loadSpace: async () => ({ id: 'sp-9', name: 'x', description: '', ownerId: 'u-ops', ownerRole: 'operations', visibility: 'PRIVATE' as const, status: 'ACTIVE' as const }),
    });
    await assert.rejects(requireSpaceContext('sp-9', sales, denied), (e: unknown) => {
      const err = e as { status?: number; message?: string };
      return err.status === 403 && /not available/.test(err.message ?? '');
    });
    const down = loaders({
      loadSpace: async () => { throw Object.assign(new Error('database unreachable'), { status: 503 }); },
    });
    await assert.rejects(requireSpaceContext('sp-9', sales, down), (e: unknown) => (e as { status?: number }).status === 503);
  });

  it('scoreSpaces mencocokkan domain pesan ↔ space (bukan tebakan model)', () => {
    const spaces = [
      { id: 'a', name: 'Tender Opportunity Review', description: 'prioritize tenders' },
      { id: 'b', name: 'Random Notes', description: 'misc' },
    ];
    const hit = scoreSpaces(spaces, 'Which tenders should we prioritize? TND-2026-001');
    assert.ok(hit && hit.spaceId === 'a');
    const miss = scoreSpaces(spaces, 'Halo, apa kabar?');
    assert.equal(miss, null);
  });

  it('hasLinkedDraft hanya cocok via sourceConversationId eksplisit', () => {
    const drafts = [
      { spaceId: 'sp-1', sourceConversationId: 'c-1' },
      { spaceId: 'sp-1', sourceConversationId: 'c-2' },
      { spaceId: 'sp-2', sourceConversationId: 'c-1' },
      { spaceId: 'sp-1' },
    ];
    assert.equal(hasLinkedDraft(drafts, 'sp-1', 'c-1'), true);
    assert.equal(hasLinkedDraft(drafts, 'sp-1', 'c-9'), false);
    // Tanpa sourceId (item lama) tidak pernah cocok — bukan tebakan judul.
    assert.equal(hasLinkedDraft(drafts, 'sp-1', null), false);
    assert.equal(hasLinkedDraft(drafts, 'sp-1', undefined), false);
    assert.equal(hasLinkedDraft(drafts, 'sp-9', 'c-1'), false);
    assert.equal(hasLinkedDraft([], 'sp-1', 'c-1'), false);
  });

  it('output dibatasi budget (truncate + flag)', async () => {
    const big = 'x'.repeat(2000);
    const ctx = await buildSpaceContext('sp-1', sales, loaders({
      loadItems: async () => [1, 2, 3].map((n) => ({ id: `i${n}`, kind: 'note', refId: '', title: 'n', preview: big })),
      loadDrafts: async () => [],
      loadActivity: async () => [],
    }), { maxChars: 800 });
    assert.equal(ctx.truncated, true);
    assert.ok(JSON.stringify(ctx).length <= 950);
  });
});
