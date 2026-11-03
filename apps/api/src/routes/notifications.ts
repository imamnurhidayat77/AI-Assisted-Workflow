import { Router } from 'express';
import { canApproveDraft, isDraftOverdue } from '@street-smart/shared';
import { requireAuth, type AuthUser } from '../services/auth.js';
import { getFinanceSnapshot } from '../services/finance.js';
import { getOpsSnapshot } from '../services/ops.js';
import { getTenders } from '../services/tenders.js';
import { listAllDrafts } from '../services/drafts.js';
import { documents } from '../services/documents.js';

const r = Router();

export interface NotificationItem {
  id: string;
  severity: 'high' | 'medium' | 'info';
  title: string;
  detail: string;
  href: string;
}

function daysUntil(label: string): number | null {
  const t = Date.parse(label);
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

// GET /api/notifications — pengganti alerts mock: dihitung dari data live,
// difilter per role (server enforcement). Tiap seksi best-effort: DB/loyka
// yang gagal dilewati agar satu sumber mati tidak membunuh semuanya.
r.get('/', requireAuth, async (_req, res) => {
  const user = (res as unknown as { locals: { user: AuthUser } }).locals.user;
  const items: NotificationItem[] = [];
  const tenderRoles = user.role === 'sales' || user.role === 'operations' || user.role === 'management';
  const financeRoles = user.role === 'finance' || user.role === 'management';
  const opsRoles = user.role === 'operations' || user.role === 'management';

  // 1) Draft menunggu keputusan saya (maker-checker aware).
  try {
    const all = await listAllDrafts();
    const awaiting = all.filter(
      (d) => d.status === 'in_review' && d.createdBy !== user.id && canApproveDraft(d, { id: user.id, role: user.role }),
    );
    if (awaiting.length) {
      const overdue = awaiting.filter((d) => isDraftOverdue(d)).length;
      items.push({
        id: 'draft-awaiting',
        severity: 'high',
        title: `${awaiting.length} draft${awaiting.length > 1 ? 's' : ''} awaiting your decision`,
        detail:
          (overdue ? `${overdue} overdue SLA · ` : '') +
          awaiting.slice(0, 3).map((d) => d.title).join(' · '),
        href: '/inbox',
      });
    }
    const rejectedMine = all.filter((d) => d.createdBy === user.id && d.status === 'rejected');
    if (rejectedMine.length) {
      items.push({
        id: 'draft-rejected',
        severity: 'medium',
        title: `${rejectedMine.length} of your drafts need fixing`,
        detail: rejectedMine.slice(0, 3).map((d) => d.title).join(' · '),
        href: '/inbox',
      });
    }
  } catch { /* abaikan — inbox page tetap sumber kebenaran */ }

  // 2) Tender closing soon (tender-visible roles saja).
  if (tenderRoles) {
    try {
      const { rows } = await getTenders();
      const soon = rows
        .filter((t) => t.status !== 'Won' && t.status !== 'Lost')
        .map((t) => ({ t, days: daysUntil(t.date) }))
        .filter((x): x is { t: (typeof rows)[number]; days: number } => x.days !== null && x.days >= 0 && x.days <= 14)
        .sort((a, b) => a.days - b.days);
      if (soon.length) {
        const top = soon[0];
        items.push({
          id: 'tender-deadline',
          severity: top.days <= 5 ? 'high' : 'medium',
          title: `${soon.length} tender${soon.length > 1 ? 's' : ''} closing within 14 days`,
          detail: `${top.t.id} closes in ${top.days} day${top.days === 1 ? '' : 's'} — ${top.t.name}`,
          href: '/data',
        });
      }
    } catch { /* abaikan */ }
  }

  // 3) Invoice overdue + closing blockers (finance/management).
  if (financeRoles) {
    try {
      const snap = await getFinanceSnapshot();
      const overdue = snap.invoices.filter((i) => i.status === 'OVERDUE');
      if (overdue.length) {
        items.push({
          id: 'invoice-overdue',
          severity: 'high',
          title: `${overdue.length} overdue invoice${overdue.length > 1 ? 's' : ''}`,
          detail: overdue.slice(0, 3).map((i) => `${i.id} (${i.partner})`).join(' · '),
          href: '/data',
        });
      }
      const open = snap.checklist.filter((c) => !c.done);
      if (open.length) {
        items.push({
          id: 'closing-open',
          severity: 'medium',
          title: `${open.length} closing items still open`,
          detail: `Next: ${open[0].item}`,
          href: '/data',
        });
      }
    } catch { /* abaikan */ }
  }

  // 4) Weekly digest management — tiap Senin: ringkasan lintas-domain read-only.
  if (user.role === 'management' && new Date().getDay() === 1) {
    try {
      const [t, f, o] = await Promise.all([
        getTenders().catch(() => null),
        getFinanceSnapshot().catch(() => null),
        getOpsSnapshot({ id: user.id, role: user.role }).catch(() => null),
      ]);
      const active = t?.rows.filter((r) => !['Won', 'Lost'].includes(r.status)).length ?? 0;
      const overdue = f?.invoices.filter((i) => i.status === 'OVERDUE').length ?? 0;
      const open = f?.checklist.filter((c) => !c.done).length ?? 0;
      const extracting = o?.docs.byStatus.Processing ?? 0;
      items.push({
        id: 'weekly-digest',
        severity: 'info',
        title: 'Monday executive digest',
        detail: `${active} active tenders · ${overdue} overdue invoices · ${open} closing items open · ${extracting} docs extracting`,
        href: '/conversation',
      });
    } catch { /* abaikan */ }
  }

  // 5) Dokumen masih extracting (ops/management).
  if (opsRoles) {
    try {
      const docs = await documents.list(user.role);
      const stuck = docs.filter((d) => d.status === 'Processing');
      if (stuck.length) {
        items.push({
          id: 'docs-processing',
          severity: 'info',
          title: `${stuck.length} document${stuck.length > 1 ? 's' : ''} still extracting`,
          detail: stuck.slice(0, 3).map((d) => d.fileName).join(' · '),
          href: '/documents',
        });
      }
    } catch { /* abaikan */ }
  }

  res.json({ items });
});

export default r;
