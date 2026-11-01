// Seed awal — mengisi Postgres dari mock shared agar UI & API konsisten.
// Jalankan: npm run db:migrate && npm run seed  (butuh DATABASE_URL valid)
import { PrismaClient, TenderStatus } from '@prisma/client';
import { closeChecklist, hrPolicies, invoices, jobs, leaveRoster, tenders } from '@street-smart/shared';

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
  for (const j of jobs) {
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
  console.log('[seed] ok');
}

main().finally(() => prisma.$disconnect());
