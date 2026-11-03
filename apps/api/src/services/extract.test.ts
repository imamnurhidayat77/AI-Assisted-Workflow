import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeExtraction } from './extract.js';

describe('sanitizeExtraction (LLM output guard)', () => {
  it('menerima payload valid + clamp confidence', () => {
    const out = sanitizeExtraction({
      kind: 'Quotation',
      fields: [
        { label: 'Total', value: 'NZD 84,500', confidence: 1.5, source: 'extracted', needsReview: false },
        { label: 'Owner', value: '', confidence: -0.2, source: 'bukan-sumber', needsReview: 'ya' },
      ],
      missingFields: ['Validity date', 42, ''],
    });
    assert.ok(out);
    assert.equal(out.kind, 'Quotation');
    assert.equal(out.fields[0].confidence, 1);
    assert.equal(out.fields[0].source, 'extracted');
    // confidence di-clamp, source asing → inferred, needsReview non-boolean → aturan default
    assert.equal(out.fields[1].confidence, 0);
    assert.equal(out.fields[1].source, 'inferred');
    assert.equal(out.fields[1].needsReview, true);
    assert.deepEqual(out.missingFields, ['Validity date']);
  });

  it('menolak shape tak dapat dipakai', () => {
    assert.equal(sanitizeExtraction(null), null);
    assert.equal(sanitizeExtraction({ kind: 'X' }), null);
    assert.equal(sanitizeExtraction({ kind: 'X', fields: [{ label: '', value: 'y' }] }), null);
    assert.equal(sanitizeExtraction({ kind: 'X', fields: [] }), null);
  });

  it('batas jumlah field + missing dipegang', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ label: `F${i}`, value: 'v', confidence: 0.9, source: 'extracted' }));
    const out = sanitizeExtraction({ kind: 'K', fields: many, missingFields: Array.from({ length: 30 }, (_, i) => `M${i}`) });
    assert.ok(out);
    assert.equal(out.fields.length, 12);
    assert.equal(out.missingFields.length, 10);
  });

  it('inferred/low-confidence selalu minta verifikasi manusia', () => {
    const out = sanitizeExtraction({
      kind: 'K',
      fields: [{ label: 'A', value: 'x', confidence: 0.7, source: 'extracted' }],
    });
    assert.ok(out);
    assert.equal(out.fields[0].needsReview, true);
  });

  it('confidence rata-rata = rata-rata field', () => {
    const out = sanitizeExtraction({
      kind: 'K',
      fields: [
        { label: 'A', value: 'x', confidence: 1, source: 'extracted', needsReview: false },
        { label: 'B', value: 'y', confidence: 0.6, source: 'extracted', needsReview: false },
      ],
    });
    assert.ok(out);
    assert.equal(out.confidence, 0.8);
  });
});
