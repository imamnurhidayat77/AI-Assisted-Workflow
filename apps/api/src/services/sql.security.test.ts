import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSql,
  isSqlIntent,
  mockAnswerSql,
  validateSql,
} from './sql.js';

describe('validateSql — allowlist ketat per-role', () => {
  it('menerima SELECT kolom + WHERE + ORDER + LIMIT dalam scope', () => {
    const v = validateSql(
      `SELECT id, status FROM "Invoice" WHERE status = 'OVERDUE' ORDER BY id LIMIT 10`,
      'finance',
    );
    assert.equal(v.table, 'Invoice');
    assert.deepEqual(v.columns, ['id', 'status']);
    assert.equal(v.aggregate, null);
  });

  it('menerima COUNT(*) dan SUM(col)', () => {
    assert.equal(validateSql(`SELECT COUNT(*) FROM "Tender" LIMIT 50`, 'sales').aggregate?.fn, 'COUNT');
    assert.equal(validateSql(`SELECT SUM(amountCents) FROM "Invoice" LIMIT 50`, 'finance').aggregate?.fn, 'SUM');
  });

  it('menolak query destruktif & multi-statement', () => {
    for (const sql of [
      `SELECT * FROM "Invoice"; DROP TABLE "Invoice"`,
      `SELECT * FROM "Invoice" UNION SELECT * FROM "Tender"`,
      `SELECT * FROM "Invoice" /* comment */ LIMIT 5`,
      `SELECT * FROM "Invoice" -- hacked`,
      `DELETE FROM "Invoice"`,
      `INSERT INTO "Invoice" (id) VALUES ('x')`,
    ]) {
      assert.throws(() => validateSql(sql, 'finance'), Error, sql);
    }
  });

  it('menolak tabel/kolom di luar scope role (403) dan tabel tak dikenal', () => {
    assert.throws(() => validateSql(`SELECT id FROM "Invoice" LIMIT 5`, 'sales'), /not allowed for this role/);
    assert.throws(() => validateSql(`SELECT id FROM "AppUser" LIMIT 5`, 'management'), /not allowed/);
    assert.throws(() => validateSql(`SELECT extractedText FROM "Document" LIMIT 5`, 'management'), /not allowed/);
    assert.throws(() => validateSql(`SELECT password FROM "Invoice" LIMIT 5`, 'finance'), /not allowed/);
    assert.throws(() => validateSql(`SELECT * FROM "Nope" LIMIT 5`, 'management'), /not allowed/);
  });

  it('menolak LIMIT > 50, JOIN, subquery, WHERE bebas', () => {
    assert.throws(() => validateSql(`SELECT * FROM "Tender" LIMIT 500`, 'sales'), /LIMIT/);
    assert.throws(() => validateSql(`SELECT * FROM "Tender" JOIN "Job" ON 1=1 LIMIT 5`, 'management'));
    assert.throws(() => validateSql(`SELECT * FROM "Tender" WHERE id IN (SELECT id FROM "Tender") LIMIT 5`, 'sales'));
    assert.throws(() => validateSql(`SELECT * FROM "Tender" WHERE 1=1 LIMIT 5`, 'sales'));
    assert.throws(() => validateSql(`SELECT * FROM "Tender" WHERE status = 'x' OR 1=1 LIMIT 5`, 'sales'));
  });

  it('buildSql membangun ulang dari hasil validasi (string mentah tidak dipakai)', () => {
    const v = validateSql(`select  id ,  status   from "Invoice" where status='OVERDUE' limit 10`, 'finance');
    const rebuilt = buildSql(v, `status='OVERDUE'`, undefined, undefined, '10');
    assert.match(rebuilt, /^SELECT "id", "status" FROM "Invoice" WHERE "status" = 'OVERDUE' LIMIT 10$/);
  });
});

describe('mockAnswerSql — rule engine offline + scoping role', () => {
  const snap = {
    tenders: [{ id: 'T1', status: 'Pending' }],
    invoices: [
      { id: 'INV-1', direction: 'AR', partner: 'P1', amountCents: 100, currency: 'NZD', status: 'OVERDUE', dueLabel: 'd1' },
      { id: 'INV-2', direction: 'AP', partner: 'P2', amountCents: 50, currency: 'NZD', status: 'UNPAID', dueLabel: 'd2' },
    ],
    checklist: [{ id: 'C1', period: '2026-11', item: 'x', done: true, owner: 'Finance' }],
    policies: [{ id: 'P1', topic: 'leave', title: 'Leave', summary: '20 days' }],
    roster: [{ id: 'R1', team: 'Ops', weekLabel: 'W1', headcount: 8, onLeave: 2 }],
    jobs: [
      { name: 'a', agent: 'x', state: 'Running', trigger: 't', lastRun: 'now', progress: '—' },
      { name: 'b', agent: 'x', state: 'Completed', trigger: 't', lastRun: 'now', progress: '—' },
    ],
    docs: { total: 2, byStatus: { Processed: 2 }, processing: [] as string[] },
    sales: [],
  };

  it('finance dapat pola overdue; sales tidak (scoping tabel)', () => {
    const hit = mockAnswerSql('how many overdue invoices?', 'finance', snap);
    assert.ok(hit);
    assert.equal(hit?.rowCount, 1);
    assert.match(hit?.sql ?? '', /FROM "Invoice"/);
    assert.equal(mockAnswerSql('how many overdue invoices?', 'sales', snap), null);
  });

  it('tanpa role → null (eval & legacy tidak berubah)', () => {
    assert.equal(mockAnswerSql('how many overdue invoices?', undefined, snap), null);
  });

  it('pertanyaan non-data → null agar jatuh ke builder narasi', () => {
    assert.equal(mockAnswerSql('hello, what can you do?', 'finance', snap), null);
  });
});

describe('isSqlIntent', () => {
  it('mendeteksi pertanyaan agregasi, mengabaikan sapaan', () => {
    assert.equal(isSqlIntent('berapa invoice overdue?'), true);
    assert.equal(isSqlIntent('show running jobs'), true);
    assert.equal(isSqlIntent('halo, apa kabar?'), false);
  });
});
