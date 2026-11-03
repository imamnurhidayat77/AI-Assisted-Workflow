import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MGMT_ROOM, draftRooms, userRoom } from '../realtime.js';
import { parseAssistantContent } from './conversations.js';
import { embed, embeddingInfo, embedOne } from './embeddings.js';
import { rateLimit } from './ratelimit.js';

describe('draftRooms — event draft hanya ke pemilik + management', () => {
  it('draft berpemilik → room user + room management', () => {
    assert.deepEqual(draftRooms('u-sales'), [userRoom('u-sales'), MGMT_ROOM]);
    assert.ok(!draftRooms('u-sales').includes(userRoom('u-hr')));
  });

  it('draft lama tanpa pemilik → hanya management (jangan broadcast)', () => {
    assert.deepEqual(draftRooms(undefined), [MGMT_ROOM]);
    assert.deepEqual(draftRooms(null), [MGMT_ROOM]);
  });
});

describe('parseAssistantContent — pesan assistant tersimpan', () => {
  it('parse JSON jawaban valid', () => {
    const p = parseAssistantContent(JSON.stringify({
      answerTitle: 'T', answerCopy: 'C', tenderIds: ['TND-1'], recommendation: 'R',
      sources: [{ label: 'L', detail: 'D' }], followUps: ['F'], assistantId: 'sales-assistant', skillsUsed: ['s'],
    }));
    assert.ok(p);
    assert.equal(p?.answerTitle, 'T');
    assert.deepEqual(p?.tenderIds, ['TND-1']);
  });

  it('teks biasa / rusak / field hilang → null', () => {
    assert.equal(parseAssistantContent('halo'), null);
    assert.equal(parseAssistantContent('{bad json'), null);
    assert.equal(parseAssistantContent(JSON.stringify({ answerCopy: 'C' })), null);
  });

  it('array non-string disaring, bukan crash', () => {
    const p = parseAssistantContent(JSON.stringify({
      answerTitle: 'T', answerCopy: 'C', tenderIds: ['A', 42, null], followUps: 'bukan-array',
    }));
    assert.deepEqual(p?.tenderIds, ['A']);
    assert.deepEqual(p?.followUps, []);
  });
});

describe('embeddings — provider fallback aman', () => {
  it('hash default: 384d, ternormalisasi, deterministik', async () => {
    const v = await embedOne('overdue invoice Wellington distributor');
    assert.equal(v.length, 384);
    const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
    assert.ok(Math.abs(norm - 1) < 1e-9);
    assert.deepEqual(v, await embedOne('overdue invoice Wellington distributor'));
  });

  it('provider neural tanpa onnx → fallback hashing (384d), bukan throw', async () => {
    process.env.EMBEDDING_PROVIDER = 'neural';
    try {
      const rows = await embed(['test satu', 'test dua']);
      assert.equal(rows.length, 2);
      assert.equal(rows[0].length, 384);
    } finally {
      delete process.env.EMBEDDING_PROVIDER;
    }
  });

  it('embeddingInfo melaporkan provider aktif', () => {
    assert.equal(embeddingInfo().dims, 384);
    assert.equal(embeddingInfo().provider, 'hash');
  });
});

describe('rateLimit — sliding window per user', () => {
  function fakeRes() {
    const headers: Record<string, string> = {};
    return {
      headers,
      statusCode: 0,
      body: null as unknown,
      setHeader(k: string, v: string) { headers[k] = v; },
      status(c: number) {
        this.statusCode = c;
        return { json: (b: unknown) => { this.body = b; } };
      },
    };
  }

  it('melewatkan di bawah batas, 429 + Retry-After di atasnya', () => {
    const mw = rateLimit({ name: 't-hardening', windowMs: 60_000, max: 2 });
    const mkReq = () => ({ ip: '9.9.9.9' }) as never;
    let next = 0;
    const run = () => {
      const res = fakeRes();
      let called = false;
      mw(mkReq(), res as never, () => { called = true; next++; });
      return { called, res };
    };
    assert.equal(run().called, true);
    assert.equal(run().called, true);
    const third = run();
    assert.equal(third.called, false);
    assert.equal(third.res.statusCode, 429);
    assert.ok(Number(third.res.headers['Retry-After']) >= 1);
    assert.equal(next, 2);
  });

  it('bucket terpisah per user', () => {
    const mw = rateLimit({ name: 't-hardening-user', windowMs: 60_000, max: 1 });
    const mkReq = () => ({ ip: '1.1.1.1' }) as never;
    const mkRes = (id: string) => {
      const res = fakeRes();
      (res as unknown as { locals: { user: { id: string } } }).locals = { user: { id } };
      return res;
    };
    let okA = false;
    let okB = false;
    mw(mkReq(), mkRes('a') as never, () => { okA = true; });
    mw(mkReq(), mkRes('b') as never, () => { okB = true; });
    assert.equal(okA, true);
    assert.equal(okB, true);
  });
});
