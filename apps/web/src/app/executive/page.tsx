'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, PageHeader, Status } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/store';
import { formatMoney, type Tender } from '@street-smart/shared';

interface FinanceSnap { invoices: { id: string; direction: string; amountCents: number; currency: string; status: string; partner: string }[]; checklist: { id: string; item: string; done: boolean }[] }
interface Inbox { awaiting: { id: string; title: string }[]; mine: unknown[] }
interface Notice { id: string; severity: 'high' | 'medium' | 'info'; title: string; detail: string; href: string }

export default function ExecutivePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [tenders, setTenders] = useState<Tender[] | null>(null);
  const [finance, setFinance] = useState<FinanceSnap | null>(null);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);

  const load = useCallback(async () => {
    const [t, f, i, n] = await Promise.all([
      api.get<Tender[] | null>('/api/tenders', null),
      api.get<FinanceSnap | null>('/api/finance/overview', null),
      api.get<Inbox | null>('/api/drafts/inbox', null),
      api.get<{ items: Notice[] }>('/api/notifications', { items: [] }),
    ]);
    setTenders(t);
    setFinance(f);
    setInbox(i);
    setNotices(n.items ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Khusus management (server tetap enforcement per endpoint).
  if (user && user.role !== 'management') {
    return <Shell title="Executive overview"><div className="content-page page-scroll">
      <PageHeader title="Executive overview" subtitle="Cross-domain snapshot for decision makers." />
      <div className="dataset"><div className="table-title">Not available for your role</div>
        <div className="table-subtitle">Signed in as {user.name} ({user.role}). This read-only overview is visible to management.</div></div>
    </div></Shell>;
  }

  if (tenders === null || finance === null) {
    return <Shell title="Executive overview"><div className="content-page page-scroll">
      <PageHeader title="Executive overview" subtitle="Cross-domain snapshot for decision makers." />
      <div className="dataset"><div className="table-title">Database tidak terjangkau</div>
        <div className="table-subtitle">Tidak ada angka palsu yang ditampilkan. Periksa koneksi API lalu muat ulang.</div>
        <div className="action-row"><Button variant="primary" onClick={() => { load(); toast('Retrying…'); }}>Retry</Button></div></div>
    </div></Shell>;
  }

  const active = tenders.filter((t) => !['Won', 'Lost'].includes(t.status));
  const overdue = finance.invoices.filter((i) => i.status === 'OVERDUE');
  const openClose = finance.checklist.filter((c) => !c.done);
  const awaiting = inbox?.awaiting ?? [];
  const openAR = finance.invoices.filter((i) => i.direction === 'AR' && i.status !== 'PAID');
  const openAP = finance.invoices.filter((i) => i.direction === 'AP' && i.status !== 'PAID');
  const cents = (rows: typeof openAR) => rows.reduce((a, i) => a + i.amountCents, 0);
  const cur = finance.invoices[0]?.currency ?? 'NZD';

  return <Shell title="Executive overview">
    <div className="content-page page-scroll">
      <PageHeader title="Executive overview" subtitle="Read-only cross-domain snapshot — decisions stay in My inbox." action={<Link className="btn btn-primary" href="/conversation">Ask Management Assistant</Link>} />
      <div className="summary-row">
        <div className="summary-card"><span>Active tenders</span><strong>{active.length}</strong><small>of {tenders.length} tracked</small></div>
        <div className="summary-card"><span>Overdue invoices</span><strong>{overdue.length}</strong><small>AR/AP combined</small></div>
        <div className="summary-card"><span>Closing items open</span><strong>{openClose.length}</strong><small>of {finance.checklist.length} checklist</small></div>
      </div>
      <div className="table-card" style={{ marginBottom: 14 }}>
        <div className="table-toolbar"><div><div className="table-title">Needs your decision</div><div className="table-subtitle">Maker-checker queue — you are the final approver</div></div><Link className="btn btn-secondary" href="/inbox">Open inbox</Link></div>
        {awaiting.length === 0
          ? <div className="table-subtitle">Nothing awaiting — you are all caught up.</div>
          : <div className="job-list">{awaiting.slice(0, 5).map((d) => <div className="job-row" key={d.id}>
            <div className="job-main"><div className="job-icon"><Icon name="file" /></div><div><div className="job-name">{d.title}</div></div></div>
            <div className="job-status"><Status tone="blue">in_review</Status></div>
          </div>)}</div>}
      </div>
      <div className="report-grid">
        <div className="table-card country-card"><div className="table-title">Finance snapshot</div><div className="table-subtitle">Aggregate only, live from invoices</div>
          <div className="country-row"><div><span>Open AR</span><strong>{formatMoney(cents(openAR), cur)}</strong></div></div>
          <div className="country-row"><div><span>Open AP</span><strong>{formatMoney(cents(openAP), cur)}</strong></div></div>
          <div className="country-row"><div><span>Overdue</span><strong>{overdue.length} invoice{overdue.length === 1 ? '' : 's'}</strong></div><div className="country-track"><i style={{ width: `${finance.invoices.length ? Math.round((overdue.length / finance.invoices.length) * 100) : 0}%` }} /></div></div>
          <div className="country-row"><div><span>Closing</span><strong>{openClose.length} open</strong></div><div style={{ marginLeft: 'auto' }}><Link className="btn btn-ghost" href="/finance">Details</Link></div></div>
        </div>
        <div className="table-card country-card"><div className="table-title">Signals</div><div className="table-subtitle">Live notifications for your role</div>
          {notices.length === 0 && <div className="table-subtitle">All quiet — no action needed right now.</div>}
          {notices.slice(0, 6).map((x) => <div className="country-row" key={x.id}><div><span>{x.severity.toUpperCase()}</span><strong>{x.title}</strong></div><div style={{ marginLeft: 'auto' }}><Link className="btn btn-ghost" href={x.href}>Open</Link></div></div>)}
        </div>
      </div>
    </div>
  </Shell>;
}
