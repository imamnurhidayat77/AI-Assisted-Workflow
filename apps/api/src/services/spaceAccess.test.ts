import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canEditSpace, canViewSpace, isLegacySpace, visibleSpaces, type SpaceRecord } from './spaceAccess.js';

const priv = (over: Partial<SpaceRecord> = {}): SpaceRecord => ({
  id: 'sp-1', ownerId: 'u-sales', ownerRole: 'sales', visibility: 'PRIVATE', status: 'ACTIVE', ...over,
});
const team = (over: Partial<SpaceRecord> = {}): SpaceRecord => ({
  id: 'sp-2', ownerId: 'u-sales', ownerRole: 'sales', visibility: 'ROLE', status: 'ACTIVE', ...over,
});
const legacy: SpaceRecord = { id: 'sp-0', ownerId: null, ownerRole: '', visibility: 'PRIVATE', status: 'ACTIVE' };

describe('space access rules', () => {
  it('private: hanya pemilik (+ management)', () => {
    assert.equal(canViewSpace({ id: 'u-sales', role: 'sales' }, priv()), true);
    assert.equal(canViewSpace({ id: 'u-ops', role: 'operations' }, priv()), false);
    assert.equal(canViewSpace({ id: 'u-mgmt', role: 'management' }, priv()), true);
    assert.equal(canViewSpace(null, priv()), false);
  });

  it('role-shared: se-role + pemilik + management', () => {
    assert.equal(canViewSpace({ id: 'u-sales', role: 'sales' }, team()), true);
    assert.equal(canViewSpace({ id: 'u-sales2', role: 'sales' }, team()), true);
    assert.equal(canViewSpace({ id: 'u-ops', role: 'operations' }, team()), false);
    assert.equal(canViewSpace({ id: 'u-mgmt', role: 'management' }, team()), true);
  });

  it('legacy (tanpa owner) tetap terlihat semua — perilaku lama dipertahankan', () => {
    assert.equal(isLegacySpace(legacy), true);
    assert.equal(canViewSpace({ id: 'u-hr', role: 'hr' }, legacy), true);
    assert.equal(canEditSpace({ id: 'u-hr', role: 'hr' }, legacy), true);
  });

  it('edit: pemilik atau management saja (non-legacy)', () => {
    assert.equal(canEditSpace({ id: 'u-sales', role: 'sales' }, priv()), true);
    assert.equal(canEditSpace({ id: 'u-ops', role: 'operations' }, priv()), false);
    assert.equal(canEditSpace({ id: 'u-sales2', role: 'sales' }, team()), false);
    assert.equal(canEditSpace({ id: 'u-mgmt', role: 'management' }, team()), true);
  });

  it('visibleSpaces memfilter list (management lolos semua)', () => {
    const all = [priv(), team(), legacy];
    assert.deepEqual(
      visibleSpaces({ id: 'u-ops', role: 'operations' }, all).map((s) => s.id),
      ['sp-0'],
    );
    assert.equal(visibleSpaces({ id: 'u-mgmt', role: 'management' }, all).length, 3);
    assert.deepEqual(visibleSpaces(null, all), []);
  });
});
