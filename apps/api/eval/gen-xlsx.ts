// Writes the 2 .xlsx sales fixtures (same ground truth as gen-fixtures.py).
// Run: npx tsx eval/gen-xlsx.ts (cwd = apps/api)
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { utils, write } from 'xlsx';

const rows = [
  ['period', 'region', 'sku', 'units', 'growth'],
  ['Q3 2026', 'NZ', 'Smartstud SRS-8', '4820', '+22%'],
  ['Q3 2026', 'AU', 'Smartstud SRS-8', '3560', '+14%'],
  ['Q3 2026', 'Pacific', 'Smartped P-2', '1210', '+6%'],
];
for (const fn of ['sales_pacific.xlsx', 'sales_annual.xlsx']) {
  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.aoa_to_sheet(rows), 'Sales');
  writeFileSync(path.join('eval', 'fixtures', fn), Buffer.from(write(wb, { type: 'buffer', bookType: 'xlsx' })));
  console.log('wrote', fn);
}
