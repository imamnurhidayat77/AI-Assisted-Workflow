// Seed awal — mengisi Postgres dari mock shared agar UI & API konsisten.
// Jalankan: npm run db:migrate && npm run seed  (butuh DATABASE_URL valid)
import { PrismaClient, TenderStatus } from '@prisma/client';
import { closeChecklist, distributorSales, hrPolicies, invoices, jobs, leaveRoster, tenders } from '@street-smart/shared';
import { hashApiKey, newApiKey } from '../src/services/auth.js';

const prisma = new PrismaClient();

function mapStatus(s: string): TenderStatus {
  switch (s) {
    case 'Submitted': return 'SUBMITTED';
    case 'Pending': return 'PENDING';
    case 'Won': return 'WON';
    case 'Lost': return 'LOST';
    default: return 'IDENTIFIED';
  }
}

async function main() {
  for (const t of tenders) {
    await prisma.tender.upsert({
      where: { id: t.id },
      update: { name: t.name, agency: t.agency, country: t.country, value: t.value, product: t.product, status: mapStatus(t.status), priority: t.priority ?? null, closeLabel: t.date },
      create: { id: t.id, name: t.name, agency: t.agency, country: t.country, value: t.value, product: t.product, status: mapStatus(t.status), priority: t.priority ?? null, closeLabel: t.date },
    });
  }
  // Job seed idempoten via cek nama (create polos menduplikasi tiap seed run).
  for (const j of jobs) {
    const exists = await prisma.job.findFirst({ where: { name: j.name } });
    if (exists) continue;
    await prisma.job.create({ data: { name: j.name, agent: j.agent, state: j.state, trigger: j.trigger, lastRun: j.lastRun, progress: j.progress } });
  }
  // Dokumen seed idempoten via cek fileName (tanpa unique constraint, createMany
  // biasa akan menduplikasi tiap seed run — jangan kembalikan ke createMany polos).
  const seedDocs = [
    { fileName: 'NZTA_Tender_2026.pdf', sizeLabel: '4.8 MB', status: 'Processed' },
    { fileName: 'Distributor_Sales_Q3.xlsx', sizeLabel: '2.1 MB', status: 'Processing' },
    { fileName: 'Smartstud_Quotation_1042.pdf', sizeLabel: '860 KB', status: 'Completed' },
  ];
  for (const d of seedDocs) {
    const exists = await prisma.document.findFirst({ where: { fileName: d.fileName } });
    if (!exists) await prisma.document.create({ data: d });
  }
  // Finance & HR — upsert idempoten dari mock shared (single source of truth).
  for (const i of invoices) {
    await prisma.invoice.upsert({
      where: { id: i.id },
      update: { direction: i.direction, partner: i.partner, amountCents: i.amountCents, currency: i.currency, status: i.status, dueLabel: i.dueLabel },
      create: { id: i.id, direction: i.direction, partner: i.partner, amountCents: i.amountCents, currency: i.currency, status: i.status, dueLabel: i.dueLabel },
    });
  }
  for (const c of closeChecklist) {
    await prisma.closeCheckItem.upsert({
      where: { id: c.id },
      update: { period: c.period, item: c.item, done: c.done, owner: c.owner },
      create: { id: c.id, period: c.period, item: c.item, done: c.done, owner: c.owner },
    });
  }
  for (const p of hrPolicies) {
    await prisma.hrPolicy.upsert({
      where: { id: p.id },
      update: { topic: p.topic, title: p.title, summary: p.summary },
      create: { id: p.id, topic: p.topic, title: p.title, summary: p.summary },
    });
  }
  for (const l of leaveRoster) {
    await prisma.leaveRow.upsert({
      where: { id: l.id },
      update: { team: l.team, weekLabel: l.weekLabel, headcount: l.headcount, onLeave: l.onLeave },
      create: { id: l.id, team: l.team, weekLabel: l.weekLabel, headcount: l.headcount, onLeave: l.onLeave },
    });
  }
  for (const s of distributorSales) {
    await prisma.distributorSale.upsert({
      where: { id: s.id },
      update: { distributor: s.distributor, country: s.country, product: s.product, sku: s.sku, quarter: s.quarter, units: s.units, amountCents: s.amountCents, currency: s.currency },
      create: { id: s.id, distributor: s.distributor, country: s.country, product: s.product, sku: s.sku, quarter: s.quarter, units: s.units, amountCents: s.amountCents, currency: s.currency },
    });
  }
  // Demo users — key acak saat pertama dibuat, hash saja yang disimpan.
  // Key dicetak SEKALI ke console; simpan di password manager / .env.local, jangan commit.
  const demoUsers = [
    { id: 'u-sales', name: 'Sophie Williams', role: 'sales' },
    { id: 'u-finance', name: 'James Patel', role: 'finance' },
    { id: 'u-hr', name: 'Emily Zhang', role: 'hr' },
    { id: 'u-ops', name: 'Isaac Ngatai', role: 'operations' },
    { id: 'u-mgmt', name: 'Thomas Bennett', role: 'management' },
  ];
  for (const u of demoUsers) {
    const exists = await prisma.appUser.findUnique({ where: { id: u.id } });
    if (exists) continue;
    const key = newApiKey();
    await prisma.appUser.create({
      data: { id: u.id, name: u.name, role: u.role, apiKeyHash: hashApiKey(key) },
    });
    console.log(`[seed] demo user ${u.id} (${u.role}) key: ${key}`);
  }
  // Spaces awal (Joule-style) — id tetap agar idempoten, ikon mengikuti tone.
  const seedSpaces = [
    { id: 'sp-tender-review', name: 'Tender Opportunity Review', description: 'Review and prioritize active government tenders.', tone: 'amber', icon: 'file' },
    { id: 'sp-distributor', name: 'Distributor Performance', description: 'Analyze sales by region, product, and quarter.', tone: 'blue', icon: 'chart' },
    { id: 'sp-product', name: 'Product Portfolio Intelligence', description: 'Explore catalogue, pricing, and sales trends.', tone: 'green', icon: 'grid' },
    { id: 'sp-response', name: 'Government Tender Response', description: 'Organize requirements, compliance, and tasks.', tone: 'purple', icon: 'check' },
  ];
  for (const s of seedSpaces) {
    await prisma.space.upsert({ where: { id: s.id }, update: {}, create: s });
  }
  // Contoh item awal (sekali saja — jangan duplikat saat re-seed).
  if ((await prisma.spaceItem.count({ where: { spaceId: 'sp-tender-review' } })) === 0) {
    await prisma.spaceItem.createMany({
      data: [
        { spaceId: 'sp-tender-review', kind: 'tender', refId: 'TND-2026-001', title: 'Auckland Smart Road Upgrade', preview: 'NZD 1,250,000 · closes 24 Nov 2026' },
        { spaceId: 'sp-distributor', kind: 'note', title: 'Q3 comparison notes', preview: 'Australia grew 14% while NZ stayed flat.' },
      ],
    });
  }
  console.log('[seed] ok');
}

main().finally(() => prisma.$disconnect());
