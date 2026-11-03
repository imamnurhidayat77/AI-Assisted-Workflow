import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSpaceContext, type ContextLoaders } from './spaceContext.js';

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
